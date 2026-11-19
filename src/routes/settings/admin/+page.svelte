<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { ALLOWED_EXT, CATEGORIES, MAX_LABEL, categoryKey, cleanLabel, type CategoryId } from '#lib/core/class-library.ts';
  import {
    CLOUD_MAX_BYTES, SPARK_STORAGE_BYTES, checkCloudUpload, checkStorage, chooseShard, cloudForSubject, deleteCloud, deleteTree, duplicateOf, emptyTrash,
    ENTRY_OVERHEAD_BYTES, PART_OVERHEAD_BYTES, addLink, checkLinkUrl, cleanCredit, entryBytesFor, entryExtraBytes, friendlyCloudError, linkName, CREDIT_LIMITS, relabelCloud, sameNameAs, storageUsed, uploadCloud, type CloudFile, type TrashItem
  } from '#lib/core/cloud-library.ts';
  import { isValidEmail, normalizeEmail } from '#lib/core/admins.ts';
  import {
    adminAddAdmin, adminLibraryStructure, adminList, adminListAdmins, adminRemoveAdmin, adminSaveLibraryStructure, adminSignIn, adminSignOut, adminStore,
    adminTrash, cloudEnabled, watchAdmin, forgetCloudList, type AdminSession
  } from '#lib/cloud/firebase.ts';
  import {
    addClass, addSection, addSubject, deleteClass, deleteSection, deleteSubject, newLibraryId,
    renameClass, renameSection, renameSubject, type LibraryStructure
  } from '#lib/core/library-structure.ts';
  import StudentModeration from '#lib/components/StudentModeration.svelte';
  import { withDetail } from '#lib/core/error-detail.ts';
  import { makeThumb } from '#lib/core/thumb.ts';

  const ACCEPT = ALLOWED_EXT.map((e) => '.' + e).join(',');
  const enabled = cloudEnabled();
  let session = $state<AdminSession | null>(null);
  let ready = $state(false);
  let all = $state<CloudFile[]>([]);
  let shardSizes = $state<number[]>([0]);       // bytes used in each index document, so a new file goes where there is room
  // What the live student documents take of the shared free storage, so the meter and the room check count them too.
  let studentTotals = $state({ bytes: 0, count: 0 });
  let trashItems = $state<TrashItem[]>([]);     // pieces that may still need deleting (they still use storage)
  let helpers = $state<string[] | null>(null);  // the helper admins; null for anyone but the owner
  let newAdmin = $state('');
  let tidied = false;
  let structure = $state<LibraryStructure>([]);
  let sectionId = $state(''); let classId = $state(''); let subjectId = $state('');
  // Which category chip is open: a built-in id, 'other:<label>' for a custom label, 'other' (older files with no label) or 'new' (writing a new label).
  let activeKey = $state('notes');
  let draftLabel = $state('');
  let renaming = $state(false); let draftRename = $state('');
  let picked = $state<File[]>([]);
  let fileInput = $state<HTMLInputElement>();
  let linkUrl = $state(''); let linkTitle = $state('');
  let thumbData = $state(''); let thumbNote = $state(''); let thumbInput = $state<HTMLInputElement>();
  let credBy = $state(''); let credLink = $state(''); let credLicense = $state(''); let credNote = $state('');
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
  const customChips = $derived.by(() => {
    const seen = new Map<string, { key: string; label: string; count: number }>();
    for (const f of inSubject) {
      const key = categoryKey(f); if (!key.startsWith('other:')) continue;
      const hit = seen.get(key); if (hit) hit.count++; else seen.set(key, { key, label: f.label ?? '', count: 1 });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
  });
  const plainOther = $derived(inSubject.filter((f) => categoryKey(f) === 'other').length);   // older files saved as plain "Other"
  const category = $derived<CategoryId>(activeKey === 'new' || activeKey.startsWith('other') ? 'other' : (activeKey as CategoryId));
  const labelText = $derived(activeKey === 'new' ? cleanLabel(draftLabel) : activeKey.startsWith('other:') ? (customChips.find((c) => c.key === activeKey)?.label ?? '') : '');
  const viewKey = $derived(activeKey === 'new' ? (labelText ? `other:${labelText.toLowerCase()}` : '') : activeKey);
  const files = $derived(inSubject.filter((file) => viewKey && categoryKey(file) === viewKey).sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true })));
  const catLabel = $derived(activeKey === 'new' ? (labelText || 'New label') : category === 'other' ? (labelText || 'Other') : (CATEGORIES.find((c) => c.id === category)?.label ?? ''));
  const needsLabel = $derived(activeKey === 'new' && !labelText);
  const linkCheck = $derived(linkUrl.trim() ? checkLinkUrl(linkUrl) : undefined);
  const credit = $derived(cleanCredit({ by: credBy, link: credLink, license: credLicense, note: credNote }));
  const creditLinkBad = $derived(!!credLink.trim() && !cleanCredit({ link: credLink }));
  // A label chip disappears once its last file is deleted (or when another subject is opened): go back to Notes.
  $effect(() => {
    if (activeKey.startsWith('other:') && !customChips.some((c) => c.key === activeKey)) activeKey = 'notes';
    else if (activeKey === 'other' && !plainOther) activeKey = 'notes';
  });
  const checks = $derived(picked.map((f) => ({ file: f, result: checkCloudUpload(f.name, f.size) })));
  const good = $derived(checks.filter((c) => c.result.ok).map((c) => c.file));
  const used = $derived(storageUsed(all, trashItems) + studentTotals.bytes + studentTotals.count * (ENTRY_OVERHEAD_BYTES + 2 * PART_OVERHEAD_BYTES));

  const fail = (e: unknown) => { problem = withDetail(friendlyCloudError((e as { code?: string })?.code, ''), e); note = ''; };
  const countIn = (key: string) => inSubject.filter((file) => categoryKey(file) === key).length;

  async function refresh() {
    // adminList throws when part of the index cannot be read: better to stop than to show (or change) a Library with files missing.
    const [index, sections, trash] = await Promise.all([adminList(), adminLibraryStructure(), adminTrash().catch(() => trashItems)]);
    all = index.files; shardSizes = index.shardSizes.length ? index.shardSizes : [0]; structure = sections; trashItems = trash; forgetCloudList();
    void tidy();
  }

  /** Reads the Library fresh, so a change made from another device is seen before anything is added or deleted here. */
  async function freshIndex() {
    const index = await adminList();
    all = index.files; shardSizes = index.shardSizes.length ? index.shardSizes : [0];
    return index;
  }

  /** Once per visit: remove pieces left behind by an upload or delete that was cut short. Files that are still listed are never touched. */
  async function tidy() {
    if (tidied || !trashItems.length) return;
    tidied = true;
    try {
      const r = await emptyTrash(await adminStore(), new Set(all.map((f) => f.id)));
      if (r.cleaned || r.failed === 0) trashItems = await adminTrash();
    } catch { tidied = false; }   // try again at the next refresh
  }

  async function loadHelpers() { try { helpers = await adminListAdmins(); } catch { helpers = null; } }
  async function addHelper() {
    const email = normalizeEmail(newAdmin);
    if (!isValidEmail(email)) { problem = 'Type a full email address, like name@gmail.com.'; note = ''; return; }
    if (helpers?.includes(email)) { note = `${email} is already an admin.`; problem = ''; return; }
    busy = true; problem = ''; note = ''; step = 'Adding';
    try { await adminAddAdmin(email); newAdmin = ''; await loadHelpers(); note = `${email} can now add and delete Library files once they sign in with that Google account.`; }
    catch (e) { fail(e); } finally { busy = false; step = ''; }
  }
  async function removeHelper(email: string) {
    if (!confirm(`Remove ${email}? They will no longer be able to change the Library.`)) return;
    busy = true; problem = ''; note = ''; step = 'Removing';
    try { await adminRemoveAdmin(email); await loadHelpers(); note = `${email} was removed.`; }
    catch (e) { fail(e); } finally { busy = false; step = ''; }
  }

  onMount(() => {
    if (!enabled) { ready = true; return; }
    let stop = () => {};
    void watchAdmin((s) => {
      session = s; ready = true;
      if (s) { refresh().catch(fail); void loadHelpers(); } else { all = []; structure = []; trashItems = []; helpers = null; tidied = false; }
    }).then((f) => (stop = f)).catch((e) => { fail(e); ready = true; });
    return () => stop();
  });

  async function signIn() { busy = true; problem = ''; step = 'Signing in'; try { await adminSignIn(); } catch (e) { fail(e); } finally { busy = false; step = ''; } }
  async function signOut() { try { await adminSignOut(); } catch (e) { fail(e); } picked = []; note = ''; }
  function clearPick() { picked = []; if (fileInput) fileInput.value = ''; }
  function onPick(e: Event) { picked = [...((e.currentTarget as HTMLInputElement).files ?? [])]; note = ''; problem = ''; }
  function clearThumb() { thumbData = ''; thumbNote = ''; if (thumbInput) thumbInput.value = ''; }
  function clearLink() { linkUrl = ''; linkTitle = ''; clearThumb(); }
  function clearCredit() { credBy = ''; credLink = ''; credLicense = ''; credNote = ''; }
  async function onThumb(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    thumbData = ''; thumbNote = '';
    if (!file) return;
    const made = await makeThumb(file);
    if (made.ok) thumbData = made.data;
    else { thumbNote = `The thumbnail was not used: ${made.reason}.`; if (thumbInput) thumbInput.value = ''; }
  }

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
      // Files added from another device must be included, or they would be left behind with no section.
      const index = await freshIndex();
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
      // The new catalog and the removal of every file go in as one all-or-nothing write, so students never see a catalog pointing at missing files.
      let leftovers = 0;
      if (victims.length) leftovers = (await deleteTree(await adminStore(), victims, next)).leftovers;
      else await adminSaveLibraryStructure(next);
      structure = next; all = all.filter((file) => !victims.some((victim) => victim.id === file.id));
      if (level === 'section') { sectionId = ''; classId = ''; subjectId = ''; }
      else if (level === 'class') { classId = ''; subjectId = ''; }
      else subjectId = '';
      editor = null; note = `Deleted ${target.name}.${leftovers ? ` The stored data of ${leftovers} ${leftovers === 1 ? 'file' : 'files'} will be cleaned up automatically the next time this page opens.` : ''}`;
    } catch (e) { fail(e); }
    finally { busy = false; step = ''; }
  }

  /** Opens a category chip (and closes the rename box of the one before it). */
  function choose(key: string) { activeKey = key; renaming = false; clearPick(); }
  /** The files of this subject under the open label, read fresh so a file added from another device is included. */
  async function labelFilesNow(): Promise<CloudFile[]> {
    const index = await freshIndex();
    return cloudForSubject(index.files, sectionId, classId, subjectId).filter((f) => categoryKey(f) === viewKey);
  }
  function startRenameLabel() { renaming = true; draftRename = labelText || (category === 'other' ? '' : catLabel); note = ''; problem = ''; }

  /** Renames the open label. Built-in names (Notes and so on) can be renamed too: their files then carry the new label. */
  async function saveRenameLabel(event: SubmitEvent) {
    event.preventDefault();
    const next = cleanLabel(draftRename);
    if (!next || !subject || !viewKey) return;
    if (next.toLowerCase() === catLabel.toLowerCase()) { renaming = false; return; }
    busy = true; step = 'Renaming'; note = ''; problem = '';
    try {
      const victims = await labelFilesNow();
      if (!victims.length) { note = 'There are no files under that label any more.'; renaming = false; await refresh(); return; }
      const clash = customChips.some((c) => c.key === `other:${next.toLowerCase()}` && c.key !== viewKey);
      if (clash && !confirm(`“${next}” already exists in ${subject.name}. Move these files into it?`)) return;
      await relabelCloud(await adminStore(), victims, next);
      renaming = false;
      await refresh();
      activeKey = `other:${next.toLowerCase()}`;
      note = `Renamed ${catLabel === next ? 'the label' : `“${catLabel}”`} to “${next}”. Students see it straight away.`;
    } catch (e) {
      fail(e); try { await refresh(); } catch { /* the list shows the last known state */ }
    } finally { busy = false; step = ''; }
  }

  /** Deletes the open label together with its uploaded files (a label is only what its files carry), after asking. */
  async function removeLabel() {
    if (!subject || !viewKey) return;
    const name = catLabel;
    busy = true; step = 'Checking the Library'; note = ''; problem = '';
    let victims: CloudFile[];
    try { victims = await labelFilesNow(); } catch (e) { fail(e); busy = false; step = ''; return; }
    if (!victims.length) { note = 'There are no files under that label any more.'; busy = false; step = ''; return; }
    if (!confirm(`Delete the label “${name}” from ${subject.name}? This also permanently deletes ${victims.length} uploaded ${victims.length === 1 ? 'file' : 'files'}.`)) { busy = false; step = ''; return; }
    step = 'Deleting';
    try {
      // One file at a time, and the section > class > subject catalog is not rewritten, so nothing another admin changed meanwhile is overwritten.
      const store = await adminStore(); let done = 0;
      try { for (const f of victims) { await deleteCloud(store, f.id, f.parts, f.shard ?? 0); done++; } }
      finally { if (done) all = all.filter((file) => !victims.slice(0, done).some((victim) => victim.id === file.id)); }
      renaming = false;
      note = `Deleted “${name}”.`;
    } catch (e) { fail(e); try { await refresh(); } catch { /* the list shows the last known state */ } }
    finally { busy = false; step = ''; }
  }

  async function upload() {
    if (!good.length || !subject || needsLabel) return;
    const newKey = labelText ? `other:${labelText.toLowerCase()}` : '';
    busy = true; step = 'Checking the Library'; problem = ''; note = '';
    // The Library is read fresh first: a file added or replaced from another device must count for the room check and the replace check.
    try { await freshIndex(); } catch (e) { fail(e); busy = false; step = ''; return; }
    // Two picked files whose names differ only in capitals would replace each other, so the later one is left out.
    const repeat = duplicateOf(good.map((f) => f.name));
    const batch = good.filter((_, i) => repeat[i] === null);
    const skipped = good.length - batch.length;
    const room = checkStorage(used, batch.map((f) => f.size));
    if (!room.ok) { problem = room.reason; note = ''; busy = false; step = ''; return; }
    const same = batch.filter((f) => sameNameAs(files, f.name).length);
    if (same.length && !confirm(`${same.map((f) => f.name).join(', ')} already ${same.length === 1 ? 'exists' : 'exist'} here. Replace ${same.length === 1 ? 'it' : 'them'}?`)) { busy = false; step = ''; return; }
    let added = 0;
    try {
      const store = await adminStore();
      const sizes = [...shardSizes];   // kept up to date as files are added, so the next one lands in an index document with room
      for (const [i, file] of batch.entries()) {
        const label = `${file.name} (${i + 1} of ${batch.length})`;
        step = `Uploading ${label}`;
        const entryBytes = entryBytesFor(file.name, entryExtraBytes({ credit }));
        const shard = chooseShard(sizes, entryBytes);
        const replaces = sameNameAs(files, file.name).map((old) => ({ id: old.id, parts: old.parts, shard: old.shard ?? 0 }));
        // New copy in and old copy out happen as one write, so students never see two copies or none.
        await uploadCloud(store, new Uint8Array(await file.arrayBuffer()), { name: file.name, section: sectionId, cls: classId, subject: subjectId, category, ...(labelText ? { label: labelText } : {}), ...(credit ? { credit } : {}), shard, shardCount: sizes.length, replaces },
          (d, t) => (step = `Uploading ${label}: ${d} of ${t} parts`));
        added++; sizes[shard] = (sizes[shard] ?? 0) + entryBytes;
      }
      note = `Added ${added} ${added === 1 ? 'file' : 'files'} to ${subject.name} › ${catLabel}. Students see it straight away.${skipped ? ` ${skipped} with a repeated name ${skipped === 1 ? 'was' : 'were'} left out.` : ''}`;
      clearPick(); clearCredit();
    } catch (e) {
      fail(e);
      if (added) note = `Added ${added} of ${batch.length} before the problem.`;
    } finally {
      try { await refresh(); } catch { /* the list shows the last known state */ }
      if (added && activeKey === 'new' && newKey) { activeKey = newKey; draftLabel = ''; }   // the label now has files, so it has its own chip
      busy = false; step = '';
    }
  }

  async function addLinkEntry() {
    const checked = linkCheck;
    if (!checked?.ok || !subject || needsLabel) return;
    if (creditLinkBad) { problem = 'The source link in the acknowledgement is not a public web address. Fix it or leave it empty.'; return; }
    busy = true; step = 'Checking the Library'; problem = ''; note = '';
    try { await freshIndex(); } catch (e) { fail(e); busy = false; step = ''; return; }
    const name = linkName(checked.url);
    const room = checkStorage(used, [thumbData.length]);
    if (!room.ok) { problem = room.reason; busy = false; step = ''; return; }
    const same = sameNameAs(files, name);
    if (same.length && !confirm('This link is already in this list. Replace it?')) { busy = false; step = ''; return; }
    try {
      const store = await adminStore();
      const sizes = [...shardSizes];
      const shard = chooseShard(sizes, entryBytesFor(name, entryExtraBytes({ url: checked.url, thumb: thumbData, credit })));
      step = 'Adding the link';
      await addLink(store, {
        url: checked.url, title: linkTitle, section: sectionId, cls: classId, subject: subjectId, category,
        ...(labelText ? { label: labelText } : {}), ...(thumbData ? { thumb: thumbData } : {}), ...(credit ? { credit } : {}),
        shard, shardCount: sizes.length, replaces: same.map((file) => ({ id: file.id, parts: file.parts, shard: file.shard ?? 0 }))
      });
      note = `Added the link to ${subject.name} · ${catLabel}. Students see it straight away.`;
      clearLink(); clearCredit();
    } catch (e) { fail(e); }
    finally {
      try { await refresh(); } catch { /* the list shows the last known state */ }
      if (activeKey === 'new' && labelText) { activeKey = `other:${labelText.toLowerCase()}`; draftLabel = ''; }
      busy = false; step = '';
    }
  }

  async function remove(f: CloudFile) {
    if (!confirm(`Delete "${f.title}" from ${subject?.name} › ${catLabel}? Students will not be able to download it any more.`)) return;
    busy = true; problem = ''; note = ''; step = 'Deleting';
    try {
      // A fresh look first: if it was already deleted from another device there is nothing to do, and the part count comes from the real entry.
      const current = (await freshIndex()).files.find((x) => x.id === f.id);
      if (current) { await deleteCloud(await adminStore(), current.id, current.parts, current.shard ?? 0); note = `Deleted ${f.title}.`; }
      else note = `${f.title} was already deleted.`;
    }
    catch (e) { fail(e); }
    finally { try { await refresh(); } catch { /* keep the last list */ } busy = false; step = ''; }
  }
