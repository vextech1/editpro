<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import { baseName, fmtBytes, scaleTo } from '#lib/core/format.ts';
  import { draw, loadBitmap, toBlob } from '#lib/core/image.ts';
  import { diagnoseImageFailure } from '#lib/core/image-errors.ts';
  import { readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import ResultRow from './ResultRow.svelte';
  import SaveButton from './SaveButton.svelte';

  let { mode }: { mode: 'compress' | 'convert' } = $props();
  const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  interface Result { name: string; before?: number; after?: number; url?: string; filename?: string; note?: string; blob?: Blob }

  let files = $state<File[]>([]);
  // svelte-ignore state_referenced_locally
  let fmt = $state(mode === 'convert' ? 'image/png' : 'image/jpeg');
  let quality = $state(75);
  // svelte-ignore state_referenced_locally
  let max = $state(mode === 'convert' ? 0 : 2000);
  let results = $state<Result[]>([]);
  let status = $state('');
  let busy = $state(false);
  let urls: string[] = [];
  let zip = $state<{ url: string; bytes: number } | null>(null);

  function reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; results = []; zip = null; status = ''; }
  onMount(() => () => reset());   // free the result files when the tool is closed
  function pick(f: File[]) { reset(); files = f; }

  async function one(file: File): Promise<Result> {
    const bmp = await loadBitmap(file);
    const s = scaleTo(bmp.width, bmp.height, max);
    let blob: Blob | null = null; let scale = 1; let shrunk = false;
    try {
      for (let attempt = 0; ; attempt++) {
        const w = Math.max(1, Math.round(s.w * scale)), h = Math.max(1, Math.round(s.h * scale));
        let canvas: HTMLCanvasElement | undefined;
        try {
          canvas = draw(bmp, w, h, fmt === 'image/jpeg');
          blob = await toBlob(canvas, fmt, quality / 100);
          if (!blob) throw new Error('encode failed');
          break;
        } catch (error) {
          if (attempt >= 2 || Math.max(w, h) <= 1024) throw error;
          scale /= 2; shrunk = true;
        } finally { if (canvas) canvas.width = canvas.height = 0; }
      }
    } finally { bmp.close(); }
    const saved = blob!;
    const url = URL.createObjectURL(blob); urls.push(url);
    const notes = [shrunk ? 'This photo was very large, so it was made smaller to fit this device.' : '', saved.type !== fmt ? `Your browser saved this as ${saved.type.replace('image/', '').toUpperCase()} instead.` : ''];
    return {
      name: file.name, before: file.size, after: saved.size, url, blob: saved,
      filename: baseName(file.name) + (mode === 'compress' ? '-compressed.' : '.') + (EXT[saved.type] ?? 'img'),
      note: [...notes, mode === 'compress' && saved.size >= file.size ? 'This is not smaller than the original. Try WebP, a lower quality, or a smaller longest side.' : ''].filter(Boolean).join(' ')
    };
  }

  async function run() {
    reset(); busy = true;
    for (let i = 0; i < files.length; i++) {
      status = `Working on ${i + 1} of ${files.length}…`;
      try { results.push(await one(files[i])); }
      catch (error) { results.push({ name: files[i].name, note: (await diagnoseImageFailure(error, files[i])).message }); }
    }
    const done = results.filter((r) => r.blob);
    if (done.length > 1) {
      try {
        const z = zipFiles(await Promise.all(done.map(async (r) => ({ name: r.filename!, bytes: await readBytes(r.blob!) }))));
        const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length };
      } catch { /* the individual downloads still work */ }
    }
    status = 'Done. Tap Download next to each result.'; busy = false;
  }
  const saved = (r: Result) => { const p = Math.round((1 - r.after! / r.before!) * 100); return p > 0 ? ` (${p}% smaller)` : p < 0 ? ` (${-p}% larger)` : ''; };
</script>

<FileDrop accept="image/*" label="Choose images" onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'image' : 'images'} selected</p>{/if}
<div class="controls">
  <label>Format
    <select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
  <label>Quality: {quality}%
    <input type="range" min="10" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  <label>Longest side
    <select bind:value={max}><option value={0}>Original size</option><option value={3000}>3000 px</option><option value={2000}>2000 px</option><option value={1280}>1280 px</option><option value={800}>800 px</option></select></label>
</div>
{#if mode === 'compress' && fmt === 'image/png'}<p class="muted warn" role="note">PNG keeps every detail, so a photo usually gets bigger. Choose WebP or JPG to save space.</p>{/if}
<button class="btn" type="button" disabled={!files.length || busy} onclick={run}>{mode === 'compress' ? 'Compress' : 'Convert'}</button>
<p role="status" aria-live="polite" class="muted">{status}</p>
{#if zip}<div style="margin-bottom:10px"><ResultRow name="All results" bytes={zip.bytes} url={zip.url} filename={mode === 'compress' ? 'compressed-images.zip' : 'converted-images.zip'} label="Download all (ZIP)" /></div>{/if}
<ul class="rows">
  {#each results as r}
    <li class="row result"><div class="grow"><strong>{r.name}</strong>
      {#if r.url}<div class="sub">{fmtBytes(r.before!)} → {fmtBytes(r.after!)}{saved(r)}</div>{/if}
      {#if r.note}<div class="sub warn">{r.note}</div>{/if}</div>
      {#if r.url}<SaveButton url={r.url} name={r.filename!} /><a class="btn small" href={r.url} download={r.filename}>Download</a>{/if}</li>
  {/each}
</ul>
