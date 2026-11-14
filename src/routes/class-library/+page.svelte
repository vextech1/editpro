<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { CATEGORIES, countLabel, filterFiles, type CategoryId } from '#lib/core/class-library.ts';
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
  const libraryFiles = $derived(cloud.state.files.flatMap((file) => {
    if (!file.subject) return [];
    const parent = cloud.state.structure.find((item) => item.id === file.section);
    const group = parent?.classes.find((item) => item.id === file.cls);
    const topic = group?.subjects.find((item) => item.id === file.subject);
    if (!parent || !group || !topic) return [];
    const path = browseHref(parent.id, group.id, topic.id);
    return [{ ...toClassFile(file), classPath: path, classTitle: `${parent.name} / ${group.name} / ${topic.name}` }];
  }));
  const subjectFiles = $derived(libraryFiles.filter((file) => file.cloud && cloud.state.files.find((entry) => `cloud/${entry.id}` === file.id && entry.section === sectionId && entry.cls === classId && entry.subject === subjectId)));
  const visibleFiles = $derived(subjectFiles.filter((file) => category === 'all' || file.category === category));
  const categoryCounts = $derived(CATEGORIES.map((item) => ({ ...item, count: subjectFiles.filter((file) => file.category === item.id).length })));
  const hits = $derived(filterFiles(libraryFiles, { text, extra: (file) => file.classTitle }));

  function browseHref(section = '', cls = '', subject = '') {
    const query = new URLSearchParams();
    if (section) query.set('section', section);
    if (cls) query.set('class', cls);
    if (subject) query.set('subject', subject);
    return `/class-library${query.size ? `?${query}` : ''}`;
  }
  function openSection(id: string) { void goto(browseHref(id)); }
  function openClass(id: string) { void goto(browseHref(sectionId, id)); }
  function openSubject(id: string) { category = 'all'; void goto(browseHref(sectionId, classId, id)); }
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
</svelte:head>

<p class="eyebrow">EDITPRO STUDENT RESOURCES</p>
<h1>Library</h1>
<p class="lede">Class notes, assignments and past papers, free to download. No sign-up.</p>

<label class="sr" for="lib-search">Search all materials</label>
<input id="lib-search" class="search" type="search" bind:value={text} placeholder="Search everything, e.g. mathematics notes" />

{#if text.trim()}
  <p role="status" class="muted">{countLabel(hits.length)} found</p>
  <ul class="rows">
    {#each hits as f (f.id)}<ClassFileRow file={f} pagePath={f.classPath} classTitle={f.classTitle} classHref={f.classPath} />{/each}
  </ul>
{:else if !cloud.state.loaded}
  <p class="muted">Loading Library…</p>
{:else if subject}
  <p class="back"><a href={browseHref(sectionId)}>{section?.name}</a> / <a href={browseHref(sectionId, classId)}>{cls?.name}</a></p>
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
      {#each visibleFiles as f (f.id)}<ClassFileRow file={f} pagePath={f.classPath} classTitle={f.classTitle} classHref={f.classPath} />{/each}
    </ul>
  {:else}
    <div class="card empty"><p class="muted">No materials have been added to this subject yet.</p></div>
  {/if}
{:else if cls}
  <p class="back"><a href={browseHref(sectionId)}>{section?.name}</a></p>
  <h2>{cls.name}</h2>
  {#if cls.subjects.length}
    <div class="grid">
      {#each cls.subjects as item (item.id)}
        <button class="card subject" type="button" onclick={() => openSubject(item.id)}><h3>{item.name}</h3></button>
      {/each}
    </div>
  {:else}
    <div class="card empty"><p class="muted">No subjects have been added to this class yet.</p></div>
  {/if}
{:else if section}
  <p class="back"><a href="/class-library">← All sections</a></p>
  <h2>{section.name}</h2>
  {#if section.classes.length}
    <div class="grid">
      {#each section.classes as item (item.id)}
        <button class="card subject" type="button" onclick={() => openClass(item.id)}><h3>{item.name}</h3></button>
      {/each}
    </div>
  {:else}
    <div class="card empty"><p class="muted">No classes have been added to this section yet.</p></div>
  {/if}
{:else if cloud.state.structure.length}
  <div class="grid">
    {#each cloud.state.structure as item (item.id)}
      <button class="card subject" type="button" onclick={() => openSection(item.id)}><h3>{item.name}</h3><p>{item.classes.length} {item.classes.length === 1 ? 'class' : 'classes'}</p></button>
    {/each}
  </div>
{:else}
  <div class="card empty">
    <h2>The Library is empty</h2>
    <p class="muted">Materials will appear here as they are added.</p>
  </div>
{/if}

<ClassRequest className={subject?.name ?? cls?.name ?? section?.name} />

<style>
  .eyebrow { color: var(--accent); font-size: .76rem; font-weight: 750; letter-spacing: .1em; margin: 0 0 8px; }
  .search { display: block; box-sizing: border-box; width: 100%; font: inherit; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--ink); margin: 0 0 16px; }
  .search:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .back { margin: 0 0 10px; } .back a { color: var(--muted); }
  .subject { width: 100%; text-align: left; cursor: pointer; color: inherit; font: inherit; }
  .subject h3 { margin: 0; }
  .subject p { margin-bottom: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
  .chips button { font: inherit; font-size: .92rem; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .chips button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 650; }
  .empty { text-align: center; padding: 32px 18px; }
  .empty h2 { margin-top: 0; }
</style>
