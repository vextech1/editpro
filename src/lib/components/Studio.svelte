<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import { page } from '$app/state';
  import ToolView from './ToolView.svelte';
  import StudioStart from './StudioStart.svelte';
  import GroupSheet from './editor/GroupSheet.svelte';
  import PhotoEditor from './editor/PhotoEditor.svelte';
  import PdfEditor from './editor/PdfEditor.svelte';
  import { StudioState, setStudio, sendTo } from '#lib/workspace.svelte.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { getSessions, daysLeft, type SessionMeta } from '#lib/core/session.ts';
  import { getRetentionDays } from '#lib/core/settings.ts';
  import { setPending, peekPending, ago } from '#lib/core/handoff.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { activeWork, workUsage, UNSAVED_WARNING } from '#lib/active.svelte.ts';
  import { fileKind, studioHref, toolSupports, workspaceSupports, type Workspace } from '#lib/core/workspaces.ts';
  import { sortFiles, pictureOptions, optionsTitle, turnedAwayNote, picturesGoTo, MIXED_SELECTION } from '#lib/core/intake.ts';

  let { workspace }: { workspace: Workspace } = $props();
  // The page re-creates this component for another studio, so the first value is the right one.
  // svelte-ignore state_referenced_locally
  const ws = workspace;
  // Read now, while this component is created. Children mount before this component's onMount, and the start screen's
  // FileDrop takes any waiting files when it does, so by onMount they are gone and the tool in the address is no longer news.
  const arrived = browser && peekPending().length > 0;
  let requested = $state<string | null>(browser && ws.tabs.includes(page.url.searchParams.get('tab') ?? '') ? page.url.searchParams.get('tab') : null);
  const st = new StudioState(ws.id);
  setStudio(st);

  let active = $state(ws.tabs[0]);
  let recents = $state<SessionMeta[]>([]);
  let retention = $state(7);
  let standalone = $state(false);
  let unavailable = $state(false);
  let notice = $state('');
  let saved = $state<'idle' | 'ok' | 'failed'>('idle');
  let booted = $state(false);
  let offered = $state<File[] | null>(null);       // pictures waiting for the person to say what to do with them (Document Studio)
  let handoffPdfs = $state<File[]>([]);            // PDFs Photo Studio turned away; Document Studio can open them
  let incoming = $state<{ sheet?: 'merge' | 'addimages'; files?: File[]; message?: string } | null>(null);   // handed to the PDF editor

  const kind = $derived(st.file ? fileKind(st.file.type) : undefined);
  // Photo Studio with an image open uses the full-screen photo editor.
  const editor = $derived(ws.id === 'image' && kind === 'image');
  // With a PDF open, every Document Studio tool is a sheet of the PDF editor.
  const pdfEditor = $derived(ws.id === 'document' && kind === 'pdf');
  const showTool = $derived(!!st.file || (standalone && !!ws.startsEmpty?.includes(active)));
  const left = $derived(st.session ? daysLeft(st.session, retention) : undefined);
  const accepts = (k: Parameters<typeof workspaceSupports>[1]) => workspaceSupports(ws, k);
  // The open work (from another studio) is a kind of file this studio has no tool for.
  const blocked = $derived(!st.file && activeWork.work && !workspaceSupports(ws, activeWork.work.kind) ? activeWork.work : undefined);
  const pdfOpen = $derived(ws.id === 'document' && kind === 'pdf');

  const here = () => goto(studioHref(ws.id, active, st.session?.id), { replace: true, reset: false });
  function pick(slug: string) { active = slug; st.tab = slug; void here(); }
  /** After a file opens, land on a tool that can take it. */
  function settle() {
    const fits = ws.tabs.filter((s) => toolSupports(s, kind));
    pick(fits.includes(active) ? active : (fits[0] ?? active));
  }
  async function refresh() {
    // Every piece of unfinished work this studio has a tool for, whichever studio it was last used in.
    try { recents = (await getSessions().list()).filter((m) => m.id !== st.session?.id && workspaceSupports(ws, m.kind)).slice(0, 6); void workUsage.refresh(); } catch { unavailable = true; }
  }

  // A tool asked for from elsewhere (the Next steps dialog) opens here.
  $effect(() => { const t = st.tab; if (t && ws.tabs.includes(t) && t !== untrack(() => active)) untrack(() => pick(t)); });
  // Sent here from a tool in this same studio (the address changed, the page did not): open that work and tab.
  $effect(() => {
    const sid = page.url.searchParams.get('s'), tab = page.url.searchParams.get('tab');
    if (!booted || !sid) return;
    untrack(() => { if (sid !== st.session?.id) void st.load(sid, accepts).then((ok) => { if (!ok) return; standalone = false; if (tab && ws.tabs.includes(tab)) active = tab; settle(); }); });
  });

  onMount(async () => {
    retention = getRetentionDays();
    const q = page.url.searchParams, sid = q.get('s'), tab = q.get('tab');
    if (tab && ws.tabs.includes(tab)) active = tab;
    if (sid) { if (!(await st.load(sid, accepts))) notice = 'That work is not available here. It may have expired, been cleared, or be a kind of file this studio cannot open.'; }
    else {
      // No work named in the address: carry on with the open work if one of this studio's tools can take it.
      // Files the person has just picked (on Home, say) are new work, so they are not swallowed by older work.
      if (!arrived) {
        await activeWork.hydrate();
        const a = activeWork.work;
        if (a && accepts(a.kind)) await st.load(a.id, accepts);
      }
    }
    await refresh();
    if (st.file) settle();
    else if (tab && ws.startsEmpty?.includes(tab) && !arrived) { standalone = true; pick(tab); }   // waiting files open through the start screen instead
    booted = true;
  });

  async function begin(files: File[]) {
    const [first, ...rest] = files; if (!first) return;
    notice = ''; standalone = false; if (rest.length) setPending(rest);   // the tab that opens picks the rest up
    await st.open(first); settle();
  }
  /** Files chosen on the start screen. PDFs open (several are merged); pictures in Document Studio ask what to do first. */
  async function intake(files: File[]) {
    const { pdfs, pictures } = sortFiles(files);
    notice = ''; handoffPdfs = [];
    if (ws.id !== 'document') return begin(files);
    if (pdfs.length && pictures.length) { notice = MIXED_SELECTION; return; }
    if (pdfs.length) return begin(pdfs);
    if (!pictures.length) return;
    const tool = picturesGoTo(ws.id, requested);   // a tool was already chosen: no need to ask
    if (tool) { requested = null; active = tool; return begin(pictures); }
    offered = pictures;
  }
  /** Files the studio turned away: say what it opens, and offer to send PDFs from Photo Studio across. */
  function skipped(files: File[]) {
    notice = turnedAwayNote(ws.id, files);
    handoffPdfs = ws.id === 'image' ? sortFiles(files).pdfs : [];
  }
  async function sendPdfsAcross() {
    const pdfs = handoffPdfs; handoffPdfs = [];
    try { await sendTo('document', pdfs, 'organize-pdf'); } catch { notice = 'Could not open Document Studio. Please try again.'; }
  }
  // Starting new work from pictures is safe with a PDF open: the PDF stays saved in Continue, like a replaced photo.
  async function makePdf(pictures: File[]) {
    setPending(pictures); st.close(); saved = 'idle';
    standalone = true; pick('images-to-pdf'); await refresh();
  }
  async function readText(pictures: File[]) {
    saved = 'idle'; active = 'extract-text';   // settle() keeps a tab that can take the file
    await begin(pictures); await refresh();
  }
  async function choosePicture(id: string) {
    const pictures = offered;
    if (!pictures) return;
    // These two start new work in place of the open file: ask first if it holds changes that were never saved. Cancelling keeps the choices open.
    if ((id === 'make-pdf' || id === 'read-text') && st.file && st.unsaved && !confirm(UNSAVED_WARNING)) return;
    offered = null;
    try {
      if (id === 'add-to-pdf') incoming = { sheet: 'addimages', files: pictures };
      else if (id === 'make-pdf') await makePdf(pictures);
      else if (id === 'read-text') await readText(pictures);
      else if (id === 'edit-image') await sendTo('image', pictures, 'edit-image');
    } catch { notice = 'That did not work. Please try again.'; }
  }
  // Files dropped on the PDF editor: PDFs go to Merge, pictures ask what to do. A drop zone inside a sheet handles its own drops.
  const droppable = (e: DragEvent) => pdfEditor && !(e.target instanceof Element && e.target.closest('.drop'));
  function dragOver(e: DragEvent) { if (droppable(e) && e.dataTransfer?.types.includes('Files')) e.preventDefault(); }
  function dropped(e: DragEvent) {
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (!droppable(e) || !list.length) return;
    e.preventDefault();
    const { pdfs, pictures, other } = sortFiles(list);
    const message = pdfs.length && pictures.length ? MIXED_SELECTION : other.length ? turnedAwayNote('document', other) : undefined;
    if (pdfs.length && pictures.length) incoming = { message };
    else if (pdfs.length) incoming = { sheet: 'merge', files: pdfs, message };
    else if (pictures.length) { offered = pictures; if (message) incoming = { message }; }
    else incoming = { message };
  }
  async function replacePhoto(file: File) {
    if (fileKind(file.type) !== 'image') return;
    notice = ''; standalone = false; saved = 'idle';
    await st.open(file);   // start a separate session; the previous photo remains available in Continue
    await refresh();
  }
  async function resume(m: SessionMeta) {
    notice = ''; standalone = false;
    if (await st.load(m.id, accepts)) settle(); else { notice = 'That work is no longer saved.'; await refresh(); }
  }
  async function leave() { if (st.unsaved && !confirm(UNSAVED_WARNING)) return; requested = null; st.close(); standalone = false; saved = 'idle'; await refresh(); void goto(studioHref(ws.id), { replace: true, reset: false }); }
  async function remove(id?: string) {
    if (!id || !confirm('Delete this saved work from this device? This cannot be undone.')) return;
    if (st.session?.id === id) { await st.discard(); requested = null; void goto(studioHref(ws.id), { replace: true, reset: false }); }
    else { try { await getSessions().discard(id); } catch { /* ignore */ } if (activeWork.work?.id === id) activeWork.clear(); }
    await refresh();
  }
  async function keepCopy() { try { saved = (await st.saveToLibrary()) ? 'ok' : 'failed'; } catch { saved = 'failed'; } }
