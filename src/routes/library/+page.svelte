<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import { fmtBytes } from '#lib/core/format.ts';
  import { ago, routeFor, setPending } from '#lib/core/handoff.ts';
  import { FILE_ICON, FILE_COLOR } from '#lib/icons.ts';
  import { getLibrary, kindOf, keepExtension, TRASH_DAYS, type Hit, type Kind } from '#lib/core/library.ts';

  type Tab = 'recent' | 'favorite' | 'all';
  const RECENT = 20;
  const tabs: [Tab, string][] = [['recent', 'Recent'], ['favorite', 'Favorites'], ['all', 'All files']];
  const kinds: [Kind | 'all', string][] = [['all', 'All types'], ['pdf', 'PDFs'], ['image', 'Images'], ['text', 'Text'], ['other', 'Other']];

  // The trash view lives in the address (?trash=1), so Back, reload and shared links all agree with what is on screen.
  // `browser` keeps this off the prerendered build, where the address has no query.
  const trash = $derived(browser && page.url.searchParams.get('trash') === '1');
  const setTrash = (on: boolean) => { filterOpen = false; notice = ''; undo = undefined; void goto(on ? '/library?trash=1' : '/library', { reset: false }); };

  let hits = $state<Hit[]>([]);
  let tab = $state<Tab>('recent');
  let text = $state(''); let kind = $state<Kind | 'all'>('all');
  let searchOpen = $state(false); let filterOpen = $state(false); let menu = $state('');
  let more = $state(0); let usage = $state(0); let quota = $state(0);
  let msg = $state('Loading…'); let unavailable = $state(false); let indexing = $state(''); let notice = $state('');
  let renaming = $state(''); let newName = $state(''); let renamingFrom = '';
  let undo = $state<{ id: string; name: string } | undefined>();
  let ready = $state(false); let loaded = false;

  let seq = 0;   // only the newest refresh may update the screen, so a slow earlier one cannot bring back a stale list
  async function refresh() {
    const mine = ++seq;
    let lib;
    try { lib = getLibrary(); } catch { unavailable = true; msg = ''; return; }
    try {
      const all = await lib.search({ text, kind, trash, favorite: tab === 'favorite' && !trash });
      const capped = tab === 'recent' && !trash && !text.trim() && all.length > RECENT;
      let u = 0, q = 0;
      try { const e = await navigator.storage?.estimate?.(); u = e?.usage ?? 0; q = e?.quota ?? 0; } catch { /* optional */ }
      if (mine !== seq) return;
      hits = capped ? all.slice(0, RECENT) : all; more = capped ? all.length - RECENT : 0; usage = u; quota = q; loaded = true;
      const searching = !!text.trim() || kind !== 'all';
      msg = hits.length ? '' : searching ? 'No files match.' : trash ? 'The trash is empty.'
        : tab === 'favorite' ? 'No favorites yet. Tap the star on a file to add it here.' : 'No saved files yet. Use Save on any result to keep a copy here.';
    } catch {
      if (mine !== seq) return;
      if (!loaded) { unavailable = true; msg = ''; } else msg = 'Could not read your saved files. Reload the page to try again.';
    }
  }
  onMount(async () => {
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
  $effect(() => { text; kind; trash; tab; if (!ready || unavailable) return; clearTimeout(timer); timer = setTimeout(refresh, text ? 200 : 0); return () => clearTimeout(timer); });

  /** The saved file, or undefined after telling the person it is gone and dropping the empty entry. */
  async function fetchFile(f: Hit['file']) {
    const file = await getLibrary().file(f.id);
    if (file) return file;
    try { await getLibrary().removeForever(f.id); } catch { /* ignore */ }
    await refresh(); notice = `“${f.name}” could not be found on this device any more, so it was removed from the list.`;
  }
  async function download(f: Hit['file']) {
    const file = await fetchFile(f); if (!file) return;
    const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = f.name;
    document.body.append(a); a.click(); a.remove();   // attached first: some browsers ignore a click on a detached link
    setTimeout(() => URL.revokeObjectURL(url), 10000);
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
    undo = { id: f.id, name: f.name }; clearTimeout(undoTimer); undoTimer = setTimeout(() => (undo = undefined), 8000);
  }
  async function undoTrash() { const u = undo; undo = undefined; clearTimeout(undoTimer); if (u) await act(() => getLibrary().restore(u.id)); }

  const focusOnMount = (n: HTMLElement) => n.focus();
  /** A popup menu: opens upward when it would run under the bottom bar or off the screen, and works with the keyboard. */
  function menuFx(node: HTMLElement) {
    const trigger = node.parentElement?.querySelector<HTMLElement>('button[aria-haspopup]');
    const nav = document.querySelector<HTMLElement>('nav.bottom');
    const floor = innerHeight - (nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0);
    const r = node.getBoundingClientRect(), t = trigger?.getBoundingClientRect();
    if (t && r.bottom > floor && t.top - r.height >= 0) node.classList.add('up');
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
    if (menu || filterOpen) { menu = ''; filterOpen = false; } else if (searchOpen && !renaming) closeSearch();
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
<svelte:head><title>My files | EditPro</title><meta name="robots" content="noindex" />
<meta name="description" content="Files you saved from EditPro tools." /></svelte:head>
<svelte:window onclick={outside} onkeydown={onkey} />

<div class="fhead">
  <h1>{trash ? 'Trash' : 'My files'}</h1>
  <button class="iconbtn" type="button" aria-label="Search files" aria-expanded={searchOpen} onclick={() => (searchOpen ? closeSearch() : (searchOpen = true))}>
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  </button>
  <div class="menuwrap">
    <button class="iconbtn" class:active={kind !== 'all'} type="button" aria-label={kind === 'all' ? 'Filter' : `Filter (showing ${kindLabel})`} aria-haspopup="menu" aria-expanded={filterOpen} onclick={() => { filterOpen = !filterOpen; menu = ''; }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    {#if filterOpen}
      <div class="menu" role="menu" use:menuFx>
        {#each kinds as [k, l]}<button type="button" role="menuitemradio" aria-checked={kind === k} class:on={kind === k} onclick={() => { kind = k; filterOpen = false; }}>{l}</button>{/each}
        <hr />
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
  {#if undo}<p role="status" class="muted">Moved “{undo.name}” to the trash. <button type="button" class="link" onclick={undoTrash}>Undo</button></p>{/if}
  <div id="files-panel" role={trash ? undefined : 'tabpanel'} aria-labelledby={trash ? undefined : `tab-${tab}`}>
  <p role="status" class="muted">{msg}{#if indexing} {indexing}{/if}</p>
  <ul class="frows">
    {#each hits as { file: f, snippet } (f.id)}
      {@const k = kindOf(f.type)}
      <li class="frow">
        <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" style="color:{FILE_COLOR[k]};flex:none"><path d={FILE_ICON[k]} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="grow">
          {#if renaming === f.id}
            <input type="text" bind:value={newName} aria-label="New name" use:focusOnMount onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { e.preventDefault(); renaming = ''; } }} onblur={finishRename} />
          {:else if !trash && canOpen(f)}<button type="button" class="name" title="Open in editor" onclick={() => open(f)}><strong>{f.name}</strong></button>
          {:else}<strong>{f.name}</strong>{/if}
          <div class="sub">{ago(f.created)} · {fmtBytes(f.size)}</div>
          {#if snippet}<div class="sub">{snippet}</div>{/if}
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
  .chips { margin: 0 0 10px; }
  .chip { font: inherit; font-size: .9rem; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
  .iconbtn.active { color: var(--accent); }
  .name { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
  .name:hover strong { text-decoration: underline; }
</style>
