<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { takePending } from '#lib/core/handoff.ts';
  import { fmtBytes, baseName } from '#lib/core/format.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { readBytes, pdfBlob, pdfErrorMessage } from '#lib/core/files.ts';
  import { buildFromPages, type PageSpec } from '#lib/core/pdf-edit.ts';
  import { cropPdf, MM, pageSizes, readMeta, writeMeta, type Margins, type PdfMeta } from '#lib/core/pdf-tools.ts';
  import { ASPECTS, aspectRatio, fitAspect, type Rect } from '#lib/core/image-edit.ts';
  import { detectCropBox } from '#lib/core/auto-crop.ts';
  import { defaultStamp, stampPdf, type StampOptions } from '#lib/core/pdf-stamp.ts';
  import { watermarkPdf, defaultDraft, draftLayout, isWinAnsi, type WatermarkDraft, type WatermarkSource } from '#lib/core/pdf-watermark.ts';
  import { buildMark, paintMark } from '#lib/core/photo-render.ts';
  import { compressPdfImages, PRESETS, type PresetKey } from '#lib/core/pdf-compress.ts';
  import { jpegRecompressor, toBlob } from '#lib/core/image.ts';
  import { cropMarginsFor, initialPages, movePage, pageIndex, PDF_TAB_SHEET, removePage, rotatePage, type PdfSheetId } from '#lib/core/pdf-studio.ts';
  import { ALL_TOOLS_ID, PDF_GROUPS, dockButtons, groupTiles, soleTool, type ToolRow } from '#lib/core/studio-tools.ts';
  import { openInStudio } from '#lib/workspace.svelte.ts';
  import type { StageTransform } from '#lib/core/stage-gesture.ts';
  import Icon from './Icon.svelte';
  import StudioShell, { type ShellToast } from './StudioShell.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import CropOverlay from './CropOverlay.svelte';
  import Chips from './Chips.svelte';
  import GroupSheet from './GroupSheet.svelte';
  import AllToolsPanel from './AllToolsPanel.svelte';
  import PdfMergeSheet from './PdfMergeSheet.svelte';
  import PdfSplitSheet from './PdfSplitSheet.svelte';
  import PdfAddImagesSheet from './PdfAddImagesSheet.svelte';
  import PdfToImagesSheet from './PdfToImagesSheet.svelte';
  import PdfExtractSheet from './PdfExtractSheet.svelte';
  import PdfScanSheet from './PdfScanSheet.svelte';
  import PdfReadTextSheet from './PdfReadTextSheet.svelte';
  import PdfToWordSheet from './PdfToWordSheet.svelte';
  import PdfToTextSheet from './PdfToTextSheet.svelte';
  import PdfWatermarkSheet from './sheets/PdfWatermarkSheet.svelte';

  type Sheet = PdfSheetId;
  // `incoming` is what the studio hands in (files dropped on the editor, say): Merge or Add images opens already filled in, and a message becomes a toast.
  let { onclose, onremove, oncopy, saved, incoming = $bindable(null) }:
    { onclose: () => void; onremove: () => void; oncopy: () => void; saved: 'idle' | 'ok' | 'failed'; incoming?: { sheet?: 'merge' | 'addimages'; files?: File[]; message?: string } | null } = $props();
  const st = getStudio()!;
  const EMPTY_META: PdfMeta = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

  let canvas = $state<HTMLCanvasElement>();
  let pageW = $state(0); let pageH = $state(0);
  let source = $state<Uint8Array>();
  let pageTotal = $state(0);
  let current = $state(0);
  let pages = $state<PageSpec[]>([]);
  let sheet = $state<Sheet | null>(null);
  let busy = $state(false);
  let status = $state('');
  let bad = $state(false);
  let menu = $state(false);
  let group = $state<string | null>(null);   // the open dock group's sheet
  let allTools = $state(false);              // the All tools list
  let versions = $state(false);
  let downloadUrl = $state('');
  let meta = $state<PdfMeta>({ ...EMPTY_META });
  let originalMeta: PdfMeta = { ...EMPTY_META };
  let cropBox = $state<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  let cropShape = $state('free');
  let cropScope = $state<'all' | 'page'>('all');
  let cropNote = $state('');
  let detectPending = false;
  let sizes = $state<{ w: number; h: number }[]>([]);
  let stamp = $state<StampOptions>(defaultStamp());
  let wm = $state<WatermarkDraft>(defaultDraft());       // the Watermark sheet's settings
  let wmLogo = $state.raw<HTMLCanvasElement | null>(null);
  let pageBase: HTMLCanvasElement | null = null;          // the page as rendered, without the watermark preview on it
  let baseTick = $state(0);
  let previewing = false;
  let preset = $state<PresetKey>('balanced');
  let zoom = $state<StageTransform>({ scale: 1, x: 0, y: 0 });
  let stageW = $state(0); let stageH = $state(0);
  let token = 0;
  let mergeExtras = $state<File[]>([]);   // PDFs picked together with this one, waiting to be merged
  let imageExtras = $state<File[]>([]);   // pictures waiting to be added as pages
  let lastTab = '';

  const sourcePage = $derived(pages[current]?.index ?? 0);
  const paging = $derived(sheet === null || sheet === 'pages' || sheet === 'crop');
  const pageNote = $derived.by(() => {
    const p = pages[current]; if (!p) return '';
    const parts = [p.index !== current ? `original page ${p.index + 1}` : '', p.rotate ? `turned ${p.rotate}°` : ''].filter(Boolean);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  });
  // While Pages is being edited the list can differ from the file's own page count, so the pager counts the list.
  const shownTotal = $derived(pages.length || pageTotal);
  const currentLabel = $derived(pageTotal ? `${current + 1} of ${shownTotal}` : '');
  /** Sheets that need the open PDF's bytes and apply themselves, so the editor's own tick is not used for them. */
  const SELF_APPLYING: Sheet[] = ['merge', 'split', 'addimages', 'scan', 'toimages', 'extract', 'docx', 'text', 'ocr'];
  const DOCK = dockButtons(PDF_GROUPS);
  const groupDef = $derived(PDF_GROUPS.find((g) => g.id === group));
  const saveLabel = $derived(saved === 'ok' ? 'Saved to My files' : 'Save to My files');
  // With nothing open the message is shown in the stage itself, so it is not repeated as a toast.
  const toasts = $derived<ShellToast[]>(bad && pageTotal ? [{ text: status, alert: true }] : st.note ? [{ text: st.note }] : []);
  // True while the sheet snippet shows something (the Versions sheet waits for it to close).
  const hasSheet = $derived(!!group || sheet !== null && (!SELF_APPLYING.includes(sheet) || !!source));
  const cropPx = $derived.by((): Rect | null => {
    if (!pageW || !pageH) return null;
    const x = Math.round(cropBox.x * pageW), y = Math.round(cropBox.y * pageH);
    return { x, y, w: Math.min(Math.round(cropBox.w * pageW), pageW - x), h: Math.min(Math.round(cropBox.h * pageH), pageH - y) };
  });
  const cropWhole = $derived(!cropPx || (cropPx.x === 0 && cropPx.y === 0 && cropPx.w === pageW && cropPx.h === pageH));
  const cropAspect = $derived(cropShape === 'free' ? undefined : aspectRatio(cropShape, pageW, pageH));
  const cropMm = $derived.by(() => {
    const size = sizes[sourcePage];
    return size ? { w: Math.round(size.w * cropBox.w / MM), h: Math.round(size.h * cropBox.h / MM) } : null;
  });
  const pageDisplay = $derived.by(() => {
    if (!pageW || !pageH || stageW < 60 || stageH < 60) return { w: 0, h: 0 };
    const k = Math.min(1, (stageW - 24) / pageW, (stageH - 24) / pageH, 1100 / pageW);
    return { w: Math.max(1, Math.floor(pageW * k)), h: Math.max(1, Math.floor(pageH * k)) };
  });
  const currentName = () => st.file?.name ?? 'document.pdf';

  function paintRotated(input: HTMLCanvasElement, rotation: number) {
    if (!canvas) return;
    const turn = ((rotation % 360) + 360) % 360;
    canvas.width = turn % 180 ? input.height : input.width;
    canvas.height = turn % 180 ? input.width : input.height;
    pageW = canvas.width; pageH = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(input, -input.width / 2, -input.height / 2);
    pageBase = document.createElement('canvas'); pageBase.width = canvas.width; pageBase.height = canvas.height;
    pageBase.getContext('2d')!.drawImage(canvas, 0, 0);
    baseTick++;
  }

  async function renderCurrent(my: number, bytes: Uint8Array, spec: PageSpec) {
    let doc;
    try {
      doc = await openPdf(bytes);
      const image = await renderPage(doc, spec.index + 1, { maxSide: 1500 });
      if (my === token) {
        paintRotated(image, spec.rotate);
        if (detectPending) { detectPending = false; if (sheet === 'crop') detectEdges(); }
      }
      image.width = image.height = 0;
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, currentName()); }
    } finally { if (doc) closePdf(doc); }
  }

  async function loadFile(file: File) {
    const my = ++token;
    try {
      const bytes = await readBytes(file);
      const doc = await openPdf(bytes);
      const total = doc.numPages;
      closePdf(doc);
      if (my !== token) return;
      source = bytes; pageTotal = total; pages = initialPages(total); current = 0;
      zoom = { scale: 1, x: 0, y: 0 };
      sheet = null; bad = false; status = '';
      const waiting = takePending((f) => f.type === 'application/pdf').files;   // several PDFs picked at once mean a merge
      if (waiting.length) { mergeExtras = waiting; sheet = 'merge'; }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(file);
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, file.name); }
    }
  }

  $effect(() => {
    const file = st.file; void st.head;
    if (file) untrack(() => void loadFile(file));
  });
  $effect(() => {
    const bytes = source, p = pages[current], my = token;
    void p?.index; void p?.rotate;
    if (bytes && p && canvas) untrack(() => void renderCurrent(my, bytes, p));
  });
  // Opening a tab from elsewhere (Tools page tiles, the Next steps dialog) opens its sheet here.
  $effect(() => {
    const tab = st.tab; void source;
    if (!source) return;
    untrack(() => { if (tab !== lastTab) { lastTab = tab; const wanted = PDF_TAB_SHEET[tab]; if (wanted) choose(wanted); } });
  });
  $effect(() => { if (sheet !== 'merge') mergeExtras = []; });
  $effect(() => { if (sheet !== 'addimages') imageExtras = []; });
  $effect(() => {
    const inc = incoming;
    if (!inc || !source) return;
    untrack(() => {
      incoming = null;
      if (inc.sheet === 'merge') { mergeExtras = inc.files ?? []; choose('merge'); }
      else if (inc.sheet === 'addimages') { imageExtras = inc.files ?? []; choose('addimages'); }
      if (inc.message) { status = inc.message; bad = true; }   // after choose(), which clears any old message
    });
  });
  onMount(() => () => { token++; if (downloadUrl) URL.revokeObjectURL(downloadUrl); });

  /** The dock: a group opens its sheet (or its only tool), All tools opens the list. */
  function dockPick(id: string) {
    menu = false;
    if (id === ALL_TOOLS_ID) { group = null; allTools = true; return; }
    const g = PDF_GROUPS.find((x) => x.id === id); if (!g) return;
    const only = soleTool(g);
    if (only) choose(only); else group = g.id;
  }
  function choose(id: string) {
    group = null; allTools = false;
    sheet = id as Sheet; menu = false; status = ''; bad = false; if (id === 'info') void loadInfo();
    if (id === 'crop') void openCrop();
  }
  /** A row of the All tools list: this studio's tools open here, the other studio's go there. */
  function pickRow(row: ToolRow) {
    if (row.here) { choose(row.tool.id); return; }
    allTools = false;
    void openInStudio(row.studio, row.tool.slug!, st.file).catch(() => { bad = true; status = 'Could not open that tool.'; });
  }
  const toBox = (r: Rect): Rect => ({ x: r.x / pageW, y: r.y / pageH, w: r.w / pageW, h: r.h / pageH });
  /** Detected edges are cut right at the ink, so widen the box by about 1.5% of the page on each side (kept inside the page). */
  function padBox(b: Rect, pad = 0.015): Rect { const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad); return { x, y, w: Math.min(1, b.x + b.w + pad) - x, h: Math.min(1, b.y + b.h + pad) - y }; }
  function setCrop(r: Rect) { if (pageW && pageH) { cropBox = toBox(r); cropNote = ''; } }
  function pickShape(id: string) { cropShape = id; cropNote = ''; if (pageW && pageH) cropBox = toBox(fitAspect(pageW, pageH, aspectRatio(id, pageW, pageH))); }
  async function openCrop() {
    if (!source) return;
    const redraw = pages.length !== pageTotal || pages.some((p, i) => p.index !== i || p.rotate !== 0);
    if (redraw) { current = pageIndex(pages[current]?.index ?? 0, pageTotal); pages = initialPages(pageTotal); }
    cropShape = 'free'; cropScope = 'all'; cropBox = { x: 0, y: 0, w: 1, h: 1 }; cropNote = '';
    if (redraw) detectPending = true; else detectEdges();
    try { sizes = await pageSizes(source); } catch (e) { bad = true; status = pdfErrorMessage(e, currentName()); sheet = null; }
  }
  $effect(() => {
    void pageW; void pageH;
    untrack(() => { if (sheet === 'crop' && cropShape !== 'free' && pageW && pageH) pickShape(cropShape); });
  });
  function detectEdges() {
    if (!canvas || !pageW || !pageH) return;
    const found = detectCropBox(canvas);
    cropShape = 'free'; cropBox = found ? padBox(toBox(found)) : { x: 0, y: 0, w: 1, h: 1 };
    cropNote = found ? 'Edges found on this page. Drag the handles to adjust.' : 'No clear edges found on this page, so the whole page is selected.';
  }
  function cropMargins(): Margins | null { const size = sizes[sourcePage]; return size ? cropMarginsFor(cropBox, size) : null; }
  function applyCrop() { if (cropWhole) { sheet = null; return; } void apply(); }
  function reset() {
    if (!sheet) return;
    if (sheet === 'pages') { pages = initialPages(pageTotal); current = 0; }
    if (sheet === 'crop') { cropShape = 'free'; cropBox = { x: 0, y: 0, w: 1, h: 1 }; cropNote = ''; }
    if (sheet === 'stamp') stamp = defaultStamp();
    if (sheet === 'info') meta = { ...originalMeta };
    if (sheet === 'compress') preset = 'balanced';
  }
  async function loadInfo() {
    if (!source) return;
    try { const found = await readMeta(source); meta = { title: found.title, author: found.author, subject: found.subject, keywords: found.keywords, creator: found.creator, producer: found.producer }; originalMeta = { ...meta }; }
    catch (e) { bad = true; status = pdfErrorMessage(e, currentName()); }
  }
  function changePage(n: number) { cropNote = ''; current = pageIndex(n, pages.length); zoom = { scale: 1, x: 0, y: 0 }; status = ''; }

  /** The mark as the PDF writer wants it: live text when the PDF fonts can print it, otherwise a picture (a logo, or text drawn by the browser). */
  async function watermarkSource(): Promise<WatermarkSource> {
    if (wm.kind === 'text' && isWinAnsi(wm.text.trim())) return { kind: 'text', text: wm.text, color: wm.color };
    const picture = buildMark({ kind: wm.kind, text: wm.text, color: wm.color, outline: false, logo: wmLogo });
    const blob = picture && await toBlob(picture, 'image/png');
    if (!blob) throw new RangeError(wm.kind === 'logo' ? 'Choose your logo first.' : 'Type the watermark text.');
    return { kind: 'image', bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png' };
  }
  // Show the watermark on the page while its sheet is open, drawn the way Photo Studio draws it. The turn is counter-clockwise here, so it is flipped for the canvas.
  $effect(() => {
    void baseTick;
    const open = sheet === 'watermark', look = { pos: wm.pos, sizePct: wm.sizePct, opacity: wm.opacity, angle: -wm.angle, margin: wm.margin, gap: wm.gap };
    const mark = open ? buildMark({ kind: wm.kind, text: wm.text, color: wm.color, outline: false, logo: wmLogo }) : null;
    if (!canvas || !pageBase || (!open && !previewing)) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(pageBase, 0, 0);
    if (mark) paintMark(ctx, canvas.width, canvas.height, mark, look);
    previewing = open;
  });

  async function apply() {
    if (!source || !sheet) return;
    busy = true; bad = false; status = 'Applying…';
    try {
      let output: Uint8Array;
      let label: string;
      switch (sheet) {
        case 'merge': case 'split': case 'addimages': case 'scan': case 'toimages': case 'extract': case 'docx': case 'text': case 'ocr': return;   // these sheets apply themselves
        case 'pages': output = await buildFromPages(source, pages); label = 'Pages'; break;
        case 'crop': {
          const m = cropMargins();
          if (!m) throw new RangeError('Could not read the page size. Try again.');
          output = await cropPdf(source, m, cropScope === 'page' ? new Set([sourcePage]) : undefined); label = 'Crop'; break;
        }
        case 'stamp': output = (await stampPdf(source, stamp)).bytes; label = 'Page numbers'; break;
        case 'watermark':
          output = (await watermarkPdf(source, { source: await watermarkSource(), ...draftLayout(wm) })).bytes;
          label = 'Watermark'; break;
        case 'info': output = await writeMeta(source, meta); label = 'Info'; break;
        case 'compress': {
          const p = PRESETS[preset];
          output = (await compressPdfImages(source, jpegRecompressor(p.quality, p.maxSide))).bytes;
          label = 'Compress'; break;
        }
      }
      const added = await st.commit(pdfBlob(output), label, `${baseName(currentName())}-${label.toLowerCase().replace(/\s+/g, '-')}.pdf`);
      if (added) { sheet = null; status = ''; } else { sheet = null; status = 'No changes to save.'; }
    } catch (e) {
      bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, currentName());
    } finally { busy = false; }
  }

  async function commitPdf(bytes: Uint8Array, label: string, suffix: string) {
    const added = await st.commit(pdfBlob(bytes), label, `${baseName(currentName())}-${suffix}.pdf`);
    sheet = null; status = added ? '' : 'No changes to save.';
  }
  function move(index: number, offset: number) {
    const next = movePage(pages, index, offset);
    if (next[index]?.index !== pages[index]?.index) current = pageIndex(index + offset, next.length);
    pages = next;
  }
  function rotate(index: number, angle: number) { pages = rotatePage(pages, index, angle); }
  function remove(index: number) { pages = removePage(pages, index); current = pageIndex(current, pages.length); }
