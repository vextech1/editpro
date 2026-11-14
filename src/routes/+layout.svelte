<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import { getSessions } from '#lib/core/session.ts';
  import { getRetentionDays } from '#lib/core/settings.ts';
  import { activeWork } from '#lib/active.svelte.ts';
  import { adPage, loadSiteAds } from '#lib/ads.ts';
  import { installApp } from '#lib/install.svelte.ts';
  import { requestPersist } from '#lib/core/persist.ts';
  import UpdateToast from '#lib/components/UpdateToast.svelte';
  import { goto } from '$app/navigation';
  import { planIncoming } from '#lib/core/incoming.ts';
  import { setPending } from '#lib/core/handoff.ts';
  import { listenForLaunchFiles } from '#lib/launch.ts';
  import { toolMeta, workspaceMeta, pageMeta, type PageMeta } from '#lib/seo.ts';
  import type { Tool } from '#lib/tools.ts';
  import type { Workspace } from '#lib/core/workspaces.ts';
  let { children } = $props();
  const links = [
    ['/', 'Home', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    ['/tools', 'Tools', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
    ['/class-library', 'Library', 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z'],
    ['/library', 'My files', 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    ['/settings', 'Settings', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.5z']
  ] as const;
  const isCurrent = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href) || (href === '/tools' && page.url.pathname.startsWith('/studio')));
  // Work that has not been touched for the chosen number of days is removed (pinned work stays). Then any work whose saved
  // bytes have gone missing (an interrupted save, cleared or evicted storage) is repaired, and leftover bytes are swept up.
  onMount(async () => {
    installApp.init();   // listen early: the browser fires its install prompt only once
    listenForLaunchFiles(async (files) => { const p = await planIncoming(files); if (p.to) { setPending(p.files); await goto(p.to); } });
    try {
      const s = getSessions();
      await s.purgeExpired(getRetentionDays());
      await s.healAll();
      void s.sweepBlobs().catch(() => { /* leftovers are harmless; try again next time */ });
    } catch { /* storage unavailable */ }
    await activeWork.refresh();   // after the purge and repair, so expired or empty work is forgotten
  });
  // Once the app is installed, ask the browser to protect saved files. Installed apps are usually granted this without a prompt.
  $effect(() => { if (installApp.mode === 'installed') void requestPersist(); });
  // The social bar loads once, the first time an ad page is shown.
  $effect(() => { if (adPage(page.url.pathname)) loadSiteAds(); });
  const path = $derived(page.url.pathname === '/' ? '/' : page.url.pathname.replace(/\/$/, ''));
  const canonical = $derived(SITE.origin + path);
  // Link previews use the same title and description the page itself shows (see seo.ts). Tool and studio pages carry
  // theirs in page data; other pages are looked up by path; anything unlisted falls back to the site name.
  const share = $derived.by((): PageMeta => {
    const d = page.data as { tool?: Tool; workspace?: Workspace; meta?: PageMeta };
    if (d?.meta) return d.meta;
    if (d?.tool) return toolMeta(d.tool);
    if (d?.workspace) return workspaceMeta(d.workspace);
    return pageMeta[path] ?? { title: SITE.name, description: SITE.tagline };
  });
  const ogTitle = $derived(share.title);
  const ogDescription = $derived(share.description);
</script>
<svelte:head>
  <link rel="canonical" href={canonical} />
  <meta property="og:site_name" content={SITE.name} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:image" content={SITE.origin + '/og-image.png'} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="EditPro: edit PDFs and photos on the go. Scan, convert, frame and more." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:description" content={ogDescription} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a class="skip" href="#main">Skip to main content</a>
<UpdateToast />
<header class="site"><div class="wrap">
  <a class="brand" href="/">{SITE.name}</a>
  <nav class="top" aria-label="Main">
    {#each links as [href, label]}
      <a {href} aria-current={isCurrent(href) ? 'page' : undefined}>{label}</a>
    {/each}
  </nav>

</div></header>
<main id="main" tabindex="-1"><div class="wrap">{@render children()}</div></main>
<footer class="site"><div class="wrap">
  <p class="popular"><strong>Popular tools:</strong> <a href="/tools/merge-pdf">Merge PDF</a><a href="/tools/split-pdf">Split PDF</a><a href="/tools/compress-pdf">Compress PDF</a><a href="/tools/pdf-to-docx">PDF to Word</a><a href="/tools/pdf-to-images">PDF to images</a><a href="/tools/scan-document">Scan documents</a><a href="/tools/extract-text">Extract text (OCR)</a><a href="/tools/resize-image">Resize image</a></p>
  <a href="/tools">Free tools</a><a href="/class-library">Library</a><a href="/library">My files</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a>
  <p>© 2026 {SITE.name}. Edit PDFs and photos on the go.</p>
</div></footer>
<nav class="bottom" aria-label="Main">
  {#each links as [href, label, d]}
    <a {href} aria-current={isCurrent(href) ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path {d} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <span>{label}</span>
    </a>
  {/each}
</nav>
