<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import { fmtBytes } from '#lib/core/format.ts';
  import { ago, routeFor, setPending } from '#lib/core/handoff.ts';
  import FileThumb from '#lib/components/FileThumb.svelte';
  import { forgetThumbnails } from '#lib/core/thumbs.ts';
  import { zipSaved, backupName } from '#lib/core/library-export.ts';
  import { getLibrary, keepExtension, TRASH_DAYS, type Hit, type Kind, type Sort } from '#lib/core/library.ts';

  type Tab = 'recent' | 'favorite' | 'all';
  const RECENT = 20;
  const tabs: [Tab, string][] = [['recent', 'Recent'], ['favorite', 'Favorites'], ['all', 'All files']];
  const kinds: [Kind | 'all', string][] = [['all', 'All types'], ['pdf', 'PDFs'], ['image', 'Images'], ['text', 'Text'], ['other', 'Other']];
  const sorts: [Sort, string][] = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name (A–Z)'], ['size', 'Largest first']];
  const SORT_KEY = 'editpro.library.sort';

  // The trash view lives in the address (?trash=1), so Back, reload and shared links all agree with what is on screen.
  // `browser` keeps this off the prerendered build, where the address has no query.
  const trash = $derived(browser && page.url.searchParams.get('trash') === '1');
  const setTrash = (on: boolean) => { stopSelecting(); filterOpen = false; notice = ''; undo = undefined; void goto(on ? '/library?trash=1' : '/library', { reset: false }); };

  let hits = $state<Hit[]>([]);
  let tab = $state<Tab>('recent');
  let text = $state(''); let kind = $state<Kind | 'all'>('all'); let sort = $state<Sort>('newest');
  let selecting = $state(false); let picked = $state<string[]>([]); let busy = $state('');
  let searchOpen = $state(false); let filterOpen = $state(false); let menu = $state('');
  let more = $state(0); let usage = $state(0); let quota = $state(0);
  let msg = $state('Loading…'); let unavailable = $state(false); let indexing = $state(''); let notice = $state('');
  let renaming = $state(''); let newName = $state(''); let renamingFrom = '';
  let undo = $state<{ ids: string[]; label: string } | undefined>();
  let ready = $state(false); let loaded = false;

  let seq = 0;   // only the newest refresh may update the screen, so a slow earlier one cannot bring back a stale list
  async function refresh() {
    const mine = ++seq;
    let lib;
    try { lib = getLibrary(); } catch { unavailable = true; msg = ''; return; }
    try {
      const all = await lib.search({ text, kind, trash, sort: tab === 'recent' && !trash ? 'newest' : sort, favorite: tab === 'favorite' && !trash });
      const capped = tab === 'recent' && !trash && !text.trim() && all.length > RECENT;
      let u = 0, q = 0;
      try { const e = await navigator.storage?.estimate?.(); u = e?.usage ?? 0; q = e?.quota ?? 0; } catch { /* optional */ }
      if (mine !== seq) return;
      hits = capped ? all.slice(0, RECENT) : all; more = capped ? all.length - RECENT : 0; usage = u; quota = q; loaded = true;
      picked = picked.filter((id) => hits.some((h) => h.file.id === id));   // a selected file that left the list is no longer selected
      const searching = !!text.trim() || kind !== 'all';
      msg = hits.length ? '' : searching ? 'No files match.' : trash ? 'The trash is empty.'
        : tab === 'favorite' ? 'No favorites yet. Tap the star on a file to add it here.' : 'No saved files yet. Use Save on any result to keep a copy here.';
    } catch {
      if (mine !== seq) return;
      if (!loaded) { unavailable = true; msg = ''; } else msg = 'Could not read your saved files. Reload the page to try again.';
    }
  }
  onMount(async () => {
    try { const s = localStorage.getItem(SORT_KEY) as Sort | null; if (s && s !== 'newest' && sorts.some(([k]) => k === s)) { sort = s; tab = 'all'; } } catch { /* optional */ }
    try { await getLibrary().purgeOld(); } catch { /* ignore */ }
    ready = true;   // starts the first refresh (see the effect below)
    // Read the text of files saved before search existed (or whose indexing was interrupted), then refresh the list.
    try {
      const lib = getLibrary();
      if ((await lib.list()).length + (await lib.list({ trash: true })).length) {
        const found = await lib.indexPending((d, n) => { indexing = n > 1 ? `Preparing search… ${d} of ${n}` : 'Preparing search…'; });
        indexing = ''; if (found) await refresh();
      }
    } catch { indexing = ''; }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { text; kind; sort; trash; tab; if (!ready || unavailable) return; clearTimeout(timer); timer = setTimeout(refresh, text ? 200 : 0); return () => clearTimeout(timer); });

  /** The saved file, or undefined after telling the person it is gone and dropping the empty entry. */
  async function fetchFile(f: Hit['file']) {
    const file = await getLibrary().file(f.id);
    if (file) return file;
    try { await getLibrary().removeForever(f.id); } catch { /* ignore */ }
    await refresh(); notice = `“${f.name}” could not be found on this device any more, so it was removed from the list.`;
  }
  async function download(f: Hit['file']) {
    const file = await fetchFile(f); if (!file) return;
    saveBlob(file, f.name);
  }
  /** Open the file in the tool that fits it (PDF or image); anything else is downloaded. */
  const canOpen = (f: Hit['file']) => !!routeFor([f]);
  async function open(f: Hit['file']) {
    menu = '';
    const file = await fetchFile(f); if (!file) return;
    const to = routeFor([file]);
    if (!to) return download(f);
    setPending([file]); await goto(to);
  }
  async function act(fn: () => Promise<unknown>) {
    menu = ''; notice = ''; undo = undefined;
    try { await fn(); } catch { notice = 'That did not work. Please try again.'; }
    await refresh();
  }
  function startRename(f: Hit['file']) { menu = ''; renaming = f.id; renamingFrom = f.name; newName = f.name; }
  async function finishRename() { const id = renaming; renaming = ''; if (id) await act(() => getLibrary().rename(id, keepExtension(renamingFrom, newName))); }
  async function emptyTrash() { filterOpen = false; if (confirm('Permanently delete everything in the trash?')) await act(() => getLibrary().emptyTrash()); }
  async function remove(f: Hit['file']) { menu = ''; if (confirm(`Permanently delete “${f.name}”?`)) await act(() => getLibrary().removeForever(f.id)); }
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  async function moveToTrash(f: Hit['file']) {
    await act(() => getLibrary().trash(f.id));
    if (notice) return;
    offerUndo([f.id], `“${f.name}”`);
  }
  async function undoTrash() { const u = undo; undo = undefined; clearTimeout(undoTimer); if (u) await act(() => getLibrary().restoreMany(u.ids)); }

  onDestroy(forgetThumbnails);

  function setSort(s: Sort) {
    sort = s; filterOpen = false;
    if (tab === 'recent' && !trash) tab = 'all';   // Recent is always the newest files; a sorted list is the full one
    try { localStorage.setItem(SORT_KEY, s); } catch { /* optional */ }
  }
  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();   // attached first: some browsers ignore a click on a detached link
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function downloadZip(ids: string[]) {
    menu = ''; filterOpen = false; notice = '';
    if (!ids.length) { notice = 'There are no saved files to download yet.'; return; }
    busy = ids.length > 1 ? `Preparing ${ids.length} files…` : 'Preparing…';
    try {
      const { blob, count, missing } = await zipSaved(getLibrary(), ids);
      if (!count) notice = 'None of those files could be read, so no zip was made.';
      else { saveBlob(blob, backupName()); if (missing) notice = `${missing} ${missing === 1 ? 'file' : 'files'} could not be found on this device and ${missing === 1 ? 'was' : 'were'} left out of the zip.`; }
    } catch { notice = 'Could not make the zip. Try fewer files at once.'; }
    finally { busy = ''; }
  }
  const backupAll = async () => downloadZip((await getLibrary().list()).map((f) => f.id));

  function startSelect() { filterOpen = false; menu = ''; selecting = true; picked = []; }
  function stopSelecting() { selecting = false; picked = []; }
  const toggle = (id: string) => { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]; };
  const selectAll = () => { picked = picked.length === hits.length ? [] : hits.map((h) => h.file.id); };
  const allStarred = $derived(picked.length > 0 && picked.every((id) => hits.find((h) => h.file.id === id)?.file.favorite));
  function offerUndo(ids: string[], label: string) { undo = { ids, label }; clearTimeout(undoTimer); undoTimer = setTimeout(() => (undo = undefined), 8000); }
  async function trashPicked() {
    const ids = [...picked]; if (!ids.length) return;
    await act(() => getLibrary().trashMany(ids)); if (notice) return;
    stopSelecting(); offerUndo(ids, ids.length === 1 ? 'a file' : `${ids.length} files`);
  }
  async function restorePicked() { const ids = [...picked]; await act(() => getLibrary().restoreMany(ids)); if (!notice) stopSelecting(); }
  async function deletePicked() {
    const ids = [...picked]; if (!ids.length || !confirm(`Permanently delete ${ids.length === 1 ? 'this file' : `these ${ids.length} files`}?`)) return;
    await act(() => getLibrary().removeMany(ids)); if (!notice) stopSelecting();
  }
  const starPicked = () => act(() => getLibrary().favoriteMany([...picked], !allStarred));

  const focusOnMount = (n: HTMLElement) => n.focus();
  /** A popup menu: opens upward when it would run under the bottom bar or off the screen, and works with the keyboard. */
  function menuFx(node: HTMLElement) {
    const trigger = node.parentElement?.querySelector<HTMLElement>('button[aria-haspopup]');
    const nav = document.querySelector<HTMLElement>('nav.bottom');
    const floor = innerHeight - (nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0);
    const r = node.getBoundingClientRect(), t = trigger?.getBoundingClientRect();
    if (t) {
      const below = floor - t.bottom - 8, above = t.top - 8;
      const up = r.height > below && above > below;   // flip only when it helps
      if (up) node.classList.add('up');
      const room = up ? above : below;
      if (r.height > room) { node.style.maxHeight = `${Math.max(120, room)}px`; node.style.overflowY = 'auto'; }   // a tall menu scrolls instead of running under the bottom bar
    }
    const items = () => [...node.querySelectorAll<HTMLElement>('[role^=menuitem]')];
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
      else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
      else if (e.key === 'Home') list[0]?.focus();
      else if (e.key === 'End') list.at(-1)?.focus();
      else { if (e.key === 'Escape') trigger?.focus(); return; }
      e.preventDefault();
    };
    node.addEventListener('keydown', key);
    return { destroy() { node.removeEventListener('keydown', key); } };
  }
  function outside(e: MouseEvent) { if (!(e.target as Element).closest?.('.menuwrap')) { menu = ''; filterOpen = false; } }
  function closeSearch() { searchOpen = false; text = ''; }
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (menu || filterOpen) { menu = ''; filterOpen = false; } else if (selecting) stopSelecting(); else if (searchOpen && !renaming) closeSearch();
  }
  function tabKey(e: KeyboardEvent) {
    const i = tabs.findIndex(([t]) => t === tab);
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); tab = tabs[j][0]; document.getElementById(`tab-${tab}`)?.focus();
  }
  const kindLabel = $derived(kinds.find(([k]) => k === kind)?.[1] ?? '');
