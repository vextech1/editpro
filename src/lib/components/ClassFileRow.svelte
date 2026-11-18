<script lang="ts">
  import { onMount } from 'svelte';
  import { fileViewerHref } from '#lib/core/cloud-library.ts';
  import { categoryLabel, fmtAdded, isRecent, shareLink, type ClassFile } from '#lib/core/class-library.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { downloadErrorMessage } from '#lib/core/cloud-library.ts';
  import { saveCloudFile } from '#lib/cloud/firebase.ts';
  import { requestAccess } from '#lib/cloud/member.svelte.ts';
  import { reportHref } from '#lib/core/moderation.ts';
  import { SITE } from '#lib/site.ts';
  /** pagePath: the class page this file is on, used for the Share link. */
  let { file, pagePath, classTitle = '', classHref = '' }: { file: ClassFile; pagePath: string; classTitle?: string; classHref?: string } = $props();
  // "New" is worked out on the visitor's device (not at build time), so it fades on its own without a redeploy.
  let now = $state(0);
  onMount(() => { now = Date.now(); });
  const fresh = $derived(now > 0 && isRecent(file.added, now));
  // Uploaded files are read from Firestore piece by piece, then saved to the device.
  let progress = $state(''); let failed = $state('');
  async function getCloud() {
    if (!file.cloud || progress) return;
    failed = ''; progress = 'Preparing…';
    try {
      if (!(await requestAccess({ id: file.cloud.id, title: file.title, uploader: file.uploader }, () => void getCloud()))) return;
      await saveCloudFile({ name: file.name, ext: file.ext, size: file.size, cloud: file.cloud }, (d, t) => (progress = t > 1 ? `Downloading ${Math.round((d / t) * 100)}%` : 'Downloading…'));
    } catch (e) { failed = downloadErrorMessage(e); }
    finally { progress = ''; }
  }
  const detail = $derived([categoryLabel(file.category, file.label), file.ext.toUpperCase(), fmtBytes(file.size), fmtAdded(file.added)].filter(Boolean).join(' · '));
  const viewerHref = $derived(file.cloud ? fileViewerHref(file.cloud.id) : '#');
</script>

<li class="row">
  <span class="mark" aria-hidden="true">{file.ext.slice(0, 4).toUpperCase()}</span>
  <div class="grow">
    <a class="name" href={viewerHref}>{file.title}</a>
  {#if fresh} <span class="new">New</span>{/if}
    <div class="sub">{#if classTitle}<a href={classHref}>{classTitle}</a><span aria-hidden="true">&nbsp;·&nbsp;</span>{/if}<span>{detail}</span></div>
    {#if file.student}<div class="sub">Shared by a student</div>{/if}
    {#if failed}<div class="sub err" role="alert">{failed}</div>{/if}
  </div>
  <div class="actions">
  <a class="btn small" href={viewerHref} aria-label={`Open ${file.title}`}>Open</a>
  {#if file.student && file.cloud}<a class="share" href={reportHref(SITE.contactEmail, { id: file.cloud.id, title: file.title })} aria-label={`Report ${file.title}`}>Report</a>{/if}
  <a class="share" href={shareLink(file.title, pagePath)} target="_blank" rel="noopener noreferrer" aria-label={`Share ${file.title} on WhatsApp`}>Share</a>
  <button class="btn small" type="button" onclick={getCloud} disabled={!!progress} aria-label={`Download ${file.title}`}>{progress || (failed ? 'Try again' : 'Download')}</button>
  </div>
</li>

<style>
  .name { color: var(--ink); font-weight: 650; text-decoration: none; }
  .name:hover { text-decoration: underline; }
  .err { color: var(--warn); }
  .sub a { color: var(--muted); }
  .btn { text-decoration: none; flex: none; }
  .new { font-size: .7rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; background: var(--accent); color: var(--accent-ink); padding: 1px 7px; border-radius: 999px; vertical-align: middle; }
  .actions { display: flex; align-items: center; gap: 10px; flex: none; }
  /* On a phone the title gets the full width and the buttons sit under it, instead of squeezing the name into a few letters. */
  @media (max-width: 560px) {
    :global(.row) { flex-wrap: wrap; }
    :global(.row .grow) { flex-basis: calc(100% - 60px); }
    .actions { flex: 1 0 100%; justify-content: flex-end; }
  }
  .share { flex: none; color: var(--muted); font-size: .9rem; text-decoration: none; padding: 6px 4px; }
  .share:hover { color: var(--ink); text-decoration: underline; }
</style>
