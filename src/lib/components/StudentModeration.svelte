<script lang="ts">
  import { onMount } from 'svelte';
  import { deleteFileRecord, getUserUploadsOpen, listStudentFiles, previewStudentFile, pullFile, retryFilePieces, setUserUploadsOpen, studentUsage } from '#lib/cloud/moderation.ts';
  import { REASON_CHOICES, checkReason } from '#lib/core/moderation.ts';
  import { categoryLabel } from '#lib/core/class-library.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import type { UserFile, UserFileStatus } from '#lib/core/user-library.ts';

  /** Called with how much room the live student documents take, so the admin page can count them in its storage meter. */
  let { onUsage }: { onUsage?: (u: { bytes: number; count: number }) => void } = $props();
  let tab = $state<UserFileStatus>('live'); let files = $state<UserFile[]>([]); let loading = $state(true); let busy = $state(false);
  let uploadsOpen = $state(true); let problem = $state(''); let note = $state(''); let pulling = $state<UserFile>(); let reason = $state('');
  let preview = $state<{ id: string; url: string; text: string; kind: string }>();
  const tabs: { id: UserFileStatus; label: string }[] = [{ id: 'live', label: 'Live' }, { id: 'pulled', label: 'Pulled' }, { id: 'uploading', label: 'Unfinished' }];
  async function refresh() {
    loading = true; problem = '';
    try {
      const [found, open, usage] = await Promise.all([listStudentFiles(tab), getUserUploadsOpen(), studentUsage()]);
      files = found; uploadsOpen = open; onUsage?.(usage);
    }
    catch { problem = 'Student documents could not be loaded. Check Firebase permissions and try again.'; }
    finally { loading = false; }
  }
  onMount(() => { void refresh(); return () => closePreview(); });
  function closePreview() { if (preview) URL.revokeObjectURL(preview.url); preview = undefined; }
  async function choose(next: UserFileStatus) { tab = next; pulling = undefined; closePreview(); await refresh(); }
  async function toggleUploads() {
    busy = true; problem = ''; note = '';
    try { await setUserUploadsOpen(!uploadsOpen); uploadsOpen = !uploadsOpen; note = uploadsOpen ? 'Student uploads are open.' : 'Student uploads are paused.'; }
    catch { problem = 'The upload setting could not be changed. Check Firebase permissions.'; }
    finally { busy = false; }
  }
  async function show(file: UserFile) {
    busy = true; closePreview(); problem = '';
    try {
      const blob = await previewStudentFile(file); const kind = file.ext === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg'].includes(file.ext) ? 'image' : file.ext === 'txt' ? 'text' : 'file';
      preview = { id: file.id, url: URL.createObjectURL(blob), kind, text: kind === 'text' ? await blob.text() : '' };
    } catch { problem = 'The document preview could not be loaded.'; }
    finally { busy = false; }
  }
  async function confirmPull() {
    if (!pulling) return;
    const checked = checkReason(reason); if (!checked.ok) { problem = checked.problem; return; }
    busy = true; problem = ''; note = '';
    try {
      const file = pulling; const result = await pullFile(file, checked.reason); pulling = undefined; closePreview(); await refresh();
      note = `“${file.title}” was removed and its uploader was notified.${result.cleaned ? '' : ' Stored pieces still need cleanup; retry in the Pulled tab.'}`;
    } catch { problem = 'The document could not be removed. Try again.'; }
    finally { busy = false; }
  }
  async function retry(file: UserFile) {
    busy = true; problem = '';
    try { if (await retryFilePieces(file)) { note = 'Stored pieces were deleted.'; await refresh(); } else problem = 'Stored pieces could not be deleted. Try again later.'; }
    catch { problem = 'Cleanup could not be completed.'; }
    finally { busy = false; }
  }
  async function remove(file: UserFile) {
    if (!confirm(`Delete the record for “${file.title}”?`)) return;
    busy = true; problem = '';
    try { await deleteFileRecord(file); await refresh(); note = 'Record deleted.'; }
    catch { problem = 'The record could not be deleted.'; }
    finally { busy = false; }
  }
</script>

