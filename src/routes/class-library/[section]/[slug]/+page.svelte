<script lang="ts">
  import LegacyLibraryRedirect from '#lib/components/LegacyLibraryRedirect.svelte';
  let { data }: { data: { section: string; slug: string } } = $props();
</script>
<LegacyLibraryRedirect sectionSlug={data.section} classSlug={data.slug} />
