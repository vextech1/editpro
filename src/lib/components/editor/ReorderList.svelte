<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { moveItem } from '#lib/core/pdf-studio.ts';

  // A list the person can put in order: each row has Move earlier, Move later and Remove, all at least 44px square.
  // Used by Merge (PDFs), Add images (pictures) and Scan (pages), so the three look and behave the same.
  // `items` is bound, so moving is done here; removing is the caller's, because it may have more to clean up (picture URLs, say).
  // `extra` adds buttons before Remove (class "rl-btn"); `below` adds a full-width line under the row.
  let { items = $bindable(), key, name, sub, thumb, thumbAlt, locked, busy = false, onremove, extra, below }: {
    items: T[];
    key: (item: T) => string | number;
    name: (item: T, index: number) => string;
    sub?: (item: T, index: number) => string;
    thumb?: (item: T) => string | undefined;
    thumbAlt?: (item: T, index: number) => string;
    /** A row that cannot be removed (the PDF Merge started from). */
    locked?: (item: T) => boolean;
    busy?: boolean;
    onremove: (item: T) => void;
    extra?: Snippet<[T, number]>;
    below?: Snippet<[T, number]>;
  } = $props();
</script>

<ol class="rl">
  {#each items as it, i (key(it))}
    {@const label = name(it, i)}
    {@const picture = thumb?.(it)}
    <li class:withthumb={!!picture}>
      {#if picture}<img class="rl-thumb" src={picture} alt={thumbAlt?.(it, i) ?? ''} />{/if}
      <div class="rl-name"><strong>{label}</strong>{#if sub}<span>{sub(it, i)}</span>{/if}</div>
      <button class="rl-btn" type="button" aria-label="Move {label} earlier" disabled={i === 0 || busy} onclick={() => (items = moveItem(items, i, -1))}>↑</button>
      <button class="rl-btn" type="button" aria-label="Move {label} later" disabled={i === items.length - 1 || busy} onclick={() => (items = moveItem(items, i, 1))}>↓</button>
      {@render extra?.(it, i)}
      <button class="rl-btn" type="button" aria-label="Remove {label}" disabled={busy || !!locked?.(it)} onclick={() => onremove(it)}>×</button>
      {#if below}<div class="rl-below">{@render below(it, i)}</div>{/if}
    </li>
  {/each}
</ol>

<style>
  .rl { display: grid; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
  .rl li { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 4px 4px 4px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .rl-thumb { flex: none; width: 40px; height: 52px; object-fit: cover; margin-right: 6px; border-radius: 3px; }
  .rl-name { flex: 1; min-width: 0; display: grid; }
  .rl-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rl-name span { color: var(--muted); font-size: .82rem; }
  .rl :global(.rl-btn) { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .rl :global(.rl-btn:disabled) { opacity: .35; cursor: default; }
  .rl-below { flex: 1 0 100%; display: flex; gap: 8px; padding: 0 4px 4px 0; }
  .withthumb .rl-below { padding-left: 52px; }   /* lines up under the name: row padding + picture + gap */
</style>
