<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { checkAdminEmail } from '#lib/core/admins.ts';
  import { ALLOWED_EXT, CATEGORIES, type CategoryId } from '#lib/core/class-library.ts';
  import {
    CLOUD_MAX_BYTES, STORAGE_LIMIT_BYTES, SPARK_STORAGE_BYTES, checkCloudUpload, checkStorage, chooseShard, cloudForSubject, duplicateOf, entryBytesFor, sameNameAs, storageUsed, deleteCloud, deleteTree, emptyTrash, friendlyCloudError, uploadCloud, type CloudFile, type TrashItem
  } from '#lib/core/cloud-library.ts';
  import {
    adminAddAdmin, adminLibraryStructure, adminList, adminListAdmins, adminRemoveAdmin, adminSaveLibraryStructure, adminTrash, adminSignIn, adminSignOut, adminStore, cloudEnabled,
    watchAdmin, forgetCloudList, type AdminSession
  } from '#lib/cloud/firebase.ts';
  import {
    addClass, addSection, addSubject, deleteClass, deleteSection, deleteSubject, newLibraryId,
    renameClass, renameSection, renameSubject, type LibraryStructure
  } from '#lib/core/library-structure.ts';

  const ACCEPT = ALLOWED_EXT.map((e) => '.' + e).join(',');
  const enabled = cloudEnabled();
  let session = $state<AdminSession | null>(null);
  let ready = $state(false);
  let all = $state<CloudFile[]>([]);
  let trash = $state<TrashItem[]>([]);
  let shardSizes = $state<number[]>([0]);
  let helpers = $state<string[] | null>(null);     // the helper admins; null when this account is not the owner, which hides the panel
  let helperInput = $state('');
  let structure = $state<LibraryStructure>([]);
  let sectionId = $state(''); let classId = $state(''); let subjectId = $state('');
  let category = $state<CategoryId>('notes');
  let picked = $state<File[]>([]);
  let fileInput = $state<HTMLInputElement>();
  let busy = $state(false);
  let step = $state('');
  let note = $state('');
  let problem = $state('');
  let editor = $state<{ level: 'section' | 'class' | 'subject'; mode: 'add' | 'rename' } | null>(null);
  let draftName = $state('');

  const section = $derived(structure.find((item) => item.id === sectionId));
  const cls = $derived(section?.classes.find((item) => item.id === classId));
  const subject = $derived(cls?.subjects.find((item) => item.id === subjectId));
  const inSubject = $derived(cloudForSubject(all, sectionId, classId, subjectId));
  const files = $derived(inSubject.filter((file) => file.category === category).sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true })));
  const catLabel = $derived(CATEGORIES.find((c) => c.id === category)?.label ?? '');
  // Two picked files with the same name would replace each other, so only the first is kept and the rest are refused with a reason.
  const checks = $derived.by(() => {
    const dups = duplicateOf(picked.map((f) => f.name));
    return picked.map((f, i) => {
      const first = dups[i];
      const result = first === null ? checkCloudUpload(f.name, f.size) : { ok: false as const, reason: `another file you picked already has this name (${picked[first].name}). Rename one of them first` };
      return { file: f, result };
    });
  });
  const good = $derived(checks.filter((c) => c.result.ok).map((c) => c.file));
  const used = $derived(storageUsed(all, trash));
  const room = $derived(checkStorage(used, good.map((f) => f.size)));
  const nearlyFull = $derived(used >= STORAGE_LIMIT_BYTES * 0.8);

  const LEFTOVER_HINT = ' Any pieces left behind are cleaned up automatically the next time this page loads.';
  const fail = (e: unknown) => { problem = friendlyCloudError((e as { code?: string })?.code, ''); note = ''; };
  const countIn = (id: CategoryId) => inSubject.filter((file) => file.category === id).length;

  async function refresh() {
    const [index, sections, pending] = await Promise.all([adminList(), adminLibraryStructure(), adminTrash().catch(() => trash)]);
    const files = index.files; shardSizes = index.shardSizes;
    all = files; structure = sections; trash = pending; forgetCloudList();
    void cleanLeftovers(new Set(files.map((file) => file.id)));
  }

  /** Reads the Library fresh, so a change made from another device is seen before anything is added or deleted here. */
  async function freshIndex() {
    const index = await adminList();
    all = index.files; shardSizes = index.shardSizes;
    return index;
  }

  // Pieces left behind by an upload or delete that failed partway are removed here, so they stop using the free storage.
  let cleaning = false;
  async function cleanLeftovers(liveIds: ReadonlySet<string>) {
    if (cleaning) return;
    cleaning = true;
    try {
      const { cleaned } = await emptyTrash(await adminStore(), liveIds);
      if (cleaned) trash = await adminTrash().catch(() => trash);
      if (cleaned && !note && !problem) note = `Cleaned up leftover pieces from ${cleaned} earlier ${cleaned === 1 ? 'upload or delete' : 'uploads or deletes'} that did not finish.`;
    } catch { /* tried again the next time this page loads */ }
    finally { cleaning = false; }
  }

  onMount(() => {
    if (!enabled) { ready = true; return; }
    let stop = () => {};
    void watchAdmin((s) => {
      session = s; ready = true;
      if (s) { refresh().catch(fail); adminListAdmins().then((list) => (helpers = list)).catch(() => (helpers = null)); }
      else { all = []; structure = []; trash = []; helpers = null; }
    }).then((f) => (stop = f)).catch((e) => { fail(e); ready = true; });
    return () => stop();
  });

  async function addHelper(event: SubmitEvent) {
    event.preventDefault();
    const check = checkAdminEmail(helperInput, helpers ?? [], session?.email);
    if (!check.ok) { problem = check.reason; note = ''; return; }
    busy = true; step = 'Adding'; problem = ''; note = '';
    try { await adminAddAdmin(check.email); helpers = await adminListAdmins(); helperInput = ''; note = `${check.email} can now add and delete Library files.`; }
    catch (e) { fail(e); } finally { busy = false; step = ''; }
  }
  async function removeHelper(email: string) {
    if (!confirm(`Remove ${email}? They will not be able to add or delete files any more.`)) return;
    busy = true; step = 'Removing'; problem = ''; note = '';
    try { await adminRemoveAdmin(email); helpers = await adminListAdmins(); note = `${email} is no longer an admin.`; }
    catch (e) { fail(e); } finally { busy = false; step = ''; }
  }

  async function signIn() { busy = true; problem = ''; step = 'Signing in'; try { await adminSignIn(); } catch (e) { fail(e); } finally { busy = false; step = ''; } }
  async function signOut() { try { await adminSignOut(); } catch (e) { fail(e); } picked = []; note = ''; }
  function clearPick() { picked = []; if (fileInput) fileInput.value = ''; }
  function onPick(e: Event) { picked = [...((e.currentTarget as HTMLInputElement).files ?? [])]; note = ''; problem = ''; }

  function startEdit(level: 'section' | 'class' | 'subject', mode: 'add' | 'rename') {
    const current = level === 'section' ? section : level === 'class' ? cls : subject;
    if (mode === 'rename' && !current) return;
    editor = { level, mode }; draftName = mode === 'rename' ? current?.name ?? '' : ''; note = ''; problem = '';
  }

  async function saveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!editor) return;
    const { level, mode } = editor;
    const previousName = level === 'section' ? section?.name : level === 'class' ? cls?.name : subject?.name;
    busy = true; note = ''; problem = '';
    try {
      let next: LibraryStructure;
      if (level === 'section') {
        next = mode === 'add' ? addSection(structure, draftName, newLibraryId()) : renameSection(structure, sectionId, draftName);
      } else if (level === 'class') {
        next = mode === 'add' ? addClass(structure, sectionId, draftName, newLibraryId()) : renameClass(structure, sectionId, classId, draftName);
      } else {
        next = mode === 'add' ? addSubject(structure, sectionId, classId, draftName, newLibraryId()) : renameSubject(structure, sectionId, classId, subjectId, draftName);
      }
      await adminSaveLibraryStructure(next);
      if (mode === 'add' && level === 'section') sectionId = next.at(-1)?.id ?? '';
      if (mode === 'add' && level === 'class') classId = next.find((item) => item.id === sectionId)?.classes.at(-1)?.id ?? '';
      if (mode === 'add' && level === 'subject') subjectId = next.find((item) => item.id === sectionId)?.classes.find((item) => item.id === classId)?.subjects.at(-1)?.id ?? '';
      structure = next; editor = null; note = `${mode === 'add' ? 'Added' : 'Renamed'} ${level}${previousName ? ` ${previousName}` : ''}.`;
    } catch (e) { fail(e); }
    finally { busy = false; }
  }

  async function removeLevel(level: 'section' | 'class' | 'subject') {
    const target = level === 'section' ? section : level === 'class' ? cls : subject;
    if (!target) return;
    busy = true; step = 'Checking the Library'; note = ''; problem = '';
    let victims: CloudFile[];
    try {
      const index = await freshIndex();      // files added from another device must be included, or they would be left behind with no section
      victims = index.files.filter((file) => file.section === sectionId
        && (level === 'section' || file.cls === classId)
        && (level !== 'subject' || file.subject === subjectId));
    } catch (e) { fail(e); busy = false; step = ''; return; }
    const detail = victims.length ? ` This also permanently deletes ${victims.length} uploaded ${victims.length === 1 ? 'file' : 'files'}.` : '';
    if (!confirm(`Delete ${level} “${target.name}” and everything inside it?${detail}`)) { busy = false; step = ''; return; }
    step = 'Deleting';
    try {
      const next = level === 'section' ? deleteSection(structure, sectionId)
        : level === 'class' ? deleteClass(structure, sectionId, classId)
          : deleteSubject(structure, sectionId, classId, subjectId);
      // One all-or-nothing write removes the catalog entry and every file in it; the pieces are then cleared (see deleteTree).
      const { leftovers } = await deleteTree(await adminStore(), victims, next);
      structure = next; all = all.filter((file) => !victims.some((victim) => victim.id === file.id));
      if (level === 'section') { sectionId = ''; classId = ''; subjectId = ''; }
      else if (level === 'class') { classId = ''; subjectId = ''; }
      else subjectId = '';
      editor = null; note = `Deleted ${target.name}.${leftovers ? ` ${leftovers === 1 ? 'One file\'s' : `${leftovers} files'`} storage will be freed automatically the next time this page loads.` : ''}`;
    } catch (e) {
      fail(e); problem += ' This delete is all-or-nothing, so the page now shows what is really still there. You can try again.';
      try { await refresh(); } catch { /* keep the last list */ }     // the answer may have been lost after the write went through
    } finally { busy = false; step = ''; }
  }

  async function upload() {
    if (!good.length || !subject) return;
    const batch = [...good]; const where = { section: sectionId, cls: classId, subject: subjectId, category };
    busy = true; step = 'Checking the Library'; problem = ''; note = '';
    // The Library is read fresh first: a file added or replaced from another device must count for the room check and the replace check.
    let here: CloudFile[];
    try {
      const index = await freshIndex();
      const left = checkStorage(storageUsed(index.files, trash), batch.map((f) => f.size));
      if (!left.ok) { problem = left.reason + '.'; busy = false; step = ''; return; }
      here = cloudForSubject(index.files, where.section, where.cls, where.subject).filter((x) => x.category === where.category);
    } catch (e) { fail(e); busy = false; step = ''; return; }
    const same = batch.filter((f) => sameNameAs(here, f.name).length);
    if (same.length && !confirm(`${same.map((f) => f.name).join(', ')} already ${same.length === 1 ? 'exists' : 'exist'} here. Replace ${same.length === 1 ? 'it' : 'them'}?`)) { busy = false; step = ''; return; }
    let added = 0;
    try {
      const store = await adminStore();
      const sizes = [...shardSizes];      // how full each index document is, kept up to date as this batch goes in
      for (const [i, file] of batch.entries()) {
        const label = `${file.name} (${i + 1} of ${batch.length})`;
        step = `Uploading ${label}`;
        const bytes = entryBytesFor(file.name); const shard = chooseShard(sizes, bytes);
        // A file with the same name here is replaced in one step: the new copy goes in and the old one comes out together.
        const replaces = sameNameAs(here, file.name).map((x) => ({ id: x.id, parts: x.parts, shard: x.shard }));
        await uploadCloud(store, new Uint8Array(await file.arrayBuffer()), { name: file.name, ...where, shard, shardCount: sizes.length, replaces },
          (d, t) => (step = `Uploading ${label}: ${d} of ${t} parts`));
        if (shard === sizes.length) sizes.push(bytes); else sizes[shard] += bytes;
        added++;
      }
      note = `Added ${added} ${added === 1 ? 'file' : 'files'} to ${subject.name} › ${catLabel}. Students see it straight away.`;
      clearPick();
    } catch (e) {
      fail(e);
      if (added) note = `Added ${added} of ${batch.length} before the problem.`;
    } finally { try { await refresh(); } catch { /* the list shows the last known state */ } busy = false; step = ''; }
  }

  async function remove(f: CloudFile) {
    if (!confirm(`Delete "${f.title}" from ${subject?.name} › ${catLabel}? Students will not be able to download it any more.`)) return;
    busy = true; problem = ''; note = ''; step = 'Deleting';
    try {
      // Fresh look first: if it was already deleted from another device there is nothing to do, and the part count comes from the real entry.
      const current = (await freshIndex()).files.find((x) => x.id === f.id);
      if (current) { await deleteCloud(await adminStore(), current.id, current.parts, current.shard); note = `Deleted ${f.title}.`; }
      else note = `${f.title} was already deleted.`;
    }
    catch (e) { fail(e); problem += LEFTOVER_HINT; }
    finally { try { await refresh(); } catch { /* keep the last list */ } busy = false; step = ''; }
  }
