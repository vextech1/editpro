<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import type { SheetProps } from '../sheet-types.ts';
  import { NO_TURN, flipOnScreen, isTurned, turnBy, type Turn } from '#lib/core/photo-ops.ts';
  import { renderTurn } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  // One sheet for both tools: Rotate shows the turn buttons, Flip the mirror buttons. The photo on the stage changes as you tap, and
  // nothing is saved until the tick.
  let { kind, base, prev, view, busy, onapply, oncancel, outDims = $bindable(null) }: SheetProps & { kind: 'rotate' | 'flip' } = $props();
  let t = $state<Turn>({ ...NO_TURN });
  const changed = $derived(isTurned(t));
  const reset = () => (t = { ...NO_TURN });

  $effect(() => {
    if (!view) return;
    const c = renderTurn(prev, t);   // the small copy, so the preview follows every tap at once
    view.width = c.width; view.height = c.height; view.getContext('2d')!.drawImage(c, 0, 0); c.width = 0;
    outDims = { w: view.width, h: view.height };
  });
  $effect(() => () => { outDims = null; });

  function apply() {
    if (!changed) { oncancel(); return; }
    const now = { ...t };
    void onapply(() => renderTurn(base, now), kind === 'rotate' ? 'Rotate' : 'Flip');
  }
</script>

<ToolSheet title={kind === 'rotate' ? 'Rotate' : 'Flip'} canReset={changed} onreset={reset} onapply={apply} {oncancel} {busy}>
  <div class="turn-row" role="group" aria-label={kind === 'rotate' ? 'Rotate the photo' : 'Flip the photo'}>
    {#if kind === 'rotate'}
      <button type="button" onclick={() => (t = turnBy(t, -1))}>↺ Left 90°</button>
      <button type="button" onclick={() => (t = turnBy(t, 1))}>↻ Right 90°</button>
      <button type="button" onclick={() => (t = turnBy(t, 2))}>180°</button>
    {:else}
      <button type="button" class:on={t.flipH} aria-pressed={t.flipH} onclick={() => (t = flipOnScreen(t, 'h'))}>⇋ Left to right</button>
      <button type="button" class:on={t.flipV} aria-pressed={t.flipV} onclick={() => (t = flipOnScreen(t, 'v'))}>⇅ Top to bottom</button>
    {/if}
  </div>
  <p class="sh-hint">{kind === 'rotate' ? 'Tap as many times as you need. Nothing is saved until you tap the tick.' : 'Tap again to undo a flip. Nothing is saved until you tap the tick.'}</p>
</ToolSheet>

<style>
  .turn-row { display: flex; gap: 8px; flex-wrap: wrap; padding: 2px 0 12px; }
  .turn-row button { flex: none; font: inherit; font-size: 1rem; padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .turn-row button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--card)); font-weight: 650; }
</style>
