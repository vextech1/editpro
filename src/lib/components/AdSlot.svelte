<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ADS, adsEnabled, addScript } from '#lib/ads.ts';
  // One Native Banner slot. Use it once per page: the ad finds its box by a fixed id.
  let on = $state(false);
  onMount(() => {
    if (!ADS.nativeBanner.enabled || !adsEnabled()) return;
    let script: HTMLScriptElement | undefined;
    let box: HTMLElement | null = null;
    on = true;
    void tick().then(() => { box = document.getElementById(ADS.nativeBanner.container); script = addScript(ADS.nativeBanner.src, true); });
    return () => { script?.remove(); box?.replaceChildren(); };
  });
</script>
{#if on}
  <aside class="adslot" aria-label="Advertisement"><small>Advertisement</small><div id={ADS.nativeBanner.container}></div></aside>
{/if}
