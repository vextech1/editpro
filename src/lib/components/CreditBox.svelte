<script lang="ts">
  import type { Credit } from '#lib/core/class-library.ts';
  let { credit, hostedAt = '' }: { credit?: Credit; hostedAt?: string } = $props();
  const hostOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const empty = $derived(!credit && !hostedAt);
</script>

{#if !empty}
  <aside class="credit" aria-labelledby="credit-title">
    <h2 id="credit-title">Source and acknowledgement</h2>
    <dl>
      {#if credit?.by}<div><dt>Created by</dt><dd>{credit.by}</dd></div>{/if}
      {#if hostedAt}<div><dt>Hosted on</dt><dd><a href={hostedAt} target="_blank" rel="noopener noreferrer">{hostOf(hostedAt)}</a></dd></div>{/if}
      {#if credit?.link}<div><dt>Original source</dt><dd><a href={credit.link} target="_blank" rel="noopener noreferrer">{hostOf(credit.link)}</a></dd></div>{/if}
      {#if credit?.license}<div><dt>Licence or permission</dt><dd>{credit.license}</dd></div>{/if}
    </dl>
    {#if credit?.note}<p class="note">{credit.note}</p>{/if}
  </aside>
{/if}

<style>
  .credit { margin-top: 18px; padding: 14px 16px; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; background: var(--card); }
  h2 { margin: 0 0 8px; font-size: 1rem; }
  dl { margin: 0; display: grid; gap: 6px; }
  dl > div { display: grid; grid-template-columns: minmax(7.5rem, 30%) 1fr; gap: 10px; }
  dt { color: var(--muted); font-size: .9rem; }
  dd { margin: 0; overflow-wrap: anywhere; }
  dd a { color: var(--accent); }
  .note { margin: 10px 0 0; white-space: pre-line; overflow-wrap: anywhere; }
  @media (max-width: 520px) { dl > div { grid-template-columns: 1fr; gap: 0; } }
</style>
