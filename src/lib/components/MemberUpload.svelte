<script lang="ts">
  import { onMount } from 'svelte';
  import { member } from '#lib/cloud/member.svelte.ts';
  import { getLibraryStructure } from '#lib/cloud/firebase.ts';
  import { memberUploadError, uploadMyFile } from '#lib/cloud/user.ts';
  import { CATEGORIES, MAX_LABEL, cleanLabel, type CategoryId } from '#lib/core/class-library.ts';
  import { DOWNLOADS_PER_UPLOAD } from '#lib/core/access.ts';
  import { USER_EXT, USER_MAX_BYTES, checkUserUpload } from '#lib/core/user-library.ts';
  import type { LibraryStructure } from '#lib/core/library-structure.ts';
  import { fmtBytes } from '#lib/core/format.ts';

  let { onUploaded }: { onUploaded: (id: string) => void } = $props();
  let structure = $state<LibraryStructure>([]); let loaded = $state(false);
  let sectionId = $state(''); let classId = $state(''); let subjectId = $state('');
  let category = $state<CategoryId>('notes'); let label = $state(''); let title = $state(''); let picked = $state<File>();
  let agreed = $state(false); let busy = $state(false); let progress = $state(''); let problem = $state('');
  onMount(async () => { try { structure = await getLibraryStructure(); } finally { loaded = true; } });
  const section = $derived(structure.find((item) => item.id === sectionId));
  const cls = $derived(section?.classes.find((item) => item.id === classId));
  const check = $derived(picked ? checkUserUpload(picked.name, picked.size) : undefined);
  const ready = $derived(!!picked && check?.ok === true && !!sectionId && !!classId && !!subjectId && agreed && !busy && !!member.user && (category !== 'other' || !!cleanLabel(label)));
  function pick(event: Event) { problem = ''; picked = (event.currentTarget as HTMLInputElement).files?.[0]; }
  async function submit(event: SubmitEvent) {
    event.preventDefault(); if (!ready || !picked || !member.user) return;
    busy = true; problem = ''; progress = 'Checking…';
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      const id = await uploadMyFile(member.user.uid, bytes, { name: picked.name, title: title.trim() || undefined, section: sectionId, cls: classId, subject: subjectId, category, ...(category === 'other' ? { label: cleanLabel(label) } : {}) },
        (done, total) => (progress = total > 1 ? `Uploading ${Math.round((done / total) * 100)}%` : 'Uploading…'));
      picked = undefined; title = ''; label = ''; agreed = false; onUploaded(id);
    } catch (error) { problem = memberUploadError(error); }
    finally { busy = false; progress = ''; }
  }
</script>

<form onsubmit={submit} class="up">
  {#if !loaded}<p class="muted" role="status">Loading…</p>
  {:else if !structure.length}<p class="muted">Uploads are not open yet. Please check back soon.</p>
  {:else}
    <p class="muted small">Each document unlocks {DOWNLOADS_PER_UPLOAD} downloads. Allowed: {USER_EXT.map((ext) => '.' + ext).join(' ')}, up to {fmtBytes(USER_MAX_BYTES)}.</p>
    <label for="mu-section">Section</label>
    <select id="mu-section" bind:value={sectionId} onchange={() => { classId = ''; subjectId = ''; }}><option value="">Choose a section</option>{#each structure as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select>
    {#if section}<label for="mu-class">Class</label><select id="mu-class" bind:value={classId} onchange={() => (subjectId = '')}><option value="">Choose a class</option>{#each section.classes as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select>{/if}
    {#if cls}<label for="mu-subject">Subject</label><select id="mu-subject" bind:value={subjectId}><option value="">Choose a subject</option>{#each cls.subjects as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select>{/if}
    <label for="mu-category">Category</label><select id="mu-category" bind:value={category}>{#each CATEGORIES as item (item.id)}<option value={item.id}>{item.id === 'other' ? 'Other (write my own label)' : item.label}</option>{/each}</select>
    {#if category === 'other'}<label for="mu-label">Your label</label><input id="mu-label" type="text" maxlength={MAX_LABEL} bind:value={label} placeholder="For example: Lab manuals" autocomplete="off" />{/if}
    <label for="mu-file">Document</label><input id="mu-file" type="file" accept={USER_EXT.map((ext) => '.' + ext).join(',')} onchange={pick} />
    {#if picked && check && !check.ok}<p class="warn" role="alert">This file was not added because {check.reason}.</p>{/if}
    <label for="mu-title">Title <span class="muted">(optional)</span></label><input id="mu-title" type="text" maxlength="120" bind:value={title} placeholder="For example: Week 3 notes" autocomplete="off" />
    <label class="agree"><input type="checkbox" bind:checked={agreed} /><span>This is my work, or I have permission to share it. I allow EditPro to show it to other students and understand it may be removed if it breaks someone's rights.</span></label>
    {#if problem}<p class="warn" role="alert">{problem}</p>{/if}
    <button class="btn" type="submit" disabled={!ready}>{busy ? progress : 'Share document'}</button>
  {/if}
</form>

<style>
  .up { display: grid; gap: 6px; }
  label { font-weight: 650; margin-top: 8px; }
  select, input[type='text'], input[type='file'] { box-sizing: border-box; width: 100%; font: inherit; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
  .agree { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; }
  .agree input { margin-top: 4px; flex: none; }
  .small { font-size: .9rem; margin: 0 0 4px; }
  .warn { color: var(--warn); }
</style>
