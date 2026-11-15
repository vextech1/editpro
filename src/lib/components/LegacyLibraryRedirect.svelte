<script lang="ts">
  // Old shared links looked like /class-library/<section-name>/<class-name>. The catalog is now built from an
  // admin-chosen name and a random id, with no fixed list of sections or classes, so a slug is matched to today's
  // names rather than looked up in a table. If nothing matches (renamed, deleted, or never existed), go to the Library home.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { findBySlugs, libraryHref } from '#lib/core/class-library.ts';
  import { useCloud } from '#lib/cloud/useCloud.svelte.ts';
  let { sectionSlug, classSlug = '' }: { sectionSlug: string; classSlug?: string } = $props();
  const cloud = useCloud(); onMount(cloud.load);
  let went = false;
  $effect(() => {
    if (went || (!cloud.state.loaded && !cloud.state.failed)) return;
    went = true;
    const hit = findBySlugs(cloud.state.structure, sectionSlug, classSlug);
    void goto(libraryHref(hit?.section, hit?.cls), { replace: true });
  });
</script>

<svelte:head><title>Library | EditPro</title><meta name="robots" content="noindex" /></svelte:head>
<h1>Library</h1>
<p class="muted" role="status">Taking you to the Library…</p>
<p><a href="/class-library">Open the Library</a></p>
