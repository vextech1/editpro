<script lang="ts">
  import { emailLink, requestMessage, whatsappLink } from '#lib/core/class-library.ts';
  let { className = '' }: { className?: string } = $props();
  let what = $state('');
  const message = $derived(requestMessage(what, className));
</script>

<section class="card request" aria-labelledby="request-h">
  <h2 id="request-h">Can’t find what you need?</h2>
  <p class="muted">Tell me the file, course or topic. Pick WhatsApp or email and your message is written for you.</p>
  <label for="file-request">What do you need?</label>
  <textarea id="file-request" bind:value={what} rows="3" placeholder="E.g. Chapter 3 notes, last year’s past paper, the Networking assignment"></textarea>
  <div class="bar">
    <a class="btn wa" href={whatsappLink(message)} target="_blank" rel="noopener noreferrer">Request on WhatsApp</a>
    <a class="btn mail" href={emailLink(message)}>Request by email</a>
  </div>
</section>

<style>
  .request { margin: 28px 0 8px; }
  .request h2 { margin-top: 0; }
  label { display: block; font-weight: 650; margin: 16px 0 6px; }
  textarea { display: block; box-sizing: border-box; width: 100%; resize: vertical; min-height: 88px; font: inherit; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
  textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .wa { background: #168447; color: #fff; text-decoration: none; }
  .mail { background: transparent; color: var(--ink); border: 1px solid var(--line); text-decoration: none; }
  @media (max-width: 480px) { .bar { flex-direction: column; } .btn { text-align: center; } }
</style>
