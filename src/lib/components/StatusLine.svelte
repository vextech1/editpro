<script lang="ts">
  // The one-line progress / error message under a sheet's controls. It is always on the page (and empty when there is
  // nothing to say), so screen readers announce changes to it. `gap` is the space it keeps from what is above or below.
  let { text, bad = false, gap = 'none' }: { text: string; bad?: boolean; gap?: 'none' | 'above' | 'below' } = $props();
</script>

<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad} class:above={gap === 'above'} class:below={gap === 'below'}>{text}</p>

<style>
  .above { margin: 8px 0 0; }
  .below { margin: 0 0 8px; }
</style>
