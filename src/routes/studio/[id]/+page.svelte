<script lang="ts">
  import Studio from '#lib/components/Studio.svelte';
  import { SITE } from '#lib/site.ts';
  import { workspaceMeta } from '#lib/seo.ts';
  import { studioContent } from '#lib/studioContent.ts';
  import { toolBySlug, type Tool } from '#lib/tools.ts';
  let { data } = $props();
  const w = $derived(data.workspace);
  const meta = $derived(workspaceMeta(w));
  const content = $derived(studioContent[w.id]);
  const studioTools = $derived(w.tabs.map((s) => toolBySlug(s)).filter((t): t is Tool => t !== undefined));
  const url = $derived(`${SITE.origin}/studio/${w.id}`);
  // Tells search engines what this page is. Escaped so nothing in the text can close the script tag.
  const ld = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebApplication', name: w.title, url,
    description: meta.description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  }).replace(/</g, '\\u003c'));
  const crumbs = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'], ['Tools', '/tools'], [w.title, `/studio/${w.id}`]].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE.origin + path }))
  }).replace(/</g, '\\u003c'));
</script>
<svelte:head><title>{meta.title}</title>
<meta name="description" content={meta.description} />
{@html `<script type="application/ld+json">${ld}</script>`}
{@html `<script type="application/ld+json">${crumbs}</script>`}</svelte:head>

<h1>{w.title}</h1>
<p class="lede">{w.intro}</p>
{#key w.id}<Studio workspace={w} />{/key}
<p class="muted" style="margin-top:28px">Free to use, with no sign-up. Works on your phone, tablet or computer.</p>
{#if content}
  <h2>What you can do in {w.title}</h2>
  {#each content.about as p}<p>{p}</p>{/each}
  <ul class="steps">{#each studioTools as t}<li><a href="/tools/{t.slug}">{t.title}</a>: {t.short}</li>{/each}</ul>
  <h2>How it works</h2>
  <ol class="steps">{#each content.steps as s}<li>{s}</li>{/each}</ol>
  <h2>Common questions</h2>
  <div class="faqlist">{#each content.faq as [q, a]}<h3>{q}</h3><p>{a}</p>{/each}</div>
{/if}
