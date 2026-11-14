<script lang="ts">
  import { installApp } from '#lib/install.svelte.ts';
  import { dismissInstall, wasDismissedRecently } from '#lib/core/install.ts';
  import { onMount } from 'svelte';
  // banner: a dismissible card for the home page. row: the always-available line in Settings.
  let { variant = 'row' }: { variant?: 'banner' | 'row' } = $props();
  let hidden = $state(true); let help = $state(false);
  onMount(() => { hidden = variant === 'banner' && wasDismissedRecently(); });
  const mode = $derived(installApp.mode);
  async function go() { if (mode === 'prompt') await installApp.install(); else help = !help; }
  function later() { dismissInstall(); hidden = true; }
</script>
{#if !hidden && (mode === 'prompt' || mode === 'ios' || (variant === 'row' && mode === 'installed'))}
  <div class={variant === 'banner' ? 'card install' : 'setrow'} style={variant === 'banner' ? 'display:flex;align-items:center;gap:12px;margin:16px 0;flex-wrap:wrap' : ''}>
    {#if mode === 'installed'}
      <span>EditPro is installed on this device.</span>
    {:else}
      <span class="grow"><strong>Install EditPro</strong>
        <div class="sub">Opens like an app, works offline once your tools have loaded, and keeps your files on this device.</div>
        {#if help && mode === 'ios'}<div class="sub" role="note">In Safari, tap the Share button, then “Add to Home Screen”.</div>{/if}
      </span>
      <button class="btn small" type="button" onclick={go}>{mode === 'ios' ? (help ? 'Got it' : 'How') : 'Install'}</button>
      {#if variant === 'banner'}<button class="btn small ghost" type="button" onclick={later}>Not now</button>{/if}
    {/if}
  </div>
{/if}
