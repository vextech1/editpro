<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import InstallApp from '#lib/components/InstallApp.svelte';
  import { fmtBytes } from '#lib/core/format.ts';
  import { OCR_LANGS } from '#lib/core/ocr.ts';
  import { getLibrary } from '#lib/core/library.ts';
  import { getSessions } from '#lib/core/session.ts';
  import { persistState, requestPersist, type PersistState } from '#lib/core/persist.ts';
  import { applyTheme, clearPrefs, getOcrLang, getTheme, setOcrLang, setTheme, getRetentionDays, setRetentionDays, RETENTION_CHOICES, type Theme } from '#lib/core/settings.ts';

  const themes: [Theme, string][] = [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']];
  const links = [['/settings/account', 'My account', 'Sign in, your shared documents and downloads'], ['/settings/admin', 'Admin', ''], ['/library?trash=1', 'Trash', 'Deleted files, kept for 30 days'], ['/faq', 'FAQ', 'Common questions'], ['/contact', 'Contact', 'Get in touch'],
    ['/privacy', 'Privacy policy', ''], ['/terms', 'Terms of use', '']];
  let theme = $state<Theme>('system'); let lang = $state('eng');
  let used = $state(0); let quota = $state(0); let count = $state(0); let unavailable = $state(false); let note = $state('');
  const codes = OCR_LANGS.map((l) => l.code);
  let safe = $state<PersistState>('unsupported');
  async function protect() { safe = await requestPersist(); note = safe === 'persisted' ? 'Your saved files are now protected.' : safe === 'not-persisted' ? 'Your browser did not allow it. Installing EditPro as an app usually helps.' : ''; }
  let keep = $state(7); let workBytes = $state(0); let workCount = $state(0);
  const keepLabel = (n: number) => (n === 0 ? 'Until I delete it' : n === 1 ? '1 day' : `${n} days`);
  function pickKeep() { setRetentionDays(keep); note = 'Saved.'; void getSessions().purgeExpired(keep).then(measure).catch(() => {}); }

  async function measure() {
    try { const lib = getLibrary(); used = await lib.totalBytes(); count = (await lib.list()).length + (await lib.list({ trash: true })).length; unavailable = false; } catch { unavailable = true; }
    try { const ss = getSessions(); const all = await ss.list(); workCount = all.length; workBytes = await ss.totalBytes(); } catch { workCount = 0; workBytes = 0; }
    try { quota = (await navigator.storage?.estimate?.())?.quota ?? 0; } catch { /* optional */ }
  }
  onMount(() => { theme = getTheme(); lang = getOcrLang(codes); keep = getRetentionDays(); measure(); void persistState().then((v) => { safe = v; }); });
  function pickTheme(t: Theme) { theme = t; setTheme(t); applyTheme(t); }
  function pickLang() { setOcrLang(lang); note = 'Saved.'; }
  let confirming = $state(false);
  async function wipe() {
    confirming = false;
    try { await getLibrary().clearAll(); } catch { /* storage unavailable */ }
    try { await getSessions().clearAll(); } catch { /* storage unavailable */ }
    clearPrefs(); theme = 'system'; lang = 'eng'; keep = 7; applyTheme('system'); await measure(); note = 'All saved files and settings were removed.';
  }
</script>
<svelte:head><title>Settings | {SITE.name}</title><meta name="robots" content="noindex" /><meta name="description" content="Theme, default OCR language, storage and help for EditPro." /></svelte:head>
<div class="set">
<h1>Settings</h1>

<h2>Appearance</h2>
<fieldset class="seg"><legend class="sr">Theme</legend>
  {#each themes as [t, l]}<label><input type="radio" name="theme" value={t} checked={theme === t} onchange={() => pickTheme(t)} />{l}</label>{/each}
</fieldset>

<h2>Text recognition</h2>
<div class="setrow"><label for="ocr-lang">Default OCR language</label>
  <select id="ocr-lang" bind:value={lang} onchange={pickLang}>{#each OCR_LANGS as l}<option value={l.code}>{l.label}</option>{/each}</select></div>

<h2>Work in progress</h2>
<div class="setrow"><label for="keep-days">Keep unused work for</label>
  <select id="keep-days" bind:value={keep} onchange={pickKeep}>{#each RETENTION_CHOICES as n}<option value={n}>{keepLabel(n)}</option>{/each}</select></div>
<p class="sub" style="margin:4px 0 0">Files you open in a studio, and their steps, stay on this device. Pinned work is never removed. {workCount} in progress, using {fmtBytes(workBytes)}.</p>

<h2>App</h2>
<InstallApp variant="row" />

<h2>Storage</h2>
{#if unavailable}
  <p class="muted">Saved files are not available in this browser.</p>
{:else}
  <div class="setrow"><span class="grow">Clearing storage will clear all files</span>
    <button class="btn small danger" type="button" onclick={() => (confirming = true)} disabled={confirming || (!count && !used)}>Clear all</button></div>
  {#if confirming}
    <div class="confirm-card" role="alertdialog" aria-labelledby="clear-title" aria-describedby="clear-desc">
      <strong id="clear-title">Clear all files?</strong>
      <p id="clear-desc" class="sub">Clearing storage will clear all files. This cannot be undone.</p>
      <div class="actions"><button class="btn small danger" type="button" onclick={wipe}>Yes, clear all</button><button class="btn small" type="button" onclick={() => (confirming = false)}>Cancel</button></div>
    </div>
  {/if}
{/if}
{#if safe === 'not-persisted'}
  <div class="setrow"><span class="grow">Saved files are not protected<div class="sub">Your browser may clear them if this device runs low on space.</div></span>
    <button class="btn small" type="button" onclick={protect}>Protect my files</button></div>
{/if}
<p role="status" class="muted">{note}</p>

<h2>Help and legal</h2>
<ul class="rows">
  {#each links as [href, label, sub]}
    <li><a class="row" {href} style="text-decoration:none;color:inherit"><span class="grow">{label}{#if sub}<div class="sub">{sub}</div>{/if}</span><span aria-hidden="true">›</span></a></li>
  {/each}
</ul>
</div>
