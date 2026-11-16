<script lang="ts">
  import { onMount } from 'svelte';
  import { cloudEnabled } from '#lib/cloud/firebase.ts';
  import { initMember, member, openShare, signInMember, signOutMember } from '#lib/cloud/member.svelte.ts';
  import { deleteMyAccount, dismissNotice, listMyFiles, listNotices, readAccountNumbers, removeMyFile } from '#lib/cloud/user.ts';
  import AccessGate from '#lib/components/AccessGate.svelte';
  import { DOWNLOADS_PER_UPLOAD, creditsLeft, creditsText, pulledNoticeText, type Notice } from '#lib/core/access.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { categoryLabel } from '#lib/core/class-library.ts';
  import type { UserFile } from '#lib/core/user-library.ts';

  let numbers = $state<{ liveUploads: number; used: number }>(); let notices = $state<Notice[]>([]); let mine = $state<UserFile[]>([]);
  let loading = $state(false); let busy = $state(false); let problem = $state(''); let note = $state('');
  onMount(() => { void initMember(true); });
  const uid = $derived(member.user?.uid);
  $effect(() => { const id = uid; if (!id) { numbers = undefined; notices = []; mine = []; return; } void load(id); });
  async function load(id: string) {
    loading = true; problem = '';
    try {
      const [account, messages, files] = await Promise.all([readAccountNumbers(id), listNotices(id), listMyFiles(id)]);
      if (uid !== id) return;
      numbers = account; notices = messages; mine = files;
    } catch { problem = 'Your account could not be loaded. Check your connection and try again.'; }
    finally { loading = false; }
  }
  const left = $derived(numbers ? creditsLeft(numbers.liveUploads, numbers.used) : 0);
  async function signIn() {
    busy = true; problem = '';
    try { await signInMember(); }
    catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') problem = 'Sign-in did not work. Please try again.';
    } finally { busy = false; }
  }
  async function signOut() { busy = true; try { await signOutMember(); note = 'You are signed out.'; } catch { problem = 'Sign-out did not work. Please try again.'; } finally { busy = false; } }
  async function dismiss(id: string) { if (!uid) return; try { await dismissNotice(uid, id); notices = notices.filter((item) => item.id !== id); } catch { problem = 'That message could not be cleared. Please try again.'; } }
  async function remove(file: UserFile) {
    const warning = file.status === 'live' ? `Delete “${file.title}”? It will be removed for everyone, and the downloads it unlocked will be reduced.` : `Remove “${file.title}” from your list?`;
    if (!confirm(warning)) return;
    busy = true; problem = ''; note = '';
    try { await removeMyFile(file); if (uid) await load(uid); note = 'Deleted.'; }
    catch { problem = 'That could not be deleted. Please try again.'; }
    finally { busy = false; }
  }
  async function deleteAccount() {
    if (!uid || !confirm('Delete your account? This permanently removes your shared documents, download history and sign-in. It cannot be undone.')) return;
    busy = true; problem = ''; note = '';
    try { await deleteMyAccount(uid); note = 'Your account and stored account data were deleted.'; }
    catch (error) {
      problem = (error as { code?: string })?.code === 'auth/requires-recent-login'
        ? 'Google requires a recent sign-in. Sign out, sign in again, then retry deletion.'
        : 'Your account was not fully deleted. You can retry; your shared files and remaining account data will still be listed.';
    } finally { busy = false; }
  }
  const badge = (file: UserFile) => file.status === 'live' ? 'Live' : file.status === 'pulled' ? 'Removed' : 'Not finished';
</script>

<svelte:head><title>My account | EditPro</title><meta name="robots" content="noindex" /></svelte:head>
<p class="back"><a href="/settings">← Settings</a></p>
<h1>My account</h1>
{#if !cloudEnabled()}
  <p class="muted">Accounts are not available on this site yet.</p>
{:else if !member.ready}
  <p class="muted" role="status">Loading…</p>
{:else if !member.user}
  <section class="card">
    <h2>Sign in with Google</h2>
    <p>Your first Library download is free. After that, sign in and share one study document to unlock {DOWNLOADS_PER_UPLOAD} more downloads. All other EditPro tools stay free.</p>
    <p class="muted">We keep the account data needed for downloads and documents you choose to share. See our <a href="/privacy">privacy policy</a>.</p>
    {#if problem}<p class="warn" role="alert">{problem}</p>{/if}{#if note}<p role="status">{note}</p>{/if}
    <button class="btn" type="button" onclick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
  </section>
{:else}
  <p>Signed in as <strong>{member.user.name}</strong>. <button class="link" type="button" onclick={signOut} disabled={busy}>Sign out</button></p>
  {#if problem}<p class="warn" role="alert">{problem}</p>{/if}{#if note}<p role="status">{note}</p>{/if}
  {#if notices.length}<section class="card"><h2>Messages</h2><ul class="plain">{#each notices as item (item.id)}<li><span>{pulledNoticeText(item)}</span> <button class="link" type="button" onclick={() => dismiss(item.id)}>Clear</button></li>{/each}</ul></section>{/if}
  <section class="card"><h2>Downloads</h2>
    {#if loading && !numbers}<p class="muted" role="status">Loading…</p>{:else if numbers}<p class="big">{creditsText(left)}</p><p class="muted">You have shared {numbers.liveUploads} {numbers.liveUploads === 1 ? 'document' : 'documents'} and used {numbers.used} {numbers.used === 1 ? 'download' : 'downloads'}. Each live document unlocks {DOWNLOADS_PER_UPLOAD} downloads. Opening a file you already unlocked costs nothing.</p>{/if}
    <button class="btn" type="button" onclick={() => void openShare()}>Share a study document</button>
  </section>
  <section class="card"><h2>My documents</h2>
    {#if loading && !mine.length}<p class="muted" role="status">Loading…</p>{:else if !mine.length}<p class="muted">You have not shared anything yet.</p>{:else}
      <ul class="rows">{#each mine as file (file.id)}<li class="row"><div class="grow">{#if file.status === 'live'}<a class="name" href={`/class-library/file?id=${encodeURIComponent(file.id)}`}>{file.title}</a>{:else}<span class="name">{file.title}</span>{/if}<div class="sub">{[categoryLabel(file.category), file.ext.toUpperCase(), fmtBytes(file.size), file.added].filter(Boolean).join(' · ')} · {badge(file)}</div>{#if file.status === 'pulled' && file.pulledReason}<div class="sub warn">Reason: {file.pulledReason}</div>{/if}</div><button class="btn small danger" type="button" onclick={() => remove(file)} disabled={busy}>Delete</button></li>{/each}</ul>
    {/if}
  </section>
  <section class="card danger-zone"><h2>Delete my account</h2><p class="muted">This permanently removes the documents you shared, download history and sign-in.</p><button class="btn danger" type="button" onclick={deleteAccount} disabled={busy}>Delete my account</button></section>
{/if}
<AccessGate />

<style>
  .back { margin: 0 0 12px; }.back a { color: var(--muted); }.card { margin: 0 0 16px; }.card h2 { margin-top: 0; }
  .big { font-size: 1.5rem; font-weight: 750; margin: 0 0 4px; }.warn { color: var(--warn); }
  .link { font: inherit; background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }.name { color: var(--ink); font-weight: 650; text-decoration: none; overflow-wrap: anywhere; }
  a.name:hover { text-decoration: underline; }.sub { color: var(--muted); font-size: .9rem; }.row { align-items: center; }
</style>