</script>

<svelte:head><title>Admin | {SITE.name}</title><meta name="robots" content="noindex" /><meta name="description" content="Add or delete Library files." /></svelte:head>

<div class="set admin">
  <p class="back"><a href="/settings">← Settings</a></p>
  <h1>Admin</h1>

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
      <button class="btn" type="button" onclick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
    </section>
  {:else}
    <div class="who">Signed in as <strong>{session.email}</strong> · <button class="link" type="button" onclick={signOut}>Sign out</button></div>
    <StudentModeration onUsage={(u) => (studentTotals = u)} />
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
          {#each CATEGORIES.filter((c) => c.id !== 'other') as c (c.id)}
            <button type="button" class:on={activeKey === c.id} aria-pressed={activeKey === c.id} onclick={() => choose(c.id)}>{c.label} ({countIn(c.id)})</button>
          {/each}
          {#each customChips as c (c.key)}
            <button type="button" class:on={activeKey === c.key} aria-pressed={activeKey === c.key} onclick={() => choose(c.key)}>{c.label} ({c.count})</button>
          {/each}
          {#if plainOther}
            <button type="button" class:on={activeKey === 'other'} aria-pressed={activeKey === 'other'} onclick={() => choose('other')}>Other ({plainOther})</button>
          {/if}
          <button type="button" class:on={activeKey === 'new'} aria-pressed={activeKey === 'new'} onclick={() => choose('new')}>+ Custom label</button>
        </div>
        {#if activeKey !== 'new'}
          <div class="actions">
            <button class="btn small" type="button" onclick={startRenameLabel} disabled={busy || !files.length}>Rename label</button>
            <button class="btn small danger" type="button" onclick={removeLabel} disabled={busy || !files.length}>Delete label</button>
          </div>
          {#if renaming}
            <form class="editor" onsubmit={saveRenameLabel}>
              <label for="rename-label">Rename “{catLabel}”</label>
              <input id="rename-label" bind:value={draftRename} maxlength={MAX_LABEL} required />
              <div class="actions"><button class="btn small" disabled={busy || !cleanLabel(draftRename)}>Save name</button><button class="btn small" type="button" onclick={() => (renaming = false)}>Cancel</button></div>
            </form>
          {/if}
        {/if}
        {#if activeKey === 'new'}
          <div class="editor">
            <label for="cat-label">Write your own label</label>
            <input id="cat-label" bind:value={draftLabel} maxlength={MAX_LABEL} placeholder="e.g. Lab manuals" disabled={busy} />
          </div>
        {/if}

        <h2>Add to {subject.name} · {catLabel}</h2>
        <div class="card">
          <label for="files">Choose files</label>
          <input id="files" type="file" multiple accept={ACCEPT} bind:this={fileInput} onchange={onPick} disabled={busy} />
          <p class="muted small">Up to {fmtBytes(CLOUD_MAX_BYTES)} each. For bigger files, use a Google Drive link instead.</p>
          {#if checks.length}
            <ul class="picked">
              {#each checks as c (c.file.name + c.file.size)}
                <li class:bad={!c.result.ok}>{c.file.name} <span class="muted">{fmtBytes(c.file.size)}</span>
                  {#if !c.result.ok}<div class="why">Not added: {c.result.reason}.</div>{/if}</li>
              {/each}
            </ul>
          {/if}
          <button class="btn" type="button" onclick={upload} disabled={busy || !good.length || needsLabel}>
            {good.length ? `Add ${good.length} ${good.length === 1 ? 'file' : 'files'} to ${catLabel}` : 'Add files'}
          </button>
        </div>

        <p class="or muted" aria-hidden="true">or</p>
        <div class="card">
          <label for="link-url">Add a link instead</label>
          <input id="link-url" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com/notes.pdf" bind:value={linkUrl} disabled={busy} />
          <p class="muted small">A link to a file on any public website. Nothing is stored here, so it uses no storage. Students open it on the original site.</p>
          {#if linkCheck && !linkCheck.ok}<div class="why bad-text">Not added: {linkCheck.reason}.</div>{/if}
          <label for="link-title">Title <span class="muted">(optional)</span></label>
          <input id="link-title" maxlength="120" placeholder="Leave empty to use the name in the link" bind:value={linkTitle} disabled={busy} />
          <label for="link-thumb">Thumbnail <span class="muted">(optional)</span></label>
          <input id="link-thumb" type="file" accept="image/jpeg,image/png,image/webp" bind:this={thumbInput} onchange={onThumb} disabled={busy} />
          <p class="muted small">A picture shown beside the title. It is made small on this device. Leave it out to show the file type instead.</p>
          {#if thumbData}<div class="thumbrow"><img class="thumb-mini" src={thumbData} alt="Thumbnail preview" /><button class="btn small" type="button" onclick={clearThumb} disabled={busy}>Remove thumbnail</button></div>{/if}
          {#if thumbNote}<div class="why bad-text">{thumbNote}</div>{/if}
          <button class="btn" type="button" onclick={addLinkEntry} disabled={busy || !linkCheck?.ok || needsLabel || creditLinkBad}>Add link to {catLabel}</button>
        </div>

        <div class="card">
          <h3 class="credit-h">Source and acknowledgement <span class="muted">(optional)</span></h3>
          <p class="muted small">Shown to everyone on the file's page. It applies to the files or link you add next, then clears. Use it to credit the author and say how the file may be used.</p>
          <label for="cred-by">Created by</label>
          <input id="cred-by" maxlength={CREDIT_LIMITS.by} placeholder="Author, school or publisher" bind:value={credBy} disabled={busy} />
          <label for="cred-link">Original source link</label>
          <input id="cred-link" type="url" inputmode="url" autocomplete="off" placeholder="https://" bind:value={credLink} disabled={busy} />
          {#if creditLinkBad}<div class="why bad-text">That is not a public web address.</div>{/if}
          <label for="cred-license">Licence or permission</label>
          <input id="cred-license" maxlength={CREDIT_LIMITS.license} placeholder="e.g. CC BY 4.0, or shared with permission" bind:value={credLicense} disabled={busy} />
          <label for="cred-note">Acknowledgement</label>
          <textarea id="cred-note" rows="3" maxlength={CREDIT_LIMITS.note} placeholder="e.g. Thanks to the Mathematics Department for sharing this." bind:value={credNote} disabled={busy}></textarea>
          <p class="muted small">{credNote.length} of {CREDIT_LIMITS.note} characters.</p>
        </div>

        <h2>Files in {subject.name} · {catLabel}</h2>
        {#if files.length}
          <ul class="rows">
            {#each files as f (f.id)}
              <li class="row">{#if f.thumb}<img class="thumb-mini" src={f.thumb} alt="" />{/if}<span class="grow">{f.title}<div class="sub">{f.url ? `Link · ${f.url}` : `${f.name} · ${fmtBytes(f.size)}`}{f.added ? ` · ${f.added}` : ''}{f.credit ? ' · has acknowledgement' : ''}</div></span>
                <button class="btn small danger" type="button" onclick={() => remove(f)} disabled={busy}>Delete</button></li>
            {/each}
          </ul>
        {:else}<p class="muted">No uploaded files here yet.</p>{/if}
    {:else}
      <p class="muted">Add or choose a subject to upload and manage its files.</p>
    {/if}

    <p class="muted small usage">Uploaded so far: {fmtBytes(used)} of about {fmtBytes(SPARK_STORAGE_BYTES)} free storage.</p>

    {#if helpers}
      <h2>Admins</h2>
      <p class="muted small">Only you can see this. Helpers can add and delete Library files with their own Google account. They cannot change this list.</p>
      {#if helpers.length}
        <ul class="rows">
          {#each helpers as email (email)}
            <li class="row"><span class="grow">{email}</span><button class="btn small danger" type="button" onclick={() => removeHelper(email)} disabled={busy}>Remove</button></li>
          {/each}
        </ul>
      {:else}<p class="muted">No helpers yet.</p>{/if}
      <label for="new-admin">Add a helper</label>
      <input id="new-admin" type="email" inputmode="email" autocomplete="off" placeholder="name@gmail.com" bind:value={newAdmin} />
      <button class="btn" type="button" onclick={addHelper} disabled={busy || !newAdmin.trim()}>Add admin</button>
    {/if}
  {/if}

  <p role="status" aria-live="polite" class="muted status">{busy ? `${step || 'Working'}…` : ''}</p>
  {#if note}<p class="ok" role="status">{note}</p>{/if}
  {#if problem}<p class="warn" role="alert">{problem}</p>{/if}
</div>

<style>
  .back { margin: 0 0 10px; } .back a { color: var(--muted); }
  h2 { margin: 22px 0 8px; font-size: 1.1rem; }
  label { display: block; font-weight: 600; margin: 12px 0 6px; }
  select, input[type='file'], input[type='email'], input[type='url'], input:not([type]), textarea { display: block; box-sizing: border-box; width: 100%; font: inherit; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
  input[type='email'] { margin-bottom: 10px; }
  textarea { resize: vertical; min-height: 5.5em; }
  .or { text-align: center; margin: 14px 0 -6px; }
  .credit-h { margin: 0; font-size: 1rem; }
  .bad-text { color: var(--warn); }
  .thumbrow { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
  .thumb-mini { flex: none; width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); margin-right: 10px; }
  .thumbrow .thumb-mini { width: 64px; height: 64px; margin: 0; }
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