</script>

<svelte:window ondragover={dragOver} ondrop={dropped} />

{#if !showTool}
  <StudioStart {ws} {notice} {blocked} {unavailable} {recents} {retention} handoff={handoffPdfs.length ? `Open the ${handoffPdfs.length === 1 ? 'PDF' : 'PDFs'} in Document Studio` : undefined}
    onfiles={intake} onskipped={skipped} onhandoff={sendPdfsAcross}
    onstandalone={() => { standalone = true; pick(ws.startsEmpty![0]); }} onresume={resume} onremove={remove} />
{/if}

{#if offered}
  <div class="intake">
    <button class="scrim" type="button" aria-label="Close without choosing" onclick={() => (offered = null)}></button>
    <GroupSheet title={optionsTitle(offered.length)} tiles={pictureOptions(offered.length, pdfOpen)} onpick={choosePicture} oncancel={() => (offered = null)} />
  </div>
{/if}

{#if showTool && editor}
  <PhotoEditor onclose={leave} onremove={() => remove(st.session?.id)} oncopy={keepCopy} onreplace={replacePhoto} {saved} />
{:else if showTool && pdfEditor}
  <PdfEditor onclose={leave} onremove={() => remove(st.session?.id)} oncopy={keepCopy} {saved} bind:incoming />
{:else if showTool}
  {#if st.file}
    <section class="studiohead" aria-label="Working file">
      <div class="who"><strong>{st.file.name}</strong>
        <span class="sub">{fmtBytes(st.file.size)}{#if st.session} · version {st.session.head + 1} of {st.session.versions.length}{/if}
          {#if st.session} · {st.session.pinned ? 'pinned' : left === undefined ? 'kept until deleted' : `kept ${left} more ${left === 1 ? 'day' : 'days'}`}{/if}</span></div>
      <div class="acts">
        <button class="btn small ghost" type="button" disabled={!st.canUndo} onclick={() => st.undo()}>Undo</button>
        <button class="btn small ghost" type="button" disabled={!st.canRedo} onclick={() => st.redo()}>Redo</button>
        <button class="btn small ghost" type="button" onclick={keepCopy} disabled={saved === 'ok'}>{saved === 'ok' ? 'Saved ✓' : saved === 'failed' ? 'Could not save' : 'Save to My files'}</button>
        {#if st.session}<button class="btn small ghost" type="button" aria-pressed={!!st.session.pinned} onclick={() => st.togglePin()}>{st.session.pinned ? 'Unpin' : 'Pin'}</button>{/if}
        <button class="btn small ghost" type="button" onclick={leave}>Close</button>
        {#if st.session}<button class="btn small ghost" type="button" onclick={() => remove(st.session?.id)}>Delete</button>{/if}
      </div>
      {#if st.session && st.session.versions.length > 1}
        <details class="vers"><summary>Versions</summary>
          <ol>{#each st.session.versions as v, i (v.id)}
            <li><button type="button" aria-current={i === st.session.head ? 'true' : undefined} onclick={() => st.goTo(i)}>{v.label} <span class="sub">· {ago(v.at)} · {fmtBytes(v.size)}</span></button></li>
          {/each}</ol></details>
      {/if}
      {#if st.note}<p class="warn" role="status" style="margin:6px 0 0">{st.note}</p>{/if}
    </section>
  {:else}
    <p style="margin:0 0 10px"><button class="link" type="button" onclick={leave}>← Back</button></p>
  {/if}

  <!-- Only a picture (or a starter with no file) gets here: with a PDF open the PDF editor takes over. One tool at a time. -->
  {@const tool = toolBySlug(active)}
  {#if tool}
    <div role="region" aria-label={tool.title}>
      {#key st.head ?? 'solo'}<ToolView {tool} />{/key}   <!-- a kept result, undo or redo reloads it on the new version -->
    </div>
    {#if tool.note}<p class="muted" style="margin-top:18px">{tool.note}</p>{/if}
  {/if}
{/if}

<style>
  /* The picture choices float over whatever is behind: the start screen or the PDF editor. */
  .intake { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; justify-content: flex-end; }
  .scrim { flex: 1; border: 0; padding: 0; background: rgb(0 0 0 / .4); cursor: default; }
  @media (min-width: 860px) {
    .intake { align-items: center; justify-content: center; }
    .scrim { position: absolute; inset: 0; }
    .intake :global(.sheet) { position: relative; border-radius: 22px; max-height: 80dvh; box-shadow: 0 12px 40px rgb(0 0 0 / .3); }
  }
</style>