</script>

<svelte:head><title>Library admin | {SITE.name}</title><meta name="robots" content="noindex" /><meta name="description" content="Add or delete Library files." /></svelte:head>

<div class="set admin">
  <p class="back"><a href="/settings">← Settings</a></p>
  <h1>Library admin</h1>
  <p class="lede">Add or delete the files students download from the Library. Students see a change straight away.</p>

  {#if !enabled}
    <section class="card">
      <h2>Not set up yet</h2>
      <p class="muted">Uploads need the Firebase web app settings. Follow “Set up uploads” in <code>docs/CLASS_LIBRARY.md</code> (about 10 minutes, no payment needed), then fill in <code>SITE.firebase</code> in <code>src/lib/site.ts</code>.</p>
    </section>
  {:else if !ready}
    <p class="muted">Checking sign-in…</p>
  {:else if !session}
    <section class="card">
      <h2>Sign in</h2>
      <p class="muted">Sign in with the admin Google account. Only the owner account and the admins the owner has added can add or delete files; everyone else can only download.</p>
      <button class="btn" type="button" onclick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
    </section>
  {:else}
    <div class="who">Signed in as <strong>{session.email}</strong> · <button class="link" type="button" onclick={signOut}>Sign out</button></div>
    <h2>Library structure</h2>
    <div class="hierarchy">
      <section class="level">
        <h3>Section</h3>
        <select aria-label="Section" bind:value={sectionId} disabled={busy || !structure.length} onchange={() => { classId = ''; subjectId = ''; editor = null; clearPick(); }}>
          <option value="">{structure.length ? 'Choose a section' : 'No sections yet'}</option>
          {#each structure as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
        </select>
        <div class="actions">
          <button class="btn small" type="button" onclick={() => startEdit('section', 'add')} disabled={busy}>Add section</button>
          <button class="btn small" type="button" onclick={() => startEdit('section', 'rename')} disabled={busy || !section}>Rename</button>
          <button class="btn small danger" type="button" onclick={() => removeLevel('section')} disabled={busy || !section}>Delete</button>
        </div>
        {#if editor?.level === 'section'}
          <form class="editor" onsubmit={saveEdit}>
            <label for="section-name">{editor.mode === 'add' ? 'New section name' : 'Rename section'}</label>
            <input id="section-name" bind:value={draftName} maxlength="80" required />
            <div class="actions"><button class="btn small" disabled={busy}>{editor.mode === 'add' ? 'Save section' : 'Save name'}</button><button class="btn small" type="button" onclick={() => (editor = null)}>Cancel</button></div>
          </form>
        {/if}
      </section>

      <section class="level">
        <h3>Class</h3>
        <select aria-label="Class" bind:value={classId} disabled={busy || !section?.classes.length} onchange={() => { subjectId = ''; editor = null; clearPick(); }}>
          <option value="">{section?.classes.length ? 'Choose a class' : 'No classes yet'}</option>
          {#each section?.classes ?? [] as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
        </select>
        <div class="actions">
          <button class="btn small" type="button" onclick={() => startEdit('class', 'add')} disabled={busy || !section}>Add class</button>
          <button class="btn small" type="button" onclick={() => startEdit('class', 'rename')} disabled={busy || !cls}>Rename</button>
          <button class="btn small danger" type="button" onclick={() => removeLevel('class')} disabled={busy || !cls}>Delete</button>
        </div>
        {#if editor?.level === 'class'}
          <form class="editor" onsubmit={saveEdit}>
            <label for="class-name">{editor.mode === 'add' ? 'New class name' : 'Rename class'}</label>
            <input id="class-name" bind:value={draftName} maxlength="80" required />
            <div class="actions"><button class="btn small" disabled={busy}>{editor.mode === 'add' ? 'Save class' : 'Save name'}</button><button class="btn small" type="button" onclick={() => (editor = null)}>Cancel</button></div>
          </form>
        {/if}
      </section>

      <section class="level">
        <h3>Subject</h3>
        <select aria-label="Subject" bind:value={subjectId} disabled={busy || !cls?.subjects.length} onchange={() => { editor = null; clearPick(); }}>
          <option value="">{cls?.subjects.length ? 'Choose a subject' : 'No subjects yet'}</option>
          {#each cls?.subjects ?? [] as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
        </select>
        <div class="actions">
          <button class="btn small" type="button" onclick={() => startEdit('subject', 'add')} disabled={busy || !cls}>Add subject</button>
          <button class="btn small" type="button" onclick={() => startEdit('subject', 'rename')} disabled={busy || !subject}>Rename</button>
          <button class="btn small danger" type="button" onclick={() => removeLevel('subject')} disabled={busy || !subject}>Delete</button>
        </div>
        {#if editor?.level === 'subject'}
          <form class="editor" onsubmit={saveEdit}>
            <label for="subject-name">{editor.mode === 'add' ? 'New subject name' : 'Rename subject'}</label>
            <input id="subject-name" bind:value={draftName} maxlength="80" required />
            <div class="actions"><button class="btn small" disabled={busy}>{editor.mode === 'add' ? 'Save subject' : 'Save name'}</button><button class="btn small" type="button" onclick={() => (editor = null)}>Cancel</button></div>
          </form>
        {/if}
      </section>
    </div>

    {#if subject}
        <div class="chips" role="group" aria-label="Category">
          {#each CATEGORIES as c (c.id)}
            <button type="button" class:on={category === c.id} aria-pressed={category === c.id} onclick={() => { category = c.id; clearPick(); }}>{c.label} ({countIn(c.id)})</button>
          {/each}
        </div>

        <h2>Add to {subject.name} · {catLabel}</h2>
        <div class="card">
          <label for="files">Choose files</label>
          <input id="files" type="file" multiple accept={ACCEPT} bind:this={fileInput} onchange={onPick} disabled={busy} />
          <p class="muted small">Up to {fmtBytes(CLOUD_MAX_BYTES)} each. For bigger files, use a Google Drive link instead.</p>
          {#if checks.length}
            <ul class="picked">
              {#each checks as c, i (i + ':' + c.file.name)}
                <li class:bad={!c.result.ok}>{c.file.name} <span class="muted">{fmtBytes(c.file.size)}</span>
                  {#if !c.result.ok}<div class="why">Not added: {c.result.reason}.</div>{/if}</li>
              {/each}
            </ul>
          {/if}
          {#if good.length && !room.ok}<div class="why">Not added: {room.reason}.</div>{/if}
          <button class="btn" type="button" onclick={upload} disabled={busy || !good.length || !room.ok}>
            {good.length ? `Add ${good.length} ${good.length === 1 ? 'file' : 'files'} to ${catLabel}` : 'Add files'}
          </button>
        </div>

        <h2>Files in {subject.name} · {catLabel}</h2>
        {#if files.length}
          <ul class="rows">
            {#each files as f (f.id)}
              <li class="row"><span class="grow">{f.title}<div class="sub">{f.name} · {fmtBytes(f.size)}{f.added ? ` · ${f.added}` : ''}</div></span>
                <button class="btn small danger" type="button" onclick={() => remove(f)} disabled={busy}>Delete</button></li>
            {/each}
          </ul>
        {:else}<p class="muted">No uploaded files here yet.</p>{/if}
    {:else}
      <p class="muted">Add or choose a subject to upload and manage its files.</p>
    {/if}

    <p class="muted small usage">Storage used: about {fmtBytes(used)} of {fmtBytes(SPARK_STORAGE_BYTES)} free. Uploads stop at {fmtBytes(STORAGE_LIMIT_BYTES)} to keep some room spare.</p>
    {#if helpers}
      <h2>Admins</h2>
      <div class="card">
        <p class="muted small">You are the owner. These Google accounts can also add and delete files. Only you can change this list.</p>
        {#if helpers.length}
          <ul class="rows">{#each helpers as email (email)}<li class="row"><span class="grow">{email}</span><button class="btn small danger" type="button" onclick={() => removeHelper(email)} disabled={busy}>Remove</button></li>{/each}</ul>
        {:else}<p class="muted">No other admins yet.</p>{/if}
        <form onsubmit={addHelper}>
          <label for="helper-email">Add an admin (their Google email)</label>
          <input id="helper-email" type="email" bind:value={helperInput} maxlength="254" autocomplete="off" placeholder="name@gmail.com" />
          <button class="btn" disabled={busy || !helperInput.trim()}>Add admin</button>
        </form>
      </div>
    {/if}
    {#if nearlyFull}<p class="warn" role="status">Storage is nearly full. Delete files you no longer need, or put large ones on Google Drive and add a link instead.</p>{/if}
  {/if}

  <p role="status" aria-live="polite" class="muted status">{busy ? `${step || 'Working'}…` : ''}</p>
  {#if note}<p class="ok" role="status">{note}</p>{/if}
  {#if problem}<p class="warn" role="alert">{problem}</p>{/if}
</div>

<style>
  .back { margin: 0 0 10px; } .back a { color: var(--muted); }
  h2 { margin: 22px 0 8px; font-size: 1.1rem; }
  label { display: block; font-weight: 600; margin: 12px 0 6px; }
  select, input[type='file'], input[type='email'] { display: block; box-sizing: border-box; width: 100%; font: inherit; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
  select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card > .btn { margin-top: 14px; }
  .small { font-size: .88rem; margin: 8px 0 0; } .usage { margin-top: 22px; }
  .who { margin: 0 0 6px; } .link { font: inherit; background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .hierarchy { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .level { min-width: 0; }
  .level h3 { margin: 0 0 8px; font-size: 1rem; }
  .level select { width: 100%; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .editor { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .chips { margin: 16px 0 0; flex-wrap: wrap; overflow: visible; }
  .picked { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; overflow-wrap: anywhere; }
  .picked .bad { color: var(--warn); } .why { font-size: .88rem; }
  .status { min-height: 1.4em; margin: 16px 0 0; }
  .ok { color: var(--accent); font-weight: 600; } .warn { color: var(--warn); font-weight: 600; }
  code { overflow-wrap: anywhere; }
  @media (max-width: 720px) { .hierarchy { grid-template-columns: 1fr; gap: 22px; } }
</style>
