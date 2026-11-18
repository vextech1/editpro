// Library files uploaded from the website (Settings > Admin), kept in Firebase Firestore so the free Spark plan is enough.
// Cloud Storage needs the paid Blaze plan, so each file is cut into pieces that fit Firestore's 1 MiB document limit:
//   library/index                          one document listing every uploaded file (a page view costs one read)
//   library/structure                      section > class > subject catalog, managed in the admin page
//   libraryChunks/<file id>/parts/<0000..> the file's bytes, one piece per document
// This file is the browser-safe logic (checks, cutting, joining, upload and delete order). The Firebase calls live in #lib/cloud/firebase.ts.
import type { LibraryStructure } from '#lib/core/library-structure.ts';
import { CATEGORIES, ALLOWED_EXT, cleanLabel, extOf, isAllowedExt, titleFromFilename, type CategoryId, type ClassFile } from '#lib/core/class-library.ts';

/** Bytes per piece. Under the 1 MiB document limit with room for the field name and path. */
export const CHUNK_BYTES = 800_000;
/** Largest uploaded file. Each download reads one document per piece, and Spark allows 50,000 reads and about 10 GiB of downloads a month. */
export const CLOUD_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PARTS = Math.ceil(CLOUD_MAX_BYTES / CHUNK_BYTES);
/** Firestore's free stored data on the Spark plan. */
export const SPARK_STORAGE_BYTES = 1024 ** 3;
/** Firestore also stores each document's name and index entries, so a file takes more room than its size. These are generous allowances. */
export const PART_OVERHEAD_BYTES = 1024;
export const ENTRY_OVERHEAD_BYTES = 2048;
/** Uploads stop here (90% of the free storage), so a wrong estimate or the small catalog documents can never push the project over the limit. */
export const STORAGE_LIMIT_BYTES = Math.floor(SPARK_STORAGE_BYTES * 0.9);

export interface CloudEntry {
  name: string; title: string; size: number; ext: string;
  /** Stable IDs in the admin-managed section > class > subject catalog. */
  section: string; cls: string; subject?: string; category: CategoryId; added: string; parts: number;
  /** Custom label for the 'other' category (what the admin typed). */
  label?: string;
}
/** `shard` says which index document lists the file (0 is `library/index`). It is worked out when the index is read; it is not stored in the entry. */
export interface CloudFile extends CloudEntry { id: string; shard?: number }

export const ID_PATTERN = /^f[a-z0-9]{8,32}$/;
const ID = ID_PATTERN;

// ---- The index is split across several documents, because one Firestore document holds at most 1 MiB. ----
//   library/index     the first part. Its `shards` field says how many index documents there are (missing means 1).
//   library/index-1, library/index-2 ...   the other parts. A small Library reads one document, as before.
/** About how many bytes of entries go in one index document. Well under the 1 MiB limit, so a wrong estimate cannot break an upload. */
export const INDEX_SHARD_BYTES = 600_000;
export const MAX_SHARDS = 20;
export const shardDocName = (n: number): string => (n === 0 ? 'index' : `index-${n}`);
/** A generous guess at how much room one new index entry takes. */
export const entryBytesFor = (name: string): number => 500 + name.length * 3;
/** How many index documents the first one says there are. Anything unexpected means 1. */
export function parseShardCount(first: unknown): number {
  const n = (first as { shards?: unknown } | null | undefined)?.shards;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_SHARDS ? n : 1;
}
/** Roughly how many bytes an index document uses. */
export const shardBytes = (data: unknown): number => (data ? JSON.stringify(data).length : 0);
/** The index document a new entry goes in: the first with room, or the next new one. Throws (code `index-full`) when there is no room anywhere. */
export function chooseShard(sizes: number[], entryBytes: number): number {
  for (const [i, size] of sizes.entries()) if (size + entryBytes <= INDEX_SHARD_BYTES) return i;
  if (sizes.length >= MAX_SHARDS) throw Object.assign(new Error('The Library index is full.'), { code: 'index-full' });
  return sizes.length;
}
export interface ReadIndex { files: CloudFile[]; shardSizes: number[]; failed: number }
/**
 * Reads the first index document, then the others at the same time, and joins them. `readDoc(name)` returns a document's data.
 * `failed` counts parts that could not be read; their files are missing from `files`, so a caller that writes must not go on when it is above 0.
 * If the first part cannot be read nothing is known, so that error is thrown.
 */
