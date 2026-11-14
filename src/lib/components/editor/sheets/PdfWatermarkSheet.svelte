<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import ParamTabs from '../ParamTabs.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import Field from '../Field.svelte';
  import { POSITIONS, type Pos } from '#lib/core/watermark.ts';
  import { defaultDraft, type WatermarkDraft } from '#lib/core/pdf-watermark.ts';
  import { loadCanvas } from '#lib/core/download.ts';
  import '../sheet.css';

  // The PDF editor's Watermark sheet. Same controls as Photo Studio's: text or logo, position (nine spots or repeat), and
  // size / visible / turn / edge distance or spacing. The editor owns the draft and the logo so it can preview them on the page.
  let { draft = $bindable(), logo = $bindable(), busy = false, onapply, oncancel }:
    { draft: WatermarkDraft; logo: HTMLCanvasElement | null; busy?: boolean; onapply: () => void; oncancel: () => void } = $props();
  const KINDS = [{ id: 'text', label: 'Text' }, { id: 'logo', label: 'Logo' }] as const;
  const POS = [...POSITIONS, { id: 'tile', label: 'Repeat' }] as { id: Pos; label: string }[];
  let logoName = $state(''), err = $state(''), param = $state('size');

  // The sliders: size, see-through and turn always; distance from the edge for one mark, space between for a repeat.
  const PARAMS = $derived([{ id: 'size', label: 'Size' }, { id: 'opacity', label: 'Visible' }, { id: 'angle', label: 'Turn' }, draft.pos === 'tile' ? { id: 'gap', label: 'Spacing' } : { id: 'margin', label: 'Edge distance' }]);
  const active = $derived(PARAMS.some((p) => p.id === param) ? param : 'size');
  const RANGE: Record<string, { min: number; max: number; step?: number }> = { size: { min: 5, max: 100 }, opacity: { min: 5, max: 100 }, angle: { min: -90, max: 90 }, gap: { min: 0, max: 300, step: 5 }, margin: { min: 0, max: 15 } };
  const get = (id: string) => (id === 'size' ? draft.sizePct : id === 'opacity' ? draft.opacity : id === 'angle' ? draft.angle : id === 'gap' ? draft.gap : draft.margin);
  const put = (id: string, v: number) => { if (id === 'size') draft.sizePct = v; else if (id === 'opacity') draft.opacity = v; else if (id === 'angle') draft.angle = v; else if (id === 'gap') draft.gap = v; else draft.margin = v; };

  const ready = $derived(draft.kind === 'text' ? draft.text.trim().length > 0 : !!logo);
  const changed = $derived(JSON.stringify(draft) !== JSON.stringify(defaultDraft()) || !!logo);

  async function pickLogo(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;   // the browser clears currentTarget once the handler has awaited, so keep our own reference
    const f = input.files?.[0]; if (!f) return;
    try { logo = await loadCanvas(f, 1000); logoName = f.name; err = ''; } catch { err = 'That logo could not be read as an image.'; }
    input.value = '';
  }
  function reset() { Object.assign(draft, defaultDraft()); logo = null; logoName = ''; param = 'size'; err = ''; }
</script>

<ToolSheet title="Watermark" canReset={changed} onreset={reset} {onapply} {oncancel} busy={busy || !ready}>
  <Chips items={KINDS} value={draft.kind} onpick={(k) => (draft.kind = k)} label="Mark type" />
  {#if draft.kind === 'text'}
    <div class="sh-row"><Field label="Text" type="text" bind:value={draft.text} /></div>
    <Swatches colors={['#cc0000', '#000000', '#6b7280', '#2563eb', '#f59e0b']} bind:value={draft.color} label="Text colour" />
  {:else}
    <div class="sh-row">
      <label class="sh-btn"><input class="sh-file" type="file" accept="image/*" onchange={pickLogo} /><span>{logo ? 'Choose a different logo' : 'Choose your logo'}</span></label>
      {#if logoName}<span class="sh-hint">{logoName}</span>{/if}
    </div>
    {#if err}<p class="sh-warn" role="alert">{err}</p>{:else if !logo}<p class="sh-hint">A PNG with a see-through background works best.</p>{/if}
  {/if}
  <Chips items={POS} value={draft.pos} onpick={(p) => (draft.pos = p)} label="Position" />
  {#key active}<SliderRow label={PARAMS.find((p) => p.id === active)!.label} {...RANGE[active]} bind:value={() => get(active), (v) => put(active, v)} />{/key}
  <ParamTabs tabs={PARAMS} label="Watermark settings" bind:value={() => active, (v) => (param = v)} />
</ToolSheet>
