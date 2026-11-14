<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { sendTo } from '#lib/workspace.svelte.ts';
  import { fileViewerHref } from '#lib/core/cloud-library.ts';
  import { categoryLabel, shareLink } from '#lib/core/class-library.ts';
  import { friendlyCloudError, mimeOf, type CloudFile } from '#lib/core/cloud-library.ts';
  import { fetchCloudFile, listCloudFiles, saveCloudFile } from '#lib/cloud/firebase.ts';
  import { fileKind } from '#lib/core/workspaces.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  let { data } = $props();

  let file = $state<CloudFile>();
  let content = $state<Blob>();
  let previewUrl = $state('');
  let textPreview = $state('');
  let loading = $state(true);
  let busy = $state(false);
  let progress = $state('');
  let problem = $state('');
  let generation = 0;
  const kind = $derived(file ? fileKind(mimeOf(file.ext)) : undefined);
  const studio = $derived(kind === 'pdf' ? 'Document Studio' : kind === 'image' ? 'Photo Studio' : '');
  const shareHref = $derived(file ? shareLink(file.title, fileViewerHref(file.id)) : '');

  onMount(() => {
    const loadId = ++generation;
    const id = page.url.searchParams.get('id');
    if (!id) { loading = false; problem = 'This file link is missing its ID.'; return; }
    void loadFile(id, loadId);
    return () => {
      generation++;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  });

  async function loadFile(id: string, loadId: number) {
    try {
      const entry = (await listCloudFiles()).find((item) => item.id === id);
      if (loadId !== generation) return;
      if (!entry) throw new Error('This Library file could not be found. It may have been removed.');
      const blob = await fetchCloudFile({ name: entry.name, ext: entry.ext, cloud: { id: entry.id, parts: entry.parts } });
      if (loadId !== generation) return;
      file = entry;
      content = blob;
      if (entry.ext === 'txt') textPreview = await blob.text();
      else if (entry.ext === 'pdf' || entry.ext === 'png' || entry.ext === 'jpg' || entry.ext === 'jpeg') previewUrl = URL.createObjectURL(blob);
      loading = false;
    } catch (e) {
      if (loadId !== generation) return;
      problem = friendlyCloudError((e as { code?: string })?.code, e instanceof Error ? e.message : 'The file could not be opened. Please try again.');
      loading = false;
    }
  }

  async function editFile() {
    if (!file || !content || !kind || busy) return;
    busy = true; problem = '';
    try {
      const studioId = kind === 'pdf' ? 'document' : 'image';
      const tab = kind === 'pdf' ? 'organize-pdf' : 'edit-image';
      await sendTo(studioId, [new File([content], file.name, { type: mimeOf(file.ext) })], tab);
    } catch {
      problem = 'Could not open this file in the studio. Please try again.';
      busy = false;
    }
  }

  async function downloadFile() {
    if (!file || busy) return;
    busy = true; progress = 'Preparing download…'; problem = '';
    try {
      await saveCloudFile({ name: file.name, ext: file.ext, cloud: { id: file.id, parts: file.parts } }, (done, total) => {
        progress = total > 1 ? `Downloading ${Math.round((done / total) * 100)}%` : 'Preparing download…';
      });
    } catch (e) {
      problem = friendlyCloudError((e as { code?: string })?.code, 'The download did not finish. Please try again.');
    } finally { busy = false; progress = ''; }
  }
</script>

<svelte:head>
  <title>{file ? `${file.title} | Library` : `Library file | ${data.meta.title}`}</title>
  <meta name="description" content={file ? `${file.title}, ${file.ext.toUpperCase()} file in the EditPro Class Library.` : data.meta.description} />
</svelte:head>

<p class="back"><a href="/class-library">← Library</a></p>
{#if loading}
  <p role="status" class="muted">Opening file…</p>
{:else if problem && !file}
  <section class="card empty"><h1>File unavailable</h1><p role="alert" class="warn">{problem}</p></section>
{:else if file}
  <div class="file-head">
    <div class="file-title"><p class="eyebrow">{categoryLabel(file.category)} · {file.ext.toUpperCase()} · {fmtBytes(file.size)}</p><h1>{file.title}</h1></div>
    <div class="actions">
      <button class="btn small" type="button" onclick={editFile} disabled={!kind || busy || !content} title={kind ? `Edit in ${studio}` : 'Studio editing is available for PDFs and images'}>{busy ? 'Working…' : kind ? `Edit in ${studio}` : 'Edit unavailable'}</button>
      <a class="btn small ghost" href={shareHref} target="_blank" rel="noopener noreferrer">Share</a>
      <button class="btn small ghost" type="button" onclick={downloadFile} disabled={busy}>{progress || 'Download'}</button>
    </div>
  </div>
  {#if problem}<p role="alert" class="warn">{problem}</p>{/if}
  {#if previewUrl && file.ext === 'pdf'}
    <iframe class="file-preview pdf" src={previewUrl} title={file.title}></iframe>
  {:else if previewUrl}
    <div class="image-wrap"><img class="file-preview image" src={previewUrl} alt={file.title} /></div>
  {:else if file.ext === 'txt'}
    <pre class="text-preview">{textPreview}</pre>
  {:else}
    <section class="card unavailable"><h2>Preview not available</h2><p class="muted">Download this {file.ext.toUpperCase()} file to open it in a compatible app.</p></section>
  {/if}
  {#if !kind}<p class="muted edit-note">Edit Studio currently supports PDF and image files.</p>{/if}
{/if}

<style>
  .back { margin: 0 0 18px; }
  .back a { color: var(--muted); }
  .file-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 18px; }
  .file-title { min-width: 0; }
  .file-title h1 { overflow-wrap: anywhere; }
  .eyebrow { color: var(--muted); font-size: .82rem; margin: 0 0 6px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; flex: none; }
  .file-preview.pdf { display: block; width: 100%; height: min(76vh, 900px); border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  .image-wrap { display: grid; place-items: center; min-height: 45vh; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
  .file-preview.image { display: block; max-width: 100%; max-height: 75vh; object-fit: contain; }
  .text-preview { max-height: 75vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); }
  .unavailable { margin-top: 16px; }
  .unavailable h2 { margin-top: 0; }
  .edit-note { margin-top: 10px; }
  @media (max-width: 640px) {
    .file-head { display: block; }
    .actions { justify-content: flex-start; }
  }
</style>