</script>

{#snippet stageContent()}
  {#if pageTotal}
    <div class="pframe" style="width:{pageDisplay.w}px;height:{pageDisplay.h}px;transform:translate3d({zoom.x}px,{zoom.y}px,0) scale({zoom.scale})">
      <canvas bind:this={canvas} class="page" aria-label="Page {current + 1} of {shownTotal}"></canvas>
      {#if sheet === 'crop' && cropPx && pageDisplay.w}<CropOverlay bind:rect={() => cropPx, setCrop} W={pageW} H={pageH} ratio={cropAspect} />{/if}
    </div>
  {:else}<p role={bad ? 'alert' : 'status'} class="muted" style="padding:0 24px;text-align:center">{status || 'Opening PDF…'}</p>{/if}
{/snippet}

{#snippet afterStage()}
  <nav class="pager" aria-label="PDF pages">
    <button class="ic" type="button" aria-label="Previous page" disabled={current === 0 || !paging} onclick={() => changePage(current - 1)}><Icon name="back" /></button>
    <span aria-live="polite" aria-atomic="true">{currentLabel}</span>
    <button class="ic next" type="button" aria-label="Next page" disabled={current >= shownTotal - 1 || !paging} onclick={() => changePage(current + 1)}><Icon name="back" /></button>
  </nav>
{/snippet}

{#snippet sheetContent()}
  {#if group && groupDef}
    <GroupSheet title={groupDef.label} tiles={groupTiles('document', groupDef.id, 'pdf')} onpick={choose} oncancel={() => (group = null)} />
  {:else if sheet === 'pages'}
    <ToolSheet title="Pages" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy} canReset={pages.some((p, i) => p.index !== i || p.rotate !== 0) || pages.length !== pageTotal}>
      <p class="muted">{pages.length} {pages.length === 1 ? 'page' : 'pages'} · showing page {current + 1}{pageNote}</p>
      <div class="acts" role="group" aria-label="Page {current + 1} actions">
        <button class="act" type="button" aria-label="Move page {current + 1} earlier" disabled={current === 0} onclick={() => move(current, -1)}><span aria-hidden="true">←</span>Earlier</button>
        <button class="act" type="button" aria-label="Rotate page {current + 1} left" onclick={() => rotate(current, -90)}><span aria-hidden="true">↶</span>Turn left</button>
        <button class="act" type="button" aria-label="Rotate page {current + 1} right" onclick={() => rotate(current, 90)}><span aria-hidden="true">↷</span>Turn right</button>
        <button class="act" type="button" aria-label="Remove page {current + 1}" disabled={pages.length <= 1} onclick={() => remove(current)}><span aria-hidden="true">×</span>Remove</button>
        <button class="act" type="button" aria-label="Move page {current + 1} later" disabled={current === pages.length - 1} onclick={() => move(current, 1)}><span aria-hidden="true">→</span>Later</button>
      </div>
      <p class="muted hint">Swipe the page sideways, or use the arrows, to change page.</p>
    </ToolSheet>
  {:else if sheet === 'merge' && source}
    <PdfMergeSheet current={{ name: currentName(), bytes: source, pages: pageTotal }} extras={mergeExtras} oncommit={(bytes) => commitPdf(bytes, 'Merge', 'merged')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'split' && source}
    <PdfSplitSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'addimages' && source}
    <PdfAddImagesSheet {source} name={currentName()} pages={pageTotal} extras={imageExtras} oncommit={(bytes) => commitPdf(bytes, 'Add images', 'images')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'scan' && source}
    <PdfScanSheet {source} pages={pageTotal} oncommit={(bytes) => commitPdf(bytes, 'Scan', 'scan')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'docx' && source}
    <PdfToWordSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'text' && source}
    <PdfToTextSheet {source} name={currentName()} onread={() => choose('ocr')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'ocr' && source}
    <PdfReadTextSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'toimages' && source}
    <PdfToImagesSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'extract' && source}
    <PdfExtractSheet {source} name={currentName()} oncancel={() => (sheet = null)} />
  {:else if sheet === 'crop'}
    <ToolSheet title="Crop" onreset={reset} canReset={cropShape !== 'free' || !cropWhole} onapply={applyCrop} oncancel={() => (sheet = null)} {busy}>
      <Chips label="Shape" items={ASPECTS} value={cropShape} onpick={pickShape} action={{ label: 'Detect edges', onclick: detectEdges }} />
      {#if pageTotal > 1}<Chips label="Apply to" items={[{ id: 'all', label: 'All pages' }, { id: 'page', label: `This page (${current + 1})` }]} value={cropScope} onpick={(id) => (cropScope = id)} />{/if}
      <p class="muted hint">{cropMm ? `${cropMm.w} × ${cropMm.h} mm. ` : ''}{cropNote || 'Drag the handles on the page.'}</p>
    </ToolSheet>
  {:else if sheet === 'stamp'}
    <ToolSheet title="Page numbers" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <div class="controls">
        <label>Footer text<input type="text" bind:value={stamp.footer.center} placeholder="Page number of total" /></label>
        <label>Header text<input type="text" bind:value={stamp.header.center} placeholder="Optional" /></label>
        <label>First number<input type="number" min="0" step="1" bind:value={stamp.startNumber} /></label>
        <label>First page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.fromPage} /></label>
        <label>Last page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.toPage} /></label>
        <label>Text size (pt)<input type="number" min="4" max="72" bind:value={stamp.size} /></label>
      </div>
      <p class="muted">Use {'{n}'}, {'{total}'}, {'{file}'}, {'{date}'} or {'{bates}'}.</p>
    </ToolSheet>
  {:else if sheet === 'watermark'}
    <PdfWatermarkSheet bind:draft={wm} bind:logo={wmLogo} {busy} onapply={apply} oncancel={() => (sheet = null)} />
  {:else if sheet === 'info'}
    <ToolSheet title="Info" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <p class="muted">{currentName()} · {pageTotal} {pageTotal === 1 ? 'page' : 'pages'} · {fmtBytes(st.file?.size ?? 0)}</p>
      <div class="controls">
        <label>Title<input type="text" bind:value={meta.title} /></label>
        <label>Author<input type="text" bind:value={meta.author} /></label>
        <label>Subject<input type="text" bind:value={meta.subject} /></label>
        <label>Keywords<input type="text" bind:value={meta.keywords} /></label>
        <label>Creator<input type="text" bind:value={meta.creator} /></label>
        <label>Producer<input type="text" bind:value={meta.producer} /></label>
      </div>
    </ToolSheet>
  {:else if sheet === 'compress'}
    <ToolSheet title="Compress" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <label>Image quality<select bind:value={preset}>{#each Object.entries(PRESETS) as [key, value]}<option value={key}>{value.label}</option>{/each}</select></label>
      <p class="muted">Text and vector artwork stay sharp. Embedded JPEG images are recompressed only when the result is smaller.</p>
    </ToolSheet>
  {/if}
{/snippet}

{#snippet overlay()}
  {#if allTools}<AllToolsPanel studio="document" kind="pdf" onpick={pickRow} onback={() => (allTools = false)} />{/if}
{/snippet}

<StudioShell label="Document Studio PDF editor" closeLabel="Close this PDF" {onclose} downloadUrl={downloadUrl} locked={!!sheet || !!group} {busy}
  {saved} {saveLabel} {oncopy} {onremove} bind:menu bind:versions closeVersionsOnPick
  stageLabel="PDF page preview. Pinch to zoom and drag to pan." zoomLabel="PDF page zoom" content={{ w: pageDisplay.w || stageW, h: pageDisplay.h || stageH }} bind:stageW bind:stageH bind:zoom
  blockGestures={!paging || !!group || allTools || versions || menu} onswipe={(step) => changePage(current + step)} {toasts} dock={pageTotal ? DOCK : []} dockLabel="PDF tools" ondock={dockPick} {hasSheet} onescape={() => { if (allTools) allTools = false; else if (group) group = null; else sheet = null; }}
  landmark {overlay} stage={stageContent} {afterStage} sheet={sheetContent} />

<style>
  .pframe { position: relative; transform-origin: center; transition: width 220ms ease, height 220ms ease, transform 180ms ease-out; will-change: width, height, transform; }
  .page { display: block; width: 100%; height: 100%; object-fit: contain; background: white; box-shadow: 0 3px 20px rgb(0 0 0 / .25); }
  .next :global(svg) { transform: rotate(180deg); }
  .pager { flex: none; display: flex; justify-content: center; align-items: center; gap: 18px; min-height: 56px; color: var(--ink); }
  .acts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 6px; }
  .act { min-height: 60px; display: grid; place-items: center; align-content: center; gap: 2px; padding: 4px 2px; border: 0; border-radius: 10px; color: var(--ink); background: var(--paper); font: inherit; font-size: .72rem; cursor: pointer; }
  .act span { font-size: 1.25rem; line-height: 1; }
  .act:disabled { opacity: .35; cursor: default; }
  .act:not(:disabled):active { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .hint { margin: 10px 0 0; font-size: .85rem; }
  .muted.hint { margin-top: 2px; }
  @media (prefers-reduced-motion: reduce) { .pframe { transition-duration: .01ms; } }
  @media (min-width: 860px) { .pager { flex-direction: column; } }
</style>
