<script lang="ts">
  import { onMount } from 'svelte';
  import { categoryLabel, isRecent, shareLink, type ClassFile } from '#lib/core/class-library.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { friendlyCloudError } from '#lib/core/cloud-library.ts';
  import { saveCloudFile } from '#lib/cloud/firebase.ts';
  /** pagePath: the class page this file is on, used for the Share link. */
  let { file, pagePath, classTitle = '', classHref = '' }: { file: ClassFile; pagePath: string; classTitle?: string; classHref?: string } = $props();
  // "New" is worked out on the visitor's device (not at build time), so it fades on its own without a redeploy.
  let now = $state(0);
  onMount(() => { now = Date.now(); });
  const fresh = $derived(now > 0 && isRecent(file.added, now));
  // A file uploaded from the website is read from Firestore piece by piece, then saved to the device: no link, so a button.
  let progress = $state(''); let failed = $state('');
  async function getCloud() {
    if (!file.cloud || progress) return;
    failed = ''; progress = 'Preparing…';
    try { await saveCloudFile({ name: file.name, ext: file.ext, cloud: file.cloud }, (d, t) => (progress = t > 1 ? `Downloading ${Math.round((d / t) * 100)}%` : 'Downloading…')); }
    catch (e) { failed = friendlyCloudError((e as { code?: string })?.code, 'The download did not finish. Please try again.'); }
    finally { progress = ''; }
  }
  const detail = $derived([categoryLabel(file.category), file.ext.toUpperCase(), fmtBytes(file.size), file.added].filter(Boolean).join(' · '));
</script>

<li class="row">
  <span class="mark" aria-hidden="true">{file.ext.slice(0, 4).toUpperCase()}</span>
  <div class="grow">
    <button class="name linklike" type="button" onclick={getCloud}>{file.title}</button>
  {#if fresh} <span class="new">New</span>{/if}
    <div class="sub">{#if classTitle}<a href={classHref}>{classTitle}</a><span aria-hidden="true"> · </span>{/if}<span>{detail}</span></div>
    {#if failed}<div class="sub err" role="alert">{failed}</div>{/if}
  </div>
  <a class="share" href={shareLink(file.title, pagePath)} target="_blank" rel="noopener noreferrer" aria-label={`Share ${file.title} on WhatsApp`}>Share</a>
  <button class="btn small" type="button" onclick={getCloud} disabled={!!progress} aria-label={`Download ${file.title}`}>{progress || 'Download'}</button>
</li>

<style>
  .name { color: var(--ink); font-weight: 650; text-decoration: none; }
  .name:hover { text-decoration: underline; }
  .linklike { font: inherit; font-weight: 650; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
  .err { color: var(--warn); }
  .sub a { color: var(--muted); }
  .btn { text-decoration: none; flex: none; }
  .new { font-size: .7rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; background: var(--accent); color: var(--accent-ink); padding: 1px 7px; border-radius: 999px; vertical-align: middle; }
  .share { flex: none; color: var(--muted); font-size: .9rem; text-decoration: none; padding: 6px 4px; }
  .share:hover { color: var(--ink); text-decoration: underline; }
</style>
