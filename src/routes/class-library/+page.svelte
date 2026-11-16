<script lang="ts">
  import { page } from '$app/state';
  import { SITE } from '#lib/site.ts';
  import { onMount } from 'svelte';
  import { CATEGORIES, countLabel, filterFiles, libraryHref, sortFiles, type CategoryId } from '#lib/core/class-library.ts';
  import { toClassFile } from '#lib/core/cloud-library.ts';
  import { useCloud } from '#lib/cloud/useCloud.svelte.ts';
  import ClassFileRow from '#lib/components/ClassFileRow.svelte';
  import ClassRequest from '#lib/components/ClassRequest.svelte';
  let { data } = $props();
  let text = $state('');
  let category = $state<CategoryId | 'all'>('all');
  const cloud = useCloud(); onMount(cloud.load);
  const sectionId = $derived(page.url.searchParams.get('section') ?? '');
  const classId = $derived(page.url.searchParams.get('class') ?? '');
  const subjectId = $derived(page.url.searchParams.get('subject') ?? '');
  const section = $derived(cloud.state.structure.find((item) => item.id === sectionId));
  const cls = $derived(section?.classes.find((item) => item.id === classId));
  const subject = $derived(cls?.subjects.find((item) => item.id === subjectId));
  /** Every uploaded file that belongs somewhere in the catalog, newest first. A file with no subject (uploaded for the class as a whole,
   *  or its subject was removed) is kept at the class level, not dropped. */
  const libraryFiles = $derived(sortFiles(cloud.state.files.flatMap((file) => {
    const parent = cloud.state.structure.find((item) => item.id === file.section);
    const group = parent?.classes.find((item) => item.id === file.cls);
    if (!parent || !group) return [];
    const topic = file.subject ? group.subjects.find((item) => item.id === file.subject) : undefined;
    return [{
      ...toClassFile(file), sectionId: parent.id, classId: group.id, subjectId: topic?.id ?? '',
      classPath: libraryHref(parent.id, group.id, topic?.id),
      classTitle: [parent.name, group.name, topic?.name].filter(Boolean).join(' / ')
    }];
  })));
  const subjectFiles = $derived(libraryFiles.filter((f) => f.sectionId === sectionId && f.classId === classId && f.subjectId === subjectId));
  const classLevelFiles = $derived(libraryFiles.filter((f) => f.sectionId === sectionId && f.classId === classId && !f.subjectId));
  const visibleFiles = $derived(subjectFiles.filter((file) => category === 'all' || file.category === category));
  const categoryCounts = $derived(CATEGORIES.map((item) => ({ ...item, count: subjectFiles.filter((file) => file.category === item.id).length })));
  const hits = $derived(filterFiles(libraryFiles, { text, extra: (file) => file.classTitle }));

  const offline = $derived(typeof navigator !== 'undefined' && !navigator.onLine);
  const filesIn = (s: string, c = '', t?: string) => libraryFiles.filter((f) => f.sectionId === s && (!c || f.classId === c) && (t === undefined || f.subjectId === t)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
  const fileSummary = (n: number) => (n ? countLabel(n) : 'No files yet');
  // The address names a page that is not in the catalog (renamed, deleted or a wrong link): say so, then show the nearest page that does exist.
  const missing = $derived(cloud.state.loaded && !!((sectionId && !section) || (section && classId && !cls) || (cls && subjectId && !subject)));
  // Each view has its own title and description, so a shared link and a browser tab say what they open.
  const heading = $derived(subject?.name ?? cls?.name ?? section?.name ?? '');
  const title = $derived(heading ? `${heading}${section && heading !== section.name ? ` (${section.name})` : ''}: class notes and past papers | ${SITE.name}` : data.meta.title);
  const description = $derived(heading ? `Free class notes, assignments and past papers for ${heading}. No sign-up.` : data.meta.description);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>

{#snippet crumbs()}
  <nav class="back" aria-label="Breadcrumb">
    <a href="/class-library">Library</a>
    {#if section && (cls || subject)} / <a href={libraryHref(section.id)}>{section.name}</a>{/if}
    {#if section && cls && subject} / <a href={libraryHref(section.id, cls.id)}>{cls.name}</a>{/if}
  </nav>
{/snippet}

<p class="eyebrow">EDITPRO STUDENT RESOURCES</p>
<h1>Library</h1>
<p class="lede">Class notes, assignments and past papers, free to download. No sign-up.</p>

<label class="sr" for="lib-search">Search all materials</label>
<input id="lib-search" class="search" type="search" bind:value={text} placeholder="Search everything, e.g. mathematics notes" />

{#if !cloud.state.loaded && cloud.state.failed}
  <div class="card empty" role="alert">
    <h2>Couldn’t load the Library</h2>
    <p class="muted">{offline ? 'You appear to be offline. Connect to the internet and try again.' : 'Check your internet connection and try again.'}</p>
    <button class="btn" type="button" onclick={cloud.load}>Try again</button>
  </div>
{:else if !cloud.state.loaded}
  <p class="muted" role="status">Loading Library…</p>
{:else}
{#if cloud.state.stale}
  <p class="muted" role="status">{cloud.state.stale === 'saved' ? 'Showing the list saved on this device, because the latest one could not be loaded.' : 'Some files may be missing, because part of the list could not be loaded.'} <button class="link" type="button" onclick={cloud.load}>Try again</button></p>
{/if}
{#if missing}<p class="card note" role="status">That page is not in the Library any more. Here is the nearest one.</p>{/if}
{#if text.trim()}
  <p role="status" class="muted">{countLabel(hits.length)} found</p>
  <ul class="rows">
    {#each hits as f (f.id)}<ClassFileRow file={f} pagePath={f.classPath} classTitle={f.classTitle} classHref={f.classPath} />{/each}
  </ul>
{:else if subject && section && cls}
  {@render crumbs()}
  <h2>{subject.name}</h2>
  {#if categoryCounts.filter((item) => item.count).length > 1}
    <div class="chips" role="group" aria-label="Filter by category">
      <button type="button" class:on={category === 'all'} aria-pressed={category === 'all'} onclick={() => (category = 'all')}>All ({subjectFiles.length})</button>
      {#each categoryCounts.filter((item) => item.count) as item (item.id)}
        <button type="button" class:on={category === item.id} aria-pressed={category === item.id} onclick={() => (category = item.id)}>{item.label} ({item.count})</button>
      {/each}
    </div>
  {/if}
  {#if visibleFiles.length}
    <ul class="rows">
      {#each visibleFiles as f (f.id)}<ClassFileRow file={f} pagePath={f.classPath} />{/each}
    </ul>
  {:else}
    <div class="card empty"><p class="muted">No materials have been added to this subject yet.</p></div>
  {/if}
{:else if cls && section}
  {@render crumbs()}
  <h2>{cls.name}</h2>
  {#if cls.subjects.length}
    <div class="grid">
      {#each cls.subjects as item (item.id)}
        <a class="card subject" href={libraryHref(section.id, cls.id, item.id)} onclick={() => (category = 'all')}><h3>{item.name}</h3><p class="muted">{fileSummary(filesIn(section.id, cls.id, item.id))}</p></a>
      {/each}
    </div>
  {:else if !classLevelFiles.length}
    <div class="card empty"><p class="muted">No subjects have been added to this class yet.</p></div>
  {/if}
  {#if classLevelFiles.length}
    <h3 class="sub-h">{cls.subjects.length ? 'Other materials for this class' : 'Materials'}</h3>
    <ul class="rows">
      {#each classLevelFiles as f (f.id)}<ClassFileRow file={f} pagePath={f.classPath} />{/each}
    </ul>
  {/if}
{:else if section}
  {@render crumbs()}
  <h2>{section.name}</h2>
  {#if section.classes.length}
    <div class="grid">
      {#each section.classes as item (item.id)}
        <a class="card subject" href={libraryHref(section.id, item.id)}><h3>{item.name}</h3><p class="muted">{summary(item.subjects.length ? plural(item.subjects.length, 'subject', 'subjects') : undefined, fileSummary(filesIn(section.id, item.id)))}</p></a>
      {/each}
    </div>
  {:else}
    <div class="card empty"><p class="muted">No classes have been added to this section yet.</p></div>
  {/if}
{:else if cloud.state.structure.length}
  <div class="grid">
    {#each cloud.state.structure as item (item.id)}
      <a class="card subject" href={libraryHref(item.id)}><h3>{item.name}</h3><p class="muted">{summary(plural(item.classes.length, 'class', 'classes'), fileSummary(filesIn(item.id)))}</p></a>
    {/each}
  </div>
{:else}
  <div class="card empty">
    <h2>The Library is empty</h2>
    <p class="muted">Materials will appear here as they are added.</p>
  </div>
{/if}
{/if}

<ClassRequest className={subject?.name ?? cls?.name ?? section?.name} />

<style>
  .eyebrow { color: var(--accent); font-size: .76rem; font-weight: 750; letter-spacing: .1em; margin: 0 0 8px; }
  .search { display: block; box-sizing: border-box; width: 100%; font: inherit; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--ink); margin: 0 0 16px; }
  .search:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .back { margin: 0 0 10px; } .back a { color: var(--muted); }
  .note { margin: 0 0 14px; padding: 12px 14px; }
  .subject { display: block; width: 100%; box-sizing: border-box; text-align: left; color: inherit; text-decoration: none; font: inherit; }
  .subject:hover { border-color: var(--accent); }
  .subject:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .subject h3 { margin: 0; }
  .subject p { margin: 4px 0 0; font-size: .92rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
  .chips button { font: inherit; font-size: .92rem; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .chips button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 650; }
  .sub-h { margin: 22px 0 0; }
  .empty { text-align: center; padding: 32px 18px; }
  .empty h2 { margin-top: 0; }
</style>