export async function readIndex(readDoc: (name: string) => Promise<unknown>): Promise<ReadIndex> {
  const first = await readDoc(shardDocName(0));
  const count = parseShardCount(first);
  const rest = await Promise.allSettled(Array.from({ length: count - 1 }, (_, i) => readDoc(shardDocName(i + 1))));
  const docs: unknown[] = [first, ...rest.map((r) => (r.status === 'fulfilled' ? r.value : undefined))];
  const seen = new Set<string>(); const files: CloudFile[] = [];
  docs.forEach((data, shard) => {
    for (const f of parseCloudIndex(data)) if (!seen.has(f.id)) { seen.add(f.id); files.push({ ...f, shard }); }
  });
  return { files, shardSizes: docs.map(shardBytes), failed: rest.filter((r) => r.status === 'rejected').length };
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BAD_NAME = /[#?%\\/]/;
const isCategory = (c: unknown): c is CategoryId => CATEGORIES.some((x) => x.id === c);
export const partId = (i: number): string => String(i).padStart(4, '0');
export const todayLocal = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A fresh id that is safe in a Firestore field path and document path. */
export function newFileId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return 'f' + [...random(10)].map((b) => b.toString(36).padStart(2, '0').slice(-2)).join('').slice(0, 16);
}

export type UploadCheck = { ok: true } | { ok: false; reason: string };
/** The same rules as the repository build, with the smaller size limit for uploads. */
export function checkCloudUpload(name: string, size: number): UploadCheck {
  const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';
  if (!name.trim()) return { ok: false, reason: 'it has no name' };
  if (BAD_NAME.test(name)) return { ok: false, reason: 'the name has a # ? % / or \\ in it. Rename it first' };
  if (name.startsWith('.') || name.startsWith('_')) return { ok: false, reason: 'names starting with . or _ are not allowed. Rename it first' };
  if (!isAllowedExt(extOf(name))) return { ok: false, reason: `.${extOf(name) || '?'} files are not allowed (use ${ALLOWED_EXT.join(', ')})` };
  if (size <= 0) return { ok: false, reason: 'it is empty' };
  if (size > CLOUD_MAX_BYTES) return { ok: false, reason: `${mb(size)} is over the ${mb(CLOUD_MAX_BYTES)} limit for uploads. Put it on Google Drive and add a link instead` };
  return { ok: true };
}

/** Two names count as the same file when they differ only in capital letters or spaces at the ends: students would see them as one file twice. */
export const nameKey = (name: string): string => name.trim().toLowerCase();
/** For each name, the position of the first earlier name that counts as the same file, or null. The first of a group is kept; the rest are the duplicates. */
export function duplicateOf(names: string[]): Array<number | null> {
  const first = new Map<string, number>();
  return names.map((n, i) => {
    const k = nameKey(n); const at = first.get(k);
    if (at === undefined) { first.set(k, i); return null; }
    return at;
  });
}
/** The listed files a new upload of this name replaces. */
export const sameNameAs = <T extends { name: string }>(files: T[], name: string): T[] => files.filter((f) => nameKey(f.name) === nameKey(name));

export function splitChunks(bytes: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, Math.min(i + size, bytes.length)));
  return out;
}
export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
export const mimeOf = (ext: string): string => MIME[ext] ?? 'application/octet-stream';

/**
 * Reads the index document's data. Anything unexpected is dropped rather than trusted: the index is public, and a malformed entry
 * must never break a page or reach a Firestore path.
 */