</script>
{#snippet meta(f: Hit['file'], snippet?: string)}
  <div class="sub">{ago(f.created)} · {fmtBytes(f.size)}</div>
  {#if snippet}<div class="sub">{snippet}</div>{/if}
{/snippet}
<svelte:head><title>My files | EditPro</title><meta name="robots" content="noindex" />
<meta name="description" content="Files you saved from EditPro tools." /></svelte:head>
<svelte:window onclick={outside} onkeydown={onkey} />

<div class="fhead">
  <h1>{trash ? 'Trash' : 'My files'}</h1>
  <button class="iconbtn" type="button" aria-label="Search files" aria-expanded={searchOpen} onclick={() => (searchOpen ? closeSearch() : (searchOpen = true))}>
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  </button>
  <div class="menuwrap">
    <button class="iconbtn" class:active={kind !== 'all' || sort !== 'newest'} type="button" aria-label={kind === 'all' && sort === 'newest' ? 'Filter and sort' : 'Filter and sort (changed)'} aria-haspopup="menu" aria-expanded={filterOpen} onclick={() => { filterOpen = !filterOpen; menu = ''; }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    {#if filterOpen}
      <div class="menu" role="menu" use:menuFx>
        {#each kinds as [k, l]}<button type="button" role="menuitemradio" aria-checked={kind === k} class:on={kind === k} onclick={() => { kind = k; filterOpen = false; }}>{l}</button>{/each}
        <hr />
        {#each sorts as [s, l]}<button type="button" role="menuitemradio" aria-checked={sort === s} class:on={sort === s} onclick={() => setSort(s)}>{l}</button>{/each}
        <hr />
        <button type="button" role="menuitem" onclick={startSelect}>Select files</button>
        {#if !trash}<button type="button" role="menuitem" onclick={backupAll}>Download all as zip</button>{/if}
        <button type="button" role="menuitem" onclick={() => setTrash(!trash)}>{trash ? 'Back to My files' : 'Trash'}</button>
        {#if trash && hits.length}<button type="button" role="menuitem" onclick={emptyTrash}>Empty trash</button>{/if}
      </div>
    {/if}
  </div>
</div>

{#if unavailable}
  <p class="warn">Saved files are not available in this browser. This can happen in private browsing. The tools still work; just download your results.</p>
{:else}
  {#if searchOpen}<input class="search" type="search" bind:value={text} use:focusOnMount placeholder="File name or words inside" aria-label="Search files" style="margin-bottom:12px" />{/if}
  {#if kind !== 'all'}
    <div class="chips"><button type="button" class="chip" aria-label="Clear the {kindLabel} filter" onclick={() => (kind = 'all')}>{kindLabel} <span aria-hidden="true">✕</span></button></div>
  {/if}
  {#if trash}
    <p class="muted">Files in the trash are deleted for good after {TRASH_DAYS} days.</p>
  {:else}
    <div class="tabs" role="tablist" aria-label="Show">
      {#each tabs as [t, l]}<button type="button" role="tab" id="tab-{t}" aria-selected={tab === t} aria-controls="files-panel" tabindex={tab === t ? 0 : -1} class:on={tab === t} onclick={() => (tab = t)} onkeydown={tabKey}>{l}</button>{/each}
    </div>
  {/if}
  {#if notice}<p role="alert" class="warn">{notice} <button type="button" class="link" onclick={() => (notice = '')}>Dismiss</button></p>{/if}
  {#if undo}<p role="status" class="muted">Moved {undo.label} to the trash. <button type="button" class="link" onclick={undoTrash}>Undo</button></p>{/if}
  {#if busy}<p role="status" class="muted">{busy}</p>{/if}
  {#if selecting}
    <div class="selbar" role="toolbar" aria-label="Selected files">
      <strong>{picked.length} selected</strong>
      <button type="button" class="link" onclick={selectAll}>{hits.length && picked.length === hits.length ? 'Select none' : 'Select all'}</button>
      <span class="grow"></span>
      {#if trash}
        <button type="button" class="btn small" disabled={!picked.length} onclick={restorePicked}>Restore</button>
        <button type="button" class="btn small ghost" disabled={!picked.length} onclick={deletePicked}>Delete forever</button>
      {:else}
        <button type="button" class="btn small ghost" disabled={!picked.length} onclick={() => downloadZip(picked)}>Download zip</button>
        <button type="button" class="btn small ghost" disabled={!picked.length} onclick={starPicked}>{allStarred ? 'Unfavorite' : 'Favorite'}</button>
        <button type="button" class="btn small" disabled={!picked.length} onclick={trashPicked}>Move to trash</button>
      {/if}
      <button type="button" class="link" onclick={stopSelecting}>Done</button>
    </div>
  {/if}
  <div id="files-panel" role={trash ? undefined : 'tabpanel'} aria-labelledby={trash ? undefined : `tab-${tab}`}>
  <p role="status" class="muted">{msg}{#if indexing} {indexing}{/if}</p>
  <ul class="frows">
    {#each hits as { file: f, snippet } (f.id)}
      <li class="frow">
        {#if selecting}
          <label class="pickrow">
            <input type="checkbox" class="pick" checked={picked.includes(f.id)} onchange={() => toggle(f.id)} aria-label="Select {f.name}" />
            <FileThumb file={f} />
            <div class="grow"><strong>{f.name}</strong>{@render meta(f, snippet)}</div>
          </label>
        {:else}
          <FileThumb file={f} />
          <div class="grow">
            {#if renaming === f.id}
              <input type="text" bind:value={newName} aria-label="New name" use:focusOnMount onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { e.preventDefault(); renaming = ''; } }} onblur={finishRename} />
            {:else if !trash && canOpen(f)}<button type="button" class="name" title="Open in editor" onclick={() => open(f)}><strong>{f.name}</strong></button>
            {:else}<strong>{f.name}</strong>{/if}
            {@render meta(f, snippet)}
          </div>
          {#if !trash}
            <button class="iconbtn" type="button" aria-pressed={!!f.favorite} aria-label={f.favorite ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`}
              onclick={() => act(() => getLibrary().setFavorite(f.id, !f.favorite))} style={f.favorite ? 'color:var(--mark)' : ''}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill={f.favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
            </button>
          {/if}
          <div class="menuwrap">
            <button class="iconbtn" type="button" aria-label="More actions for {f.name}" aria-haspopup="menu" aria-expanded={menu === f.id} onclick={() => { menu = menu === f.id ? '' : f.id; filterOpen = false; }}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/></svg>
            </button>
            {#if menu === f.id}
              <div class="menu" role="menu" use:menuFx>
                {#if trash}
                  <button type="button" role="menuitem" onclick={() => act(() => getLibrary().restore(f.id))}>Restore</button>
                  <button type="button" role="menuitem" onclick={() => remove(f)}>Delete forever</button>
                {:else}
                  {#if canOpen(f)}<button type="button" role="menuitem" onclick={() => open(f)}>Open in editor</button>{/if}
                  <button type="button" role="menuitem" onclick={() => { menu = ''; download(f); }}>Download</button>
                  <button type="button" role="menuitem" onclick={() => startRename(f)}>Rename</button>
                  <button type="button" role="menuitem" onclick={() => moveToTrash(f)}>Move to trash</button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if more > 0}<p><button type="button" class="link" onclick={() => (tab = 'all')}>Show all {hits.length + more} files</button></p>{/if}
  </div>
  {#if quota && usage / quota >= 0.8}
    <p class="warn" role="alert" style="margin-top:18px">⚠ Browser storage is {Math.round(usage / quota * 100)}% full ({fmtBytes(usage)} of {fmtBytes(quota)}). Delete files you no longer need to avoid save failures.</p>
  {/if}
{/if}

<style>
  .selbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 0 6px; }
  .selbar .grow { flex: 1; }
  .pickrow { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; cursor: pointer; }
  .pick { flex: none; width: 22px; height: 22px; accent-color: var(--accent); }
  .chips { margin: 0 0 10px; }
  .chip { font: inherit; font-size: .9rem; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
  .iconbtn.active { color: var(--accent); }
  .name { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
  .name:hover strong { text-decoration: underline; }
</style>
