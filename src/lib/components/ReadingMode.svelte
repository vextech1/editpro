<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  // Full-screen reading: everything else on the page is covered and cannot be scrolled or reached, so a document can be read without distraction.
  // The only controls are Exit and what the document shows. Exit, Escape and the phone's Back button all leave.
  let { title, status = '', onexit, children }: { title: string; status?: string; onexit: () => void; children: Snippet } = $props();
  let root = $state<HTMLElement>();
  let exit = $state<HTMLButtonElement>();

  onMount(() => {
    const overflow = document.body.style.overflow, before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    exit?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; before?.focus({ preventScroll: true }); };
  });
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onexit(); return; }
    if (e.key !== 'Tab' || !root) return;
    // Keep Tab inside the reader: it has only Exit and the reading area.
    const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<div class="reading" role="dialog" aria-modal="true" aria-label="Reading: {title}" tabindex="-1" bind:this={root} onkeydown={keydown}>
  <header>
    <button class="exit" type="button" bind:this={exit} onclick={onexit}><span aria-hidden="true">✕</span> Exit</button>
    <div class="who"><strong>{title}</strong>{#if status}<span aria-live="polite">{status}</span>{/if}</div>
  </header>
  <div class="body">{@render children()}</div>
</div>

<style>
  .reading { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; height: 100dvh; background: var(--paper); color: var(--ink); }
  header { flex: none; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: env(safe-area-inset-top, 0px) 12px 0 8px; background: var(--card); border-bottom: 1px solid var(--line); }
  .exit { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; font: inherit; font-weight: 650; color: var(--ink); background: none; border: 1.5px solid var(--line); border-radius: 999px; cursor: pointer; }
  .exit:active { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .who { min-width: 0; flex: 1; display: grid; line-height: 1.25; }
  .who strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .98rem; }
  .who span { color: var(--muted); font-size: .85rem; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: env(safe-area-inset-bottom, 0px); }
</style>