export function parseCloudIndex(data: unknown): CloudFile[] {
  const files = (data as { files?: unknown } | null | undefined)?.files;
  if (!files || typeof files !== 'object') return [];
  const out: CloudFile[] = [];
  for (const [id, raw] of Object.entries(files as Record<string, unknown>)) {
    const e = raw as Partial<Record<keyof CloudEntry, unknown>> | null;
    if (!ID.test(id) || !e || typeof e !== 'object') continue;
    const { name, title, size, ext, section, cls, subject, category, added, parts, label } = e;
    if (typeof name !== 'string' || !name || BAD_NAME.test(name) || typeof ext !== 'string' || !isAllowedExt(ext)) continue;
    if (typeof section !== 'string' || !section || typeof cls !== 'string' || !cls || !isCategory(category)) continue;
    if (subject !== undefined && typeof subject !== 'string') continue;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) continue;
    if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS + 1) continue;
    out.push({ id, name, title: typeof title === 'string' && title.trim() ? title.trim() : titleFromFilename(name), size, ext, section, cls, ...(typeof subject === 'string' ? { subject } : {}), category, ...(category === 'other' && cleanLabel(label) ? { label: cleanLabel(label) } : {}), added: typeof added === 'string' && DATE.test(added) ? added : '', parts });
  }
  return out;
}

export const toClassFile = (f: CloudFile): ClassFile => ({
  id: `cloud/${f.id}`, name: f.name, title: f.title, size: f.size, ext: f.ext, category: f.category, ...(f.label ? { label: f.label } : {}),
  added: f.added || undefined, cloud: { id: f.id, parts: f.parts }
});
export const fileViewerHref = (id: string): string => `/class-library/file?id=${encodeURIComponent(id)}`;
export const cloudForClass = (files: CloudFile[], section: string, cls: string): CloudFile[] => files.filter((f) => f.section === section && f.cls === cls);
export const cloudForSubject = (files: CloudFile[], section: string, cls: string, subject: string): CloudFile[] => files.filter((f) => f.section === section && f.cls === cls && f.subject === subject);
export const cloudBytes = (files: CloudFile[]): number => files.reduce((n, f) => n + f.size, 0);

/** About how much free storage a file of this size takes once its pieces and index entry are counted. */
export const storedSize = (size: number): number => size + Math.max(1, Math.ceil(size / CHUNK_BYTES)) * PART_OVERHEAD_BYTES + ENTRY_OVERHEAD_BYTES;
/**
 * About how much storage is in use: every listed file, plus pieces on the cleanup list that are not listed (they are still stored until
 * they are deleted). Counted generously on purpose.
 */
export function storageUsed(files: CloudFile[], trash: TrashItem[] = []): number {
  const live = new Set(files.map((f) => f.id));
  const pieces = trash.filter((t) => !live.has(t.id)).reduce((n, t) => n + t.parts * (CHUNK_BYTES + PART_OVERHEAD_BYTES), 0);
  return files.reduce((n, f) => n + storedSize(f.size), 0) + pieces;
}
export type StorageCheck = { ok: true; free: number } | { ok: false; free: number; reason: string };
/** Whether new files of these sizes fit under the storage limit. All of them must fit, so a batch never stops halfway for lack of room. */
export function checkStorage(used: number, sizes: number[]): StorageCheck {
  const mb = (n: number) => (n / 1048576).toFixed(n >= 10 * 1048576 ? 0 : 1) + ' MB';
  const free = Math.max(0, STORAGE_LIMIT_BYTES - used);
  const need = sizes.reduce((n, s) => n + storedSize(s), 0);
  if (need <= free) return { ok: true, free };
  return { ok: false, free, reason: `${sizes.length === 1 ? 'This file needs' : `These ${sizes.length} files need`} about ${mb(need)}, but only about ${mb(free)} of the free storage is left. Delete some files, or put the large ones on Google Drive and add a link instead` };
}

