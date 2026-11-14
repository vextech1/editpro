<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ReorderList from './ReorderList.svelte';
  import StatusLine from '../StatusLine.svelte';
  import FileDrop from '../FileDrop.svelte';
  import { appendImages, type PageSize } from '#lib/core/pdf.ts';
  import { picturesToJpegs } from '#lib/core/pdf-pictures.ts';
  import { pdfErrorMessage } from '#lib/core/files.ts';
  import { fmtBytes } from '#lib/core/format.ts';

  // Put pictures on new pages after the last page of this PDF. The tick saves the result as the next version.
  interface Item { id: number; file: File; thumb: string }
  // `extras` are pictures that arrived with the sheet (dropped on the editor, say) and start in the list.
  let { source, name, pages, extras = [], oncommit, oncancel }:
    { source: Uint8Array; name: string; pages: number; extras?: File[]; oncommit: (bytes: Uint8Array) => Promise<void>; oncancel: () => void } = $props();
  let seq = 0;
  let items = $state<Item[]>([]);
  let size = $state<PageSize>('a4');
  let margin = $state(24);
  let busy = $state(false); let status = $state(''); let bad = $state(false);

  const free = (list: Item[]) => list.forEach((i) => URL.revokeObjectURL(i.thumb));
  onDestroy(() => free(items));
  function add(files: File[]) { bad = false; status = ''; items.push(...files.map((file) => ({ id: seq++, file, thumb: URL.createObjectURL(file) }))); }
  onMount(() => { if (extras.length) add(extras); });
  function remove(id: number) { const gone = items.find((i) => i.id === id); if (gone) free([gone]); items = items.filter((i) => i.id !== id); }
  function reset() { free(items); items = []; size = 'a4'; margin = 24; status = ''; bad = false; }
  async function apply() {
    if (!items.length || busy) return;
    busy = true; bad = false; status = '';
    try {
      const jpegs = await picturesToJpegs(items.map((i) => i.file), (text) => (status = text));
      status = 'Adding pages…';
      await oncommit(await appendImages(source, jpegs, { size, margin }));
    } catch (e) {
      bad = true;
      status = e instanceof Error && e.message === 'unreadable image' ? 'One of the pictures could not be read. Remove it and try again.'
        : /encrypt|password|parse|invalid pdf/i.test(String((e as Error)?.message)) ? pdfErrorMessage(e, name) : 'Something went wrong. Try fewer or smaller pictures.';
    }
    busy = false;
  }
</script>

<ToolSheet title="Add images" onreset={reset} onapply={apply} {oncancel} busy={busy || !items.length} canReset={items.length > 0 || size !== 'a4' || margin !== 24}>
  <p class="muted" style="margin-top:0">{items.length ? (items.length === 1 ? `1 picture goes on a new page after page ${pages}.` : `${items.length} pictures go on new pages after page ${pages}, in this order.`) : `Choose pictures to put on new pages after page ${pages}.`}</p>
  <ReorderList bind:items key={(it) => it.id} name={(it) => it.file.name} sub={(it) => fmtBytes(it.file.size)} thumb={(it) => it.thumb} {busy} onremove={(it) => remove(it.id)} />
  <div><FileDrop compact accept="image/*" label={items.length ? 'Add more pictures' : 'Choose pictures'} fromSession={false} onfiles={add} /></div>
  <div class="controls">
    <label>Page size<select bind:value={size}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to picture</option></select></label>
    <label>Margin<select bind:value={margin}><option value={0}>None</option><option value={24}>Small</option><option value={48}>Large</option></select></label>
  </div>
  <StatusLine text={status} {bad} gap="above" />
</ToolSheet>

<style>
  .controls { margin: 12px 0 0; }
</style>
