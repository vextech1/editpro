// Lists and flags the Library has already read from Firebase, kept on this device so the same visitor does not spend free reads again.
//   - A saved list younger than LIST_TTL_MS is used as it is: no query at all.
//   - An older one is refreshed; if that fails (offline, free daily limit reached) the saved copy is still shown.
//   - "Unlocked" is a one-way fact (a file stays unlocked), so it is kept without an expiry.
// Everything read back is checked again by the caller's parser, so a damaged or old copy just reads as "nothing saved".

/** How long a saved list counts as current. After this the next visit asks Firebase again. */
export const LIST_TTL_MS = 6 * 60 * 60 * 1000;
export const LIST_PREFIX = 'editpro.list.';

export interface ListStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** All keys, so a whole group (every student list, say) can be forgotten at once. */
  keys(): string[];
}

/** The browser's localStorage as a ListStore, or null where it is unavailable (private mode, blocked). */
export function browserListStore(): ListStore | null {
  try {
    const s = localStorage;
    return {
      getItem: (k) => s.getItem(k), setItem: (k, v) => s.setItem(k, v), removeItem: (k) => s.removeItem(k),
      keys: () => Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => k !== null)
    };
  } catch { return null; }
}

export class MemoryListStore implements ListStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

export const isFresh = (at: number, now: number, ttl = LIST_TTL_MS): boolean => Number.isFinite(at) && at <= now && now - at < ttl;

export function saveList(store: ListStore | null, key: string, data: unknown, now = Date.now()): void {
  if (!store) return;
  try { store.setItem(LIST_PREFIX + key, JSON.stringify({ at: now, data })); } catch { /* storage full or blocked: the list is simply not kept */ }
}
export function readList(store: ListStore | null, key: string): { at: number; data: unknown } | undefined {
  if (!store) return undefined;
  try {
    const j = JSON.parse(store.getItem(LIST_PREFIX + key) ?? '');
    return j && typeof j.at === 'number' && 'data' in j ? { at: j.at, data: j.data } : undefined;
  } catch { return undefined; }
}
/** Forget one saved list, or every saved list whose key starts with `prefix`. */
export function forgetLists(store: ListStore | null, prefix: string): void {
  if (!store) return;
  try { for (const k of store.keys()) if (k.startsWith(LIST_PREFIX + prefix)) store.removeItem(k); } catch { /* nothing to forget */ }
}

/**
 * The list for `key`. A fresh saved copy is returned without calling `load`. Otherwise `load` runs and its answer is saved
 * (unless `keep` says not to, e.g. a partial list). If `load` fails, a saved copy of any age is returned instead; with none, the error is thrown.
 * `parse` turns the saved data back into the real list, or undefined if it is not valid.
 */
export async function savedOrLoad<T>(
  store: ListStore | null, key: string, load: () => Promise<T>, parse: (data: unknown) => T | undefined,
  opts: { now?: number; force?: boolean; keep?: (value: T) => boolean; onFallback?: () => void } = {}
): Promise<T> {
  const now = opts.now ?? Date.now();
  const raw = readList(store, key); const saved = raw ? parse(raw.data) : undefined;
  if (saved !== undefined && raw && !opts.force && isFresh(raw.at, now)) return saved;
  try {
    const value = await load();
    if (!opts.keep || opts.keep(value)) saveList(store, key, value, now);
    return value;
  } catch (error) {
    if (saved !== undefined) { opts.onFallback?.(); return saved; }
    throw error;
  }
}

// ---- Unlocked files: once a file is unlocked for an account it stays unlocked, so the answer is kept without an expiry. ----
const unlockedKey = (uid: string, fileId: string) => `unlocked.${uid}.${fileId}`;
export const wasUnlocked = (store: ListStore | null, uid: string, fileId: string): boolean => readList(store, unlockedKey(uid, fileId))?.data === true;
export const rememberUnlocked = (store: ListStore | null, uid: string, fileId: string): void => saveList(store, unlockedKey(uid, fileId), true);
export const forgetUnlocked = (store: ListStore | null, uid: string): void => forgetLists(store, `unlocked.${uid}.`);