/** The few things the page needs from Firebase, so the order of steps can be tested without it. */
export interface CloudStore {
  putPart(id: string, index: number, bytes: Uint8Array): Promise<void>;
  getPart(id: string, index: number): Promise<Uint8Array>;
  deleteParts(id: string, count: number): Promise<void>;
  /** `shard` is the index document the entry goes in (0 is the first). */
  setEntry(id: string, entry: CloudEntry, shard: number): Promise<void>;
  removeEntry(id: string, shard: number): Promise<void>;
  /**
   * Gives existing entries a custom label (category 'other'), changing only those two fields, in one all-or-nothing write per index document.
   * An entry that was deleted in the meantime (from another device or by another admin) is skipped, never brought back.
   */
  relabelEntries(items: { id: string; shard: number }[], label: string): Promise<void>;
  /** In ONE all-or-nothing write: adds the new entry and removes the entries it replaces, so students never see two copies or none. */
  replaceEntries(add: { id: string; entry: CloudEntry; shard: number }, remove: { id: string; shard: number }[]): Promise<void>;
  /**
   * In ONE all-or-nothing write: puts every file on the cleanup list, removes every file's index entry, and saves the new section > class > subject
   * catalog. Used to delete a whole section, class or subject, so students see all of it gone or none of it.
   */
  commitRemoval(files: { id: string; parts: number; shard: number }[], structure: LibraryStructure): Promise<void>;
  /** Tells the first index document how many index documents there are, so students know to read them all. */
  setShardCount(count: number): Promise<void>;
  /** The cleanup list: pieces that may still need deleting. It is written BEFORE pieces are added or removed, so a crash or a lost connection never leaves pieces that nothing knows about. */
  markTrash(item: TrashItem): Promise<void>;
  clearTrash(id: string): Promise<void>;
  listTrash(): Promise<TrashItem[]>;
}

/** Pieces that may need deleting. `delete`: the file was being deleted. `upload`: the file was being uploaded (it may still be in progress in another tab). */
export interface TrashItem { id: string; parts: number; kind: 'delete' | 'upload'; at: number }
/** An unfinished upload is left alone this long, in case another tab is still sending it. */
export const UPLOAD_GRACE_MS = 60 * 60 * 1000;

/** Reads the cleanup list. Anything unexpected is dropped. */
export function parseTrash(data: unknown): TrashItem[] {
  const pending = (data as { pending?: unknown } | null | undefined)?.pending;
  if (!pending || typeof pending !== 'object') return [];
  const out: TrashItem[] = [];
  for (const [id, raw] of Object.entries(pending as Record<string, unknown>)) {
    const e = raw as Partial<Record<keyof TrashItem, unknown>> | null;
    if (!ID.test(id) || !e || typeof e !== 'object') continue;
    if (typeof e.parts !== 'number' || !Number.isInteger(e.parts) || e.parts < 1 || e.parts > MAX_PARTS + 1) continue;
    if (e.kind !== 'delete' && e.kind !== 'upload') continue;
    out.push({ id, parts: e.parts, kind: e.kind, at: typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : 0 });
  }
  return out;
}

/**
 * Deletes pieces 0..count-1 and then any further pieces that exist, one after another until one is missing. The count comes from a list
 * that may be out of date or wrong, and a wrong count must never strand pieces that keep using the free storage.
 */
export async function deleteAllParts(count: number, deleteOne: (i: number) => Promise<void>, exists: (i: number) => Promise<boolean>, parallel = 5): Promise<void> {
  await forEachLimited(count, deleteOne, parallel);
  for (let i = count; i < count + MAX_PARTS + 20 && await exists(i); i++) await deleteOne(i);
}

/** Runs `fn` for 0..count-1, a few at a time. Every call is attempted even if one fails; the first error is then thrown. */
export async function forEachLimited(count: number, fn: (i: number) => Promise<void>, parallel = 5): Promise<void> {
  let next = 0; let firstError: unknown; let failed = false;
  const worker = async () => {
    for (;;) {
      const i = next++; if (i >= count) return;
      try { await fn(i); } catch (e) { if (!failed) { failed = true; firstError = e; } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, count) }, worker));
  if (failed) throw firstError;
}

/**
 * Deletes the pieces on the cleanup list. A listed file that is still in the Library (`liveIds`) is never touched: its record is only
 * removed, so a record left behind by a finished upload or a delete that never happened cannot destroy a good file.
 */
export async function emptyTrash(store: CloudStore, liveIds: ReadonlySet<string>, now = Date.now()): Promise<{ cleaned: number; failed: number }> {
  let cleaned = 0; let failed = 0;
  for (const item of await store.listTrash()) {
    try {
      if (liveIds.has(item.id)) { await store.clearTrash(item.id); continue; }
      if (item.kind === 'upload' && now - item.at < UPLOAD_GRACE_MS) continue;
      await store.deleteParts(item.id, item.parts);
      await store.clearTrash(item.id); cleaned++;
    } catch { failed++; }
  }
  return { cleaned, failed };
}

