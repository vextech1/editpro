<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { SITE } from '#lib/site.ts';
  import { SHARE_CACHE, takeShared } from '#lib/core/share.ts';
  import { planIncoming } from '#lib/core/incoming.ts';
  import { setPending } from '#lib/core/handoff.ts';
  let msg = $state('');
  // Files shared from another app arrive here after the service worker has parked them. Open them in the right studio.
  onMount(async () => {
    let files: File[] = [];
    try { files = await takeShared<Request>(await caches.open(SHARE_CACHE)); } catch { /* no cache: nothing was shared */ }
    if (!files.length) { await goto('/', { replaceState: true }); return; }
    const plan = await planIncoming(files);
    if (plan.to) { setPending(plan.files); await goto(plan.to, { replaceState: true }); } else msg = plan.message;
  });
</script>
<svelte:head><title>Opening shared file | {SITE.name}</title><meta name="robots" content="noindex" /></svelte:head>
<h1>Opening your file…</h1>
{#if msg}<p class="warn" role="alert">{msg}</p><p><a class="btn" href="/">Go to home page</a></p>{:else}<p class="muted" role="status">One moment.</p>{/if}
