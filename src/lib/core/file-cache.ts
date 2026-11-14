// A copy of each downloaded Library file kept on the visitor's own device, so opening a file and then saving it, or downloading it a
// second time, costs no Firestore reads. A file's id is never reused (a replaced file gets a new id), so a saved copy can never be stale.
// This is the browser-safe logic; the Cache API calls live in #lib/cloud/firebase.ts.
export const FILE_CACHE_NAME = 'editpro-library-files';
/** Most bytes kept on one device. The oldest copies go first. */
export const FILE_CACHE_MAX_BYTES = 150 * 1024 * 1024;

export interface FileCache {
  get(id: string): Promise<Uint8Array | undefined>;
  put(id: string, bytes: Uint8Array): Promise<void>;
}
export interface CachedItem { id: string; size: number; at: number }

/** Which saved copies to remove so the rest fit in `maxBytes`: oldest first, and never the one just saved (`keepId`). */
export function planEviction(items: CachedItem[], maxBytes = FILE_CACHE_MAX_BYTES, keepId?: string): string[] {
  let total = items.reduce((n, i) => n + i.size, 0);
  const out: string[] = [];
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break;
    if (item.id === keepId) continue;
    out.push(item.id); total -= item.size;
  }
  return out;
}

/**
 * Returns the file from the device copy when there is one of the right size; otherwise loads it once (a second request for the same
 * file while it loads shares that load) and saves a copy. The device copy is only a shortcut: any problem with it is ignored.
 */
export async function cachedDownload(
  cache: FileCache | undefined, inflight: Map<string, Promise<Uint8Array>>, id: string, size: number | undefined,
  load: () => Promise<Uint8Array>, onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  if (cache) {
    try {
      const hit = await cache.get(id);
      if (hit && (size === undefined || hit.length === size)) { onProgress?.(1, 1); return hit; }
    } catch { /* no usable copy: load it */ }
  }
  const running = inflight.get(id);
  if (running) return running;
  const job = (async () => {
    const bytes = await load();
    if (cache) { try { await cache.put(id, bytes); } catch { /* storage full or blocked: the download still works */ } }
    return bytes;
  })();
  inflight.set(id, job);
  try { return await job; } finally { inflight.delete(id); }
}
