<script lang="ts">
  import { tools } from '#lib/tools.ts';
  import { SITE } from '#lib/site.ts';
  import { toolMeta } from '#lib/seo.ts';
  import { toolContent, sharedFaq } from '#lib/toolContent.ts';
  import AdSlot from '#lib/components/AdSlot.svelte';
  import ToolView from '#lib/components/ToolView.svelte';
  import { workspaceFor, toolHref } from '#lib/core/workspaces.ts';
  let { data } = $props();
  const t = $derived(data.tool);
  const meta = $derived(toolMeta(t));
  const studio = $derived(workspaceFor(t.slug));
  const related = $derived(tools.filter((x) => x.slug !== t.slug && x.group === t.group));
  const ld = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebApplication', name: t.title, url: `${SITE.origin}/tools/${t.slug}`,
    description: t.intro, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  }).replace(/</g, '\\u003c'));
  const popularSlugs = ['merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-docx', 'scan-document', 'extract-text'];
  const popular = $derived(popularSlugs.filter((s) => s !== t.slug).map((s) => tools.find((x) => x.slug === s)).filter((x) => x !== undefined));
  const content = $derived(toolContent[t.slug]);
  const faq = $derived([...(content?.faq ?? []), ...sharedFaq]);
  const faqLd = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  }).replace(/</g, '\\u003c'));
  const crumbs = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'], ['Tools', '/tools'], [t.title, `/tools/${t.slug}`]].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE.origin + path }))
  }).replace(/</g, '\\u003c'));
</script>
<svelte:head><title>{meta.title}</title>
<meta name="description" content={meta.description} />
{@html `<script type="application/ld+json">${ld}</script>`}
{@html `<script type="application/ld+json">${crumbs}</script>`}
{@html `<script type="application/ld+json">${faqLd}</script>`}</svelte:head>

<h1>{t.h1}</h1>
<p class="lede">{t.intro}</p>
{#if studio}<p class="studiolink"><a class="btn small ghost" href={toolHref(t.slug)}>Open in {studio.title}</a> <span class="muted">Keep your edits between steps, with undo.</span></p>{/if}
{#key t.slug}
  <ToolView tool={t} />
{/key}
<p class="muted">Free to use, with no sign-up. Works on your phone, tablet or computer.</p>
<AdSlot />
<h2>How it works</h2>
<ol class="steps">{#each t.steps as s}<li>{s}</li>{/each}</ol>
{#if t.note}<p>{t.note}</p>{/if}
{#if content}
  <h2>When to use it</h2>
  <ul class="steps">{#each content.uses as u}<li>{u}</li>{/each}</ul>
{/if}
<h2>Common questions</h2>
<div class="faqlist">{#each faq as [q, a]}<h3>{q}</h3><p>{a}</p>{/each}</div>
{#if related.length}
  <h2>More {t.group} tools</h2>
  <ul class="steps">{#each related as r}<li><a href="/tools/{r.slug}">{r.title}</a>: {r.short}</li>{/each}</ul>
{/if}
<h2>Popular tools</h2>
<ul class="steps">{#each popular as p}<li><a href="/tools/{p.slug}">{p.title}</a>: {p.short}</li>{/each}</ul>
