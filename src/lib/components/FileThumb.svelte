<script lang="ts">
  import { onMount } from 'svelte';
  import { getLibrary, kindOf, type LibFile } from '#lib/core/library.ts';
  import { thumbnail } from '#lib/core/thumbs.ts';
  import { FILE_ICON, FILE_COLOR } from '#lib/icons.ts';
  let { file }: { file: LibFile } = $props();
  const k = $derived(kindOf(file.type));
  let url = $state<string>();
  let box: HTMLElement;
  // Pictures are made only for rows that scroll into view; PDFs and images only. Everything else keeps its icon.
  onMount(() => {
    if (k !== 'image' && k !== 'pdf') return;
    const id = file.id, load = () => void thumbnail(id, () => getLibrary().file(id)).then((u) => { url = u; });
    if (typeof IntersectionObserver === 'undefined') { load(); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { io.disconnect(); load(); } });
    io.observe(box); return () => io.disconnect();
  });
</script>
<span class="thumb" bind:this={box} style="color:{FILE_COLOR[k]}">
  {#if url}<img src={url} alt="" />
  {:else}<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d={FILE_ICON[k]} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
</span>
<style>
  .thumb { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 8px; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; border: 1px solid var(--line); border-radius: 8px; box-sizing: border-box; background: #fff; }
</style>