<section class="moderation card">
  <h2>Student documents</h2>
  <p class="muted">Review shared documents. Removing a live file hides it from students, removes its stored pieces and takes back its download credits.</p>
  <p><button class="btn small" type="button" onclick={toggleUploads} disabled={busy}>{uploadsOpen ? 'Pause student uploads' : 'Open student uploads'}</button> <span class="muted">Uploads are {uploadsOpen ? 'open' : 'paused'}.</span></p>
  <div class="tabs" role="group" aria-label="Student document status">{#each tabs as item (item.id)}<button class:on={tab === item.id} aria-pressed={tab === item.id} type="button" onclick={() => void choose(item.id)}>{item.label}</button>{/each}</div>
  {#if note}<p class="ok" role="status">{note}</p>{/if}{#if problem}<p class="warn" role="alert">{problem}</p>{/if}
  {#if loading}<p class="muted" role="status">Loading…</p>{:else if !files.length}<p class="muted">No documents in this status.</p>{:else}
    <ul class="rows">{#each files as file (file.id)}
      <li class="row col"><div class="grow"><strong>{file.title}</strong><div class="sub">{[categoryLabel(file.category), file.ext.toUpperCase(), fmtBytes(file.size), file.added].filter(Boolean).join(' · ')}</div><div class="sub">{file.section} / {file.cls}{file.subject ? ` / ${file.subject}` : ''} · uploader {file.uploader.slice(0, 8)}…</div>
        {#if file.status === 'pulled'}<div class="sub warn">{file.pulledReason ?? 'Removed'}{file.cleaned ? '' : ' · stored pieces remain'}</div>{/if}</div>
        <div class="actions">{#if file.status !== 'pulled'}<button class="btn small" type="button" onclick={() => void show(file)} disabled={busy}>Preview</button>{/if}{#if file.status === 'live'}<button class="btn small danger" type="button" onclick={() => { pulling = file; reason = ''; }} disabled={busy}>Remove…</button>{/if}{#if file.status === 'pulled' && !file.cleaned}<button class="btn small" type="button" onclick={() => void retry(file)} disabled={busy}>Retry cleanup</button>{/if}{#if file.status !== 'live'}<button class="btn small danger" type="button" onclick={() => void remove(file)} disabled={busy}>Delete record</button>{/if}</div>
        {#if preview?.id === file.id}<div class="panel">{#if preview.kind === 'pdf'}<iframe src={preview.url} title={file.title}></iframe>{:else if preview.kind === 'image'}<img src={preview.url} alt={file.title} />{:else if preview.kind === 'text'}<pre>{preview.text}</pre>{:else}<a href={preview.url} download={file.name}>Download for review</a>{/if}<button class="btn small" type="button" onclick={closePreview}>Close preview</button></div>{/if}
        {#if pulling?.id === file.id}<div class="panel"><label for="pull-reason"><strong>Reason shown to uploader</strong></label><div class="quick">{#each REASON_CHOICES as option (option)}<button class="chip" type="button" onclick={() => (reason = option)}>{option.split(':')[0].replace(/\.$/, '')}</button>{/each}</div><textarea id="pull-reason" rows="3" maxlength="500" bind:value={reason}></textarea><div class="actions"><button class="btn small danger" type="button" onclick={() => void confirmPull()} disabled={busy}>Remove and notify</button><button class="btn small" type="button" onclick={() => (pulling = undefined)} disabled={busy}>Cancel</button></div></div>{/if}
      </li>
    {/each}</ul>
  {/if}
</section>

<style>
  .tabs, .actions, .quick { display: flex; flex-wrap: wrap; gap: 8px; }.tabs { margin: 12px 0; }
  .tabs button, .chip { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--ink); cursor: pointer; }
  .tabs button.on { background: var(--accent); color: var(--accent-ink); }.row.col { flex-wrap: wrap; align-items: flex-start; }.sub { color: var(--muted); font-size: .88rem; }.warn { color: var(--warn); }.ok { color: var(--accent); }
  .panel { flex-basis: 100%; display: grid; gap: 10px; margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 6px; }
  iframe { width: 100%; height: min(60vh, 600px); border: 1px solid var(--line); } img { max-width: 100%; max-height: 60vh; object-fit: contain; justify-self: center; }
  pre { max-height: 40vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; } textarea { box-sizing: border-box; width: 100%; font: inherit; padding: 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
</style>