/**
 * Uploads one file. The pieces go first and the index entry last, so a file never shows to students until all of it is there.
 * If anything fails, the pieces already written are removed (best effort) and the error is passed on.
 */
export async function uploadCloud(
  store: CloudStore, bytes: Uint8Array,
  meta: { name: string; title?: string; section: string; cls: string; subject?: string; category: CategoryId; label?: string; added?: string; shard?: number; shardCount?: number; replaces?: { id: string; parts: number; shard?: number }[] },
  onProgress: (done: number, total: number) => void = () => {}, makeId: () => string = newFileId
): Promise<string> {
  const chunks = splitChunks(bytes);
  if (!chunks.length || chunks.length > MAX_PARTS + 1) throw new Error('File is empty or too large.');
  const id = makeId();
  const replaces = meta.replaces ?? [];
  await store.markTrash({ id, parts: chunks.length, kind: 'upload', at: Date.now() });   // before any piece is written, so a crash cannot leave unlisted pieces
  let indexTouched = false;
  try {
    for (const [i, c] of chunks.entries()) { await store.putPart(id, i, c); onProgress(i + 1, chunks.length); }
    const shard = meta.shard ?? 0;
    if (shard >= (meta.shardCount ?? 1)) await store.setShardCount(shard + 1);   // a new index document is announced before anything is put in it
    // The files being replaced go on the cleanup list first, so their pieces are removed even if this page closes right after the swap.
    for (const r of replaces) await store.markTrash({ id: r.id, parts: r.parts, kind: 'delete', at: Date.now() });
    const entry: CloudEntry = {
      name: meta.name, title: meta.title?.trim() || titleFromFilename(meta.name), size: bytes.length, ext: extOf(meta.name),
      section: meta.section, cls: meta.cls, ...(meta.subject ? { subject: meta.subject } : {}), category: meta.category, ...(meta.category === 'other' && cleanLabel(meta.label) ? { label: cleanLabel(meta.label) } : {}), added: meta.added ?? todayLocal(), parts: chunks.length
    };
    indexTouched = true;
    if (replaces.length) await store.replaceEntries({ id, entry, shard }, replaces.map((r) => ({ id: r.id, shard: r.shard ?? 0 })));   // new copy in, old copies out, together
    else await store.setEntry(id, entry, shard);
  } catch (e) {
    if (indexTouched) {
      // The index write may have gone through even though an error came back (a dropped connection). Deleting the pieces now could ruin a
      // file that is listed, so the cleanup list decides later, after a fresh look at the index: listed files are kept, others are removed.
      try { await store.markTrash({ id, parts: chunks.length, kind: 'delete', at: Date.now() }); } catch { /* nothing more can be done now */ }
      throw e;
    }
    // Nothing was listed yet: remove what was written. If that fails too, the record stays on the cleanup list and is retried the next time the admin page opens.
    try { await store.deleteParts(id, chunks.length); await store.clearTrash(id); }
    catch { try { await store.markTrash({ id, parts: chunks.length, kind: 'delete', at: Date.now() }); } catch { /* nothing more can be done now */ } }   // no longer in progress, so the retry need not wait
    for (const r of replaces) { try { await store.clearTrash(r.id); } catch { /* the file is still listed, so the record is ignored later */ } }
    throw e;
  }
  try { await store.clearTrash(id); } catch { /* harmless: a record for a listed file is only removed, never acted on */ }
  // The old copies are no longer listed. Their pieces are removed now; if that fails, the cleanup list retries, and the upload still counts as done.
  for (const r of replaces) { try { await store.deleteParts(r.id, r.parts); await store.clearTrash(r.id); } catch { /* retried from the cleanup list */ } }
  return id;
}

/**
 * Deletes a section, class or subject: the new catalog, the removal of every file in it and their cleanup records all go in as ONE
 * all-or-nothing write, so a failure part-way can never leave a catalog pointing at missing files, or files with no place in it.
 * The pieces are then deleted one file at a time. If some cannot be, the operation still counts as done: their records are on the
 * cleanup list and are retried automatically. Returns how many files still have pieces waiting for that retry.
 */
