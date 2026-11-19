<script lang="ts">
  import { page } from '$app/state';
  import { pushState } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { closePdf, openPdf } from '#lib/core/pdf-render.ts';
  import PdfReader from '#lib/components/PdfReader.svelte';
  import ReadingMode from '#lib/components/ReadingMode.svelte';
  import { sendTo } from '#lib/workspace.svelte.ts';
  import { fileViewerHref } from '#lib/core/cloud-library.ts';
  import { canShareNatively, categoryLabel, shareLink, shareNatively } from '#lib/core/class-library.ts';
  import { downloadErrorMessage, friendlyCloudError, mimeOf, type CloudFile } from '#lib/core/cloud-library.ts';
  import { fetchCloudFile, listCloudFiles, saveCloudFile } from '#lib/cloud/firebase.ts';
  import { getUserFile } from '#lib/cloud/user.ts';
  import { requestAccess } from '#lib/cloud/member.svelte.ts';
  import { reportHref } from '#lib/core/moderation.ts';
  import { SITE } from '#lib/site.ts';
  import AccessGate from '#lib/components/AccessGate.svelte';
  import { fileKind } from '#lib/core/workspaces.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  let { data } = $props();

  type ViewFile = CloudFile & { user?: boolean; uploader?: string };
  let file = $state<ViewFile>();
  let locked = $state(false);
  let content = $state<Blob>();
  let previewUrl = $state('');
  let textPreview = $state('');
  // A PDF is drawn with pdf.js (the studio's own engine): phone browsers cannot show a PDF inside a frame.
  let doc = $state.raw<PDFDocumentProxy>();
  let previewNote = $state('');
  let current = $state(1);   // the page being read, kept when switching between the preview and reading mode
  let loading = $state(true);
  let busy = $state(false);
  let progress = $state('');
  let problem = $state('');
  let generation = 0;
  const kind = $derived(file ? fileKind(mimeOf(file.ext)) : undefined);
  const studio = $derived(kind === 'pdf' ? 'Document Studio' : kind === 'image' ? 'Photo Studio' : '');
  const shareHref = $derived(file ? shareLink(file.title, fileViewerHref(file.id)) : '');
  // Share opens the phone's share sheet so the student can pick any app; with none available the link itself opens WhatsApp.
  function share(e: MouseEvent) {
    if (!file || !canShareNatively()) return;
    e.preventDefault();
    const { title, id } = file;
    void shareNatively(title, fileViewerHref(id)).then((r) => { if (r === 'failed') window.open(shareLink(title, fileViewerHref(id)), '_blank', 'noopener'); });
  }
  // Reading mode is a history entry, so the phone's Back button leaves reading instead of leaving the page.
  const reading = $derived(!!page.state.reading);
  const canRead = $derived(!!file && ((file.ext === 'pdf' && !!doc) || (file.ext === 'txt' && !!textPreview)));
  const startReading = () => pushState('', { reading: true });
  const exitReading = () => { if (page.state.reading) history.back(); };

  onMount(() => {
    const loadId = ++generation;
    const id = page.url.searchParams.get('id');
    if (!id) { loading = false; problem = 'This file link is missing its ID.'; return; }
    void loadFile(id, loadId);
    return () => {
      generation++;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (doc) closePdf(doc);
    };
  });

  async function showPdf(blob: Blob, loadId: number) {
    previewNote = '';
    try {
      const opened = await openPdf(new Uint8Array(await blob.arrayBuffer()));
      if (loadId !== generation) { closePdf(opened); return; }
      if (doc) closePdf(doc);
      doc = opened; current = 1;
    } catch (e) {
      if (loadId === generation) previewNote = e instanceof Error ? e.message : 'This PDF could not be shown here.';
    }
  }

  async function loadFile(id: string, loadId: number) {
    try {
      locked = false;
      let entry: ViewFile | undefined = (await listCloudFiles()).find((item) => item.id === id);
      if (loadId !== generation) return;
      if (!entry) {
        const shared = await getUserFile(id);
        if (loadId !== generation) return;
        if (shared?.status === 'pulled') throw new Error(`This file was removed from the Library.${shared.pulledReason ? ` Reason: ${shared.pulledReason}` : ''}`);
        if (shared?.status === 'live') entry = { ...shared, user: true };
      }
      if (!entry) throw new Error('This Library file could not be found. It may have been removed.');
      if (!(await requestAccess({ id: entry.id, title: entry.title, uploader: entry.uploader }, () => void loadFile(id, loadId)))) {
        if (loadId !== generation) return;
        file = entry; locked = true; loading = false; return;
      }
      if (loadId !== generation) return;
      const blob = await fetchCloudFile({ name: entry.name, ext: entry.ext, size: entry.size, cloud: { id: entry.id, parts: entry.parts, user: entry.user } });
      if (loadId !== generation) return;
      file = entry;
      content = blob;
      if (entry.ext === 'txt') textPreview = await blob.text();
      else if (entry.ext === 'pdf') await showPdf(blob, loadId);
      else if (entry.ext === 'png' || entry.ext === 'jpg' || entry.ext === 'jpeg') previewUrl = URL.createObjectURL(blob);
      if (loadId !== generation) return;
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
      await saveCloudFile({ name: file.name, ext: file.ext, size: file.size, cloud: { id: file.id, parts: file.parts, user: file.user } }, (done, total) => {
        progress = total > 1 ? `Downloading ${Math.round((done / total) * 100)}%` : 'Preparing download…';
      });
    } catch (e) {
      problem = downloadErrorMessage(e);
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
{:else if file && locked}
  <section class="card empty">
    <p class="eyebrow">{categoryLabel(file.category, file.label)} · {file.ext.toUpperCase()} · {fmtBytes(file.size)}</p>
    <h1>{file.title}</h1>
    <p class="muted">Your first download is free. To open more files, sign in with Google and share a study document to unlock more downloads.</p>
    <button class="btn" type="button" onclick={() => { loading = true; void loadFile(file!.id, ++generation); }}>Continue</button>
  </section>
{:else if file}
  <div class="file-head">
    <div class="file-title"><p class="eyebrow">{categoryLabel(file.category, file.label)} · {file.ext.toUpperCase()} · {fmtBytes(file.size)}</p><h1>{file.title}</h1></div>
    <div class="actions">
      {#if canRead}<button class="btn small" type="button" onclick={startReading}>Read</button>{/if}
      <button class="btn small {canRead ? 'ghost' : ''}" type="button" onclick={editFile} disabled={!kind || busy || !content} title={kind ? `Edit in ${studio}` : 'Studio editing is available for PDFs and images'}>{busy ? 'Working…' : kind ? `Edit in ${studio}` : 'Edit unavailable'}</button>
      <a class="btn small ghost" href={shareHref} target="_blank" rel="noopener noreferrer" onclick={share}>Share</a>
      {#if file.user}<a class="btn small ghost" href={reportHref(SITE.contactEmail, { id: file.id, title: file.title })}>Report</a>{/if}
      <button class="btn small ghost" type="button" onclick={downloadFile} disabled={busy}>{progress || 'Download'}</button>
    </div>
  </div>
  {#if problem}<p role="alert" class="warn">{problem}</p>{/if}
  {#if file.ext === 'pdf'}
    {#if doc}
      {#if !reading}<div class="pdf-box"><PdfReader {doc} bind:current label="{file.title}, preview" /></div>{/if}
    {:else}
      <section class="card unavailable"><h2>Preview not available</h2><p class="muted">{previewNote || 'This PDF could not be shown here.'} You can still download it or edit it in the studio.</p></section>
    {/if}
  {:else if previewUrl}
    <div class="image-wrap"><img class="file-preview image" src={previewUrl} alt={file.title} /></div>
  {:else if file.ext === 'txt'}
    <pre class="text-preview">{textPreview}</pre>
  {:else}
    <section class="card unavailable"><h2>Preview not available</h2><p class="muted">Download this {file.ext.toUpperCase()} file to open it in a compatible app.</p></section>
  {/if}
  {#if !kind}<p class="muted edit-note">Edit Studio currently supports PDF and image files.</p>{/if}
  {#if reading && canRead}
    <ReadingMode title={file.title} status={doc ? `Page ${current} of ${doc.numPages}` : ''} onexit={exitReading}>
      {#if doc}
        <PdfReader {doc} bind:current label={file.title} />
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="read-text" tabindex="0" role="region" aria-label={file.title}><pre>{textPreview}</pre></div>
      {/if}
    </ReadingMode>
  {/if}
{/if}
<AccessGate />

<style>
  .back { margin: 0 0 18px; }
  .back a { color: var(--muted); }
  .file-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 18px; }
  .file-title { min-width: 0; }
  .file-title h1 { overflow-wrap: anywhere; }
  .eyebrow { color: var(--muted); font-size: .82rem; margin: 0 0 6px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; flex: none; }
  .pdf-box { display: flex; flex-direction: column; height: min(76vh, 900px); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--card); }
  .read-text { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px 18px 40px; background: var(--paper); }
  .read-text pre { margin: 0 auto; max-width: 68ch; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 1.1rem; line-height: 1.65; color: var(--ink); }
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