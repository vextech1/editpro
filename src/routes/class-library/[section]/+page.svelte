<script lang="ts">
  import LegacyLibraryRedirect from '#lib/components/LegacyLibraryRedirect.svelte';
  let { data }: { data: { section: string } } = $props();
</script>
<LegacyLibraryRedirect sectionSlug={data.section} />