export async function deleteTree(store: CloudStore, files: { id: string; parts: number; shard?: number }[], structure: LibraryStructure): Promise<{ leftovers: number }> {
  await store.commitRemoval(files.map((f) => ({ id: f.id, parts: f.parts, shard: f.shard ?? 0 })), structure);
  let leftovers = 0;
  for (const f of files) {
    try { await store.deleteParts(f.id, f.parts); await store.clearTrash(f.id); }
    catch { leftovers++; }
  }
  return { leftovers };
}

/**
 * Deletes a file: it is put on the cleanup list first, then the index entry goes (so it vanishes for students at once), then its pieces.
 * If the pieces cannot all be deleted, the error is passed on and the cleanup list keeps the rest for a later retry.
 */
export async function deleteCloud(store: CloudStore, id: string, parts: number, shard = 0): Promise<void> {
  await store.markTrash({ id, parts, kind: 'delete', at: Date.now() });
  try { await store.removeEntry(id, shard); }
  catch (e) { try { await store.clearTrash(id); } catch { /* the file is still listed, so the record is ignored later */ } throw e; }
  await store.deleteParts(id, parts);
  try { await store.clearTrash(id); } catch { /* the pieces are gone; a leftover record only repeats a harmless delete */ }
}

/** Gives these files a custom label (they are kept under the 'other' category). Only the label and category change, and a file deleted meanwhile is not restored. */
export async function relabelCloud(store: CloudStore, files: CloudFile[], label: string): Promise<void> {
  const clean = cleanLabel(label);
  if (!clean) throw new Error('A label needs some text.');
  if (files.length) await store.relabelEntries(files.map((f) => ({ id: f.id, shard: f.shard ?? 0 })), clean);
}

/** Reads every piece (a few at a time) and joins them. Throws if one is missing. */
export async function downloadCloud(store: CloudStore, id: string, parts: number, onProgress: (done: number, total: number) => void = () => {}, parallel = 4): Promise<Uint8Array> {
  const got: Uint8Array[] = new Array(parts);
  let next = 0; let done = 0;
  const worker = async () => {
    for (;;) { const i = next++; if (i >= parts) return; got[i] = await store.getPart(id, i); onProgress(++done, parts); }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, parts) }, worker));
  return joinChunks(got);
}

/** Plain-language messages for the errors Firebase can give. `code` is the error's code, for example "permission-denied". */
export function friendlyCloudError(code: string | undefined, fallback = ''): string {
  const c = (code ?? '').replace(/^(firestore|auth)\//, '');
  if (c === 'permission-denied') return 'This Google account is not allowed to change the Library. Sign in with the admin account, or ask the owner to add this email under Admins on the Admin page.';
  if (c === 'resource-exhausted' || c === 'quota-exceeded') return 'The free daily limit was reached. Try again tomorrow.';
  if (c === 'unavailable' || c === 'network-request-failed' || c === 'deadline-exceeded') return 'Could not reach Firebase. Check your internet connection and try again.';
  if (c === 'popup-closed-by-user' || c === 'cancelled-popup-request' || c === 'user-cancelled') return 'Sign-in was cancelled.';
  if (c === 'popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (c === 'unauthorized-domain') return 'This website address is not allowed to sign in yet. In the Firebase console open Authentication, then Settings, then Authorized domains, and add it.';
  if (c === 'operation-not-allowed') return 'Google sign-in is switched off. In the Firebase console open Authentication, then Sign-in method, and turn on Google.';
  if (c === 'index-full') return 'The Library index has no room for more files. Delete some files first.';
  if (c === 'unauthenticated') return 'Please sign in again.';
  return fallback || 'Something went wrong. Please try again.';
}

/** What a student sees when a download fails. Unlike friendlyCloudError, it never talks about admin sign-in. */
export function downloadErrorMessage(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  const msg = e instanceof Error ? e.message : '';
  if (/piece \d+ of the file is missing/i.test(msg)) return 'This file is incomplete on our side, so it cannot be downloaded. Please let us know and we will upload it again.';
  if (code === 'permission-denied' || code === 'unauthenticated') return 'This file could not be downloaded right now. Please try again later.';
  return friendlyCloudError(code, 'The download did not finish. Please try again.');
}
