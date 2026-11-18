<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { renderPage } from '#lib/core/pdf-render.ts';
  import { stackPages, pageAt, pagesIn, pageWidth } from '#lib/core/reader-layout.ts';

  // A scrolling column of PDF pages drawn with pdf.js (the engine the studio uses), because phone browsers cannot show a PDF inside a frame.
  // Only the pages on or near the screen are drawn, and ones far away are let go again, so a long document stays light on a phone.
  // The reader fills the box its parent gives it and scrolls inside it. `current` is the page being read, and is where it opens.
  let { doc, current = $bindable(1), label }: { doc: PDFDocumentProxy; current?: number; label: string } = $props();

  const PAD = 10, GAP = 12, MAX_W = 980, MAX_PX = 2600;
  let scroller = $state<HTMLDivElement>();
  let room = $state(0);                                   // the scrolling box's width
  let sizes = $state.raw<{ w: number; h: number }[]>([]);  // each page's own shape, so empty pages hold the right space before they are drawn
  let failed = $state('');

  const total = $derived(doc.numPages);
  const pw = $derived(pageWidth(room, room < 520 ? 8 : 16, MAX_W));
  const heights = $derived(sizes.map((s) => (pw ? Math.round((pw * s.h) / s.w) : 0)));
  const layout = $derived(stackPages(heights, GAP, PAD));

  const hosts: (HTMLDivElement | undefined)[] = [];
  const drawn = new Map<number, 'busy' | 'done' | 'bad'>();
  let gen = 0, active = 0, raf = 0;
  let queue: number[] = [];

  // Learn each page's shape (no drawing yet), a few at a time so the screen stays responsive.
  $effect(() => {
    const d = doc; let cancelled = false;
    sizes = []; failed = '';
    (async () => {
      try {
        const out: { w: number; h: number }[] = [];
        for (let n = 1; n <= d.numPages; n++) {
          const p = await d.getPage(n), v = p.getViewport({ scale: 1 });
          out.push({ w: v.width, h: v.height }); p.cleanup();
          if (cancelled) return;
          if (n % 25 === 0) await new Promise((r) => setTimeout(r));
        }
        if (!cancelled) sizes = out;
      } catch { if (!cancelled) failed = 'This PDF could not be shown here. Download it to open it in another app.'; }
    })();
    return () => { cancelled = true; };
  });

  function forget(i: number) {
    const host = hosts[i], canvas = host?.querySelector('canvas');
    if (canvas) canvas.width = 0;   // frees the picture's memory at once
    host?.replaceChildren(); drawn.delete(i);
  }
  /** Drop every drawn page (the width changed, so they are the wrong size) and any drawing still in progress. */
  function reset() { gen++; queue = []; for (const i of [...drawn.keys()]) forget(i); }

  async function draw(i: number) {
    const mine = gen, base = sizes[i];
    drawn.set(i, 'busy'); active++;
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const canvas = await renderPage(doc, i + 1, { scale: Math.min((pw * dpr) / base.w, MAX_PX / base.w) });
      const host = hosts[i];
      if (mine !== gen || !host) { canvas.width = 0; if (mine === gen) drawn.delete(i); return; }   // the layout changed meanwhile: that page was already let go
      canvas.setAttribute('aria-hidden', 'true');
      host.replaceChildren(canvas); drawn.set(i, 'done');
    } catch {
      if (mine === gen) { drawn.set(i, 'bad'); hosts[i]?.replaceChildren(Object.assign(document.createElement('span'), { className: 'bad', textContent: 'This page could not be drawn.' })); }
    } finally { active--; pump(); }
  }
  function pump() { while (active < 2 && queue.length) { const i = queue.shift()!; if (!drawn.has(i)) void draw(i); } }

  /** Work out which page is being read, draw the pages around it and let go of the ones far away. */
  function scan() {
    raf = 0;
    const el = scroller;
    if (!el || !pw || !sizes.length) return;
    const top = el.scrollTop, h = el.clientHeight, l = layout;
    const reading = pageAt(l, top + h * 0.3) + 1;
    if (reading !== current) current = reading;
    const keep = pagesIn(l, top - h * 3, top + h * 4);
    for (const [i, s] of [...drawn]) if (s === 'done' && (!keep || i < keep[0] || i > keep[1])) forget(i);
    const near = pagesIn(l, top - h * 1.2, top + h * 2.2);
    if (!near) return;
    const mid = pageAt(l, top + h / 2), want: number[] = [];
    for (let i = near[0]; i <= near[1]; i++) if (!drawn.has(i)) want.push(i);
    queue = want.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));   // the page in the middle of the screen first
    pump();
  }
  const onscroll = () => { raf ||= requestAnimationFrame(scan); };

  // A new document, or a new page width (turning the phone): start the pages again and stay on the page being read.
  $effect(() => {
    const l = layout;
    if (!scroller || !l.tops.length) return;
    untrack(() => {
      reset();
      const at = Math.min(Math.max(current, 1), l.tops.length) - 1;
      void tick().then(() => { if (!scroller) return; scroller.scrollTop = Math.max(0, l.tops[at] - PAD); scan(); });
    });
  });
  onMount(() => () => { gen++; cancelAnimationFrame(raf); });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- A scrolling area must be reachable by keyboard, so the arrow and Page keys can scroll it. -->
<div class="reader" bind:this={scroller} bind:clientWidth={room} {onscroll} tabindex="0" role="region" aria-label={label}>
  {#if failed}
    <p class="msg" role="alert">{failed}</p>
  {:else if !sizes.length}
    <p class="msg" role="status">Opening pages…</p>
  {:else}
    <div class="col">
      {#each sizes as _, i (i)}
        <div class="pg" bind:this={hosts[i]} data-n={i + 1} style="width:{pw}px;height:{heights[i]}px" role="img" aria-label="Page {i + 1} of {total}"></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .reader { flex: 1 1 auto; min-height: 0; height: 100%; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; background: color-mix(in srgb, var(--ink) 9%, var(--paper)); outline-offset: -2px; }
  .col { padding: 10px 0; }
  .pg { position: relative; margin: 0 auto 12px; background: #fff; box-shadow: 0 1px 8px rgb(0 0 0 / .28); }
  .pg:last-child { margin-bottom: 0; }
  .pg:empty::before { content: attr(data-n); position: absolute; inset: 0; display: grid; place-items: center; color: #9aa0a6; font-size: 1.4rem; }
  .pg :global(canvas) { display: block; width: 100%; height: 100%; }
  .pg :global(.bad) { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; text-align: center; color: #5f6368; }
  .msg { margin: 0; padding: 24px 16px; text-align: center; color: var(--muted); }
</style>