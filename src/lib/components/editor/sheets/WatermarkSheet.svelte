<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import ParamTabs from '../ParamTabs.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import Field from '../Field.svelte';
  import type { SheetProps } from '../sheet-types.ts';
  import { attachDrag, attachPinch } from '../pointer.ts';
  import { POSITIONS, centerOf, clampCenter, markSize, pinchSize, type Pos, type Pt } from '#lib/core/watermark.ts';
  import { loadCanvas } from '#lib/core/download.ts';
  import { buildMark, paintMark, renderMarked, type MarkLook } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel }: SheetProps = $props();
  const KINDS = [{ id: 'text', label: 'Text' }, { id: 'logo', label: 'Logo' }] as const;
  const POS = [...POSITIONS, { id: 'tile', label: 'Repeat' }] as { id: Pos; label: string }[];
  let kind = $state<'text' | 'logo'>('text'), text = $state('© Your name'), color = $state('#ffffff'), outline = $state(true);
  let logo = $state.raw<HTMLCanvasElement | null>(null), logoName = $state(''), err = $state('');
  let pos = $state<Pos>('br'), sizePct = $state(30), opacity = $state(60), angle = $state(0), margin = $state(3), gap = $state(60);
  let param = $state('size');
  let at = $state<Pt | null>(null);   // where one finger dragged the mark (its centre, as a share of the photo); null means the Position chosen above

  // The sliders: size, see-through and turn always; distance from the edge for one mark, space between for a repeat.
  const PARAMS = $derived([{ id: 'size', label: 'Size' }, { id: 'opacity', label: 'Visible' }, { id: 'angle', label: 'Turn' }, ...(pos === 'tile' ? [{ id: 'gap', label: 'Spacing' }] : at ? [] : [{ id: 'margin', label: 'Edge distance' }])]);
  const active = $derived(PARAMS.some((p) => p.id === param) ? param : 'size');
  const RANGE: Record<string, { min: number; max: number; step?: number }> = { size: { min: 5, max: 100 }, opacity: { min: 5, max: 100 }, angle: { min: -90, max: 90 }, gap: { min: 0, max: 300, step: 5 }, margin: { min: 0, max: 15 } };
  const get = (id: string) => (id === 'size' ? sizePct : id === 'opacity' ? opacity : id === 'angle' ? angle : id === 'gap' ? gap : margin);
  const put = (id: string, v: number) => { if (id === 'size') sizePct = v; else if (id === 'opacity') opacity = v; else if (id === 'angle') angle = v; else if (id === 'gap') gap = v; else margin = v; };

  const mark = $derived(buildMark({ kind, text, color, outline, logo }));
  const look = $derived<MarkLook>({ pos, sizePct, opacity, angle, margin, gap, at: pos === 'tile' ? null : at });
  const changed = $derived(kind !== 'text' || text !== '© Your name' || pos !== 'br' || sizePct !== 30 || opacity !== 60 || angle !== 0 || margin !== 3 || gap !== 60 || !!at || color !== '#ffffff' || !outline || !!logo);

  $effect(() => {
    if (!view) return;
    view.width = prev.width; view.height = prev.height; const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0);
    if (mark) paintMark(ctx, prev.width, prev.height, mark, look);
  });
  async function pickLogo(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;   // the browser clears currentTarget once the handler has awaited, so keep our own reference
    const f = input.files?.[0]; if (!f) return;
    try { logo = await loadCanvas(f, 1000); logoName = f.name; err = ''; } catch { err = 'That logo could not be read as an image.'; }
    input.value = '';
  }
  // One finger on the photo moves a single mark; two fingers pinching resize it. The mark follows the finger's movement from where it was,
  // so it never jumps and the touch can start anywhere. While two fingers are down the single finger does not move it.
  let from: Pt | null = null, origin: Pt | null = null, size = { w: 0, h: 0 }, pinching = false, pinchFrom = 0;
  $effect(() => {
    const v = view, m = mark; if (!v || !m) return;
    const stops = [attachPinch(v, {
      start: () => { pinching = true; from = null; origin = null; pinchFrom = sizePct; },
      scale: (f) => { sizePct = pinchSize(pinchFrom, f); },
      end: () => { pinching = false; },
      wheel: (f) => { sizePct = pinchSize(sizePct, f); }
    })];
    if (pos !== 'tile') stops.push(attachDrag(v, () => ({ W: base.width, H: base.height }), {
      down: (p) => {
        if (pinching) return false;
        size = markSize(base.width, base.height, m.width / m.height, sizePct);
        origin = at ?? centerOf(base.width, base.height, size.w, size.h, pos as Exclude<Pos, 'tile'>, margin); from = { x: p.x, y: p.y };
      },
      move: (p) => { if (pinching || !from || !origin) return; at = clampCenter(base.width, base.height, size.w, size.h, { x: origin.x + (p.x - from.x) / base.width, y: origin.y + (p.y - from.y) / base.height }); },
      up: () => { from = null; origin = null; }
    }, 'grab'));
    return () => { pinching = false; from = null; origin = null; stops.reverse().forEach((stop) => stop()); };
  });
  function pickPos(p: Pos) { pos = p; at = null; }
  function reset() { at = null; kind = 'text'; text = '© Your name'; color = '#ffffff'; outline = true; pos = 'br'; sizePct = 30; opacity = 60; angle = 0; margin = 3; gap = 60; logo = null; logoName = ''; param = 'size'; err = ''; }
  function apply() { const m = mark, l = { ...look }; if (!m) return; void onapply(() => renderMarked(base, m, l), 'Watermark'); }
</script>

<ToolSheet title="Watermark" canReset={changed} onreset={reset} onapply={apply} {oncancel} busy={busy || !mark}>
  <Chips items={KINDS} value={kind} onpick={(k) => (kind = k)} label="Mark type" />
  {#if kind === 'text'}
    <div class="sh-row"><Field label="Text" type="text" bind:value={text} /></div>
    <Swatches colors={['#ffffff', '#000000', '#e11d48', '#2563eb', '#f59e0b']} bind:value={color} label="Text colour" />
    <label class="sh-chk"><input type="checkbox" bind:checked={outline} /> Outline, so it reads on any photo</label>
  {:else}
    <div class="sh-row">
      <label class="sh-btn"><input class="sh-file" type="file" accept="image/*" onchange={pickLogo} /><span>{logo ? 'Choose a different logo' : 'Choose your logo'}</span></label>
      {#if logoName}<span class="sh-hint">{logoName}</span>{/if}
    </div>
    {#if err}<p class="sh-warn" role="alert">{err}</p>{:else if !logo}<p class="sh-hint">A PNG with a see-through background works best.</p>{/if}
  {/if}
  <Chips items={POS} value={at ? '' : pos} onpick={pickPos} label="Position" />
  {#if mark}<p class="sh-hint">{pos === 'tile' ? 'Repeat covers the whole photo. Pinch with two fingers to resize it, or choose a position to place one mark.' : 'Drag with one finger to move the mark. Pinch with two fingers to make it bigger or smaller.'}</p>{/if}
  {#key active}<SliderRow label={PARAMS.find((p) => p.id === active)!.label} {...RANGE[active]} bind:value={() => get(active), (v) => put(active, v)} />{/key}
  <ParamTabs tabs={PARAMS} label="Watermark settings" bind:value={() => active, (v) => (param = v)} />
</ToolSheet>
