<script lang="ts">
  import { closeGate, gate, member, signInMember } from '#lib/cloud/member.svelte.ts';
  import { DOWNLOADS_PER_UPLOAD, gateCopy } from '#lib/core/access.ts';
  import MemberUpload from '#lib/components/MemberUpload.svelte';
  let dialog = $state<HTMLDialogElement>(); let busy = $state(false); let problem = $state(''); let thanks = $state(false);
  $effect(() => {
    if (!dialog) return;
    if (gate.open && !dialog.open) { problem = ''; thanks = false; dialog.showModal(); }
    else if (!gate.open && dialog.open) dialog.close();
  });
  const copy = $derived(gate.reason === 'share' && gate.kind === 'upload'
    ? { title: 'Share a study document', body: `Your document helps other students, and every document you share unlocks ${DOWNLOADS_PER_UPLOAD} more downloads.`, action: '' }
    : gate.reason === 'share'
      ? { title: 'Sign in to share', body: 'Sign in with Google to share a study document. All other tools on this site stay free, with or without an account.', action: 'Sign in with Google' }
      : gateCopy(gate.kind));
  function finish() { const retry = gate.retry; closeGate(); retry?.(); }
  async function signIn() {
    busy = true; problem = '';
    try { if (await signInMember()) finish(); }
    catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') problem = 'Sign-in did not work. Please try again.';
    } finally { busy = false; }
  }
  function uploaded() { thanks = true; setTimeout(finish, 1200); }
</script>

<dialog bind:this={dialog} class="gate" aria-labelledby="gate-title" onclose={() => { if (gate.open) closeGate(); }}>
  <h2 id="gate-title">{copy.title}</h2>
  {#if gate.title && gate.reason === 'download'}<p class="file">“{gate.title}”</p>{/if}
  <p>{copy.body}</p>
  {#if thanks}<p class="ok" role="status">Thank you! You unlocked {DOWNLOADS_PER_UPLOAD} more downloads.</p>
  {:else if gate.kind === 'sign-in'}
    {#if problem}<p class="warn" role="alert">{problem}</p>{/if}
    <button class="btn" type="button" onclick={signIn} disabled={busy}>{busy ? 'Signing in…' : copy.action}</button>
  {:else if member.user}<MemberUpload onUploaded={uploaded} />{/if}
  <p class="more"><a href="/settings/account">My account</a> · <button class="link" type="button" onclick={closeGate}>Not now</button></p>
</dialog>

<style>
  .gate { box-sizing: border-box; width: min(92vw, 520px); max-height: 88vh; overflow: auto; padding: 22px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); }
  .gate::backdrop { background: rgba(0,0,0,.5); }
  h2 { margin: 0 0 8px; }
  .file { font-weight: 650; overflow-wrap: anywhere; }
  .ok { color: var(--accent); font-weight: 650; }
  .warn { color: var(--warn); }
  .more { margin-top: 16px; color: var(--muted); font-size: .92rem; }
  .more a, .link { color: var(--muted); }
  .link { font: inherit; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
</style>
