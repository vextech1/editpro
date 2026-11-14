<script lang="ts">
  import { onMount } from 'svelte';
  import { updateApp } from '#lib/update.svelte.ts';
  import { activeWork, UNSAVED_WARNING } from '#lib/active.svelte.ts';
  onMount(() => { void updateApp.init(); });
  // Work is kept on this device, so reloading is safe, except for a change that could not be saved.
  function reload() { if (activeWork.unsaved && !confirm(UNSAVED_WARNING)) return; updateApp.apply(); }
</script>
{#if updateApp.available}
  <div class="update" role="status">
    <span class="grow">A new version of EditPro is ready.</span>
    <button class="btn small" type="button" onclick={reload}>Reload</button>
    <button class="btn small ghost" type="button" onclick={() => updateApp.dismiss()}>Later</button>
  </div>
{/if}
<style>
  .update { position: fixed; left: 12px; right: 12px; bottom: calc(var(--nav-h, 0px) + 12px); z-index: 30; max-width: 480px; margin: 0 auto;
    display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--card); color: var(--ink);
    border: 1px solid var(--accent); box-shadow: 0 6px 24px rgb(0 0 0 / .25); }
</style>
