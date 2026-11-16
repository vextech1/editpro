// Copies of Library files kept on the student's device, so a file opened before opens again without downloading it again (and without
// spending the free daily reads). The browser side (Cache API) lives in cloud/firebase.ts; the decisions live here so they can be tested.

export const FILE_CACHE_NAME = 'editpro-library-files-v1';
/** The most this device keeps. Older copies are dropped first when a new one would go over. */
export const FILE_CACHE_MAX_BYTES = 150 * 1024 * 1024;

/** Where copies are kept. Either call may fail (storage full, private mode); the download never depends on it. */
export interface FileCache {
  get(id: string): Promise<Uint8Array | undefined>;
  put(id: string, bytes: Uint8Array): Promise<void>;
}

export interface CachedItem { id: string; size: number; at: number }

/**
 * The copies to delete so that what is kept fits in `maxBytes`: the oldest go first, and `keepId` (the one just saved) is never chosen.
 * If `keepId` alone is bigger than `maxBytes`, everything else goes and it stays, because it was just asked for.
 */
export function planEviction(items: CachedItem[], maxBytes: number, keepId: string): string[] {
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
 * The file's bytes: from this device if a copy of the right size is there, otherwise from `fetchBytes`, then copied to the device.
 * Two requests for the same file at once share one download (`inflight`). A copy whose size is not the expected `size` is treated as damaged.
 */
export async function cachedDownload(
  cache: FileCache | undefined, inflight: Map<string, Promise<Uint8Array>>, id: string, size: number | undefined,
  fetchBytes: () => Promise<Uint8Array>, onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const running = inflight.get(id); if (running) return running;
  const job = (async () => {
    if (cache) {
      let saved: Uint8Array | undefined;
      try { saved = await cache.get(id); } catch { /* an unreadable cache is the same as an empty one */ }
      if (saved && (size === undefined || saved.length === size)) { onProgress?.(1, 1); return saved; }
    }
    const bytes = await fetchBytes();
    if (cache) void cache.put(id, bytes).catch(() => { /* optional: the file still opens */ });
    return bytes;
  })();
  inflight.set(id, job);
  try { return await job; } finally { inflight.delete(id); }
}
