// Library files uploaded from the website (Settings > Library admin), kept in Firebase Firestore so the free Spark plan is enough.
// Cloud Storage needs the paid Blaze plan, so each file is cut into pieces that fit Firestore's 1 MiB document limit:
//   library/index                          one document listing every uploaded file (a page view costs one read)
//   library/structure                      section > class > subject catalog, managed in the admin page
//   libraryChunks/<file id>/parts/<0000..> the file's bytes, one piece per document
// This file is the browser-safe logic (checks, cutting, joining, upload and delete order). The Firebase calls live in #lib/cloud/firebase.ts.
import { CATEGORIES, ALLOWED_EXT, extOf, isAllowedExt, titleFromFilename, type CategoryId, type ClassFile } from '#lib/core/class-library.ts';

/** Bytes per piece. Under the 1 MiB document limit with room for the field name and path. */
export const CHUNK_BYTES = 800_000;
/** Largest uploaded file. Each download reads one document per piece, and Spark allows 50,000 reads and about 10 GiB of downloads a month. */
export const CLOUD_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PARTS = Math.ceil(CLOUD_MAX_BYTES / CHUNK_BYTES);
/** Firestore's free stored data on the Spark plan. */
export const SPARK_STORAGE_BYTES = 1024 ** 3;

export interface CloudEntry {
  name: string; title: string; size: number; ext: string;
  /** Stable IDs in the admin-managed section > class > subject catalog. */
  section: string; cls: string; subject?: string; category: CategoryId; added: string; parts: number;
}
export interface CloudFile extends CloudEntry { id: string }

const ID = /^f[a-z0-9]{8,32}$/;
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
    const { name, title, size, ext, section, cls, subject, category, added, parts } = e;
    if (typeof name !== 'string' || !name || BAD_NAME.test(name) || typeof ext !== 'string' || !isAllowedExt(ext)) continue;
    if (typeof section !== 'string' || !section || typeof cls !== 'string' || !cls || !isCategory(category)) continue;
    if (subject !== undefined && typeof subject !== 'string') continue;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) continue;
    if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS + 1) continue;
    out.push({ id, name, title: typeof title === 'string' && title.trim() ? title.trim() : titleFromFilename(name), size, ext, section, cls, ...(typeof subject === 'string' ? { subject } : {}), category, added: typeof added === 'string' && DATE.test(added) ? added : '', parts });
  }
  return out;
}

export const toClassFile = (f: CloudFile): ClassFile => ({
  id: `cloud/${f.id}`, name: f.name, title: f.title, size: f.size, ext: f.ext, category: f.category,
  added: f.added || undefined, cloud: { id: f.id, parts: f.parts }
});
export const cloudForClass = (files: CloudFile[], section: string, cls: string): CloudFile[] => files.filter((f) => f.section === section && f.cls === cls);
export const cloudForSubject = (files: CloudFile[], section: string, cls: string, subject: string): CloudFile[] => files.filter((f) => f.section === section && f.cls === cls && f.subject === subject);
export const cloudBytes = (files: CloudFile[]): number => files.reduce((n, f) => n + f.size, 0);

/** The few things the page needs from Firebase, so the order of steps can be tested without it. */
export interface CloudStore {
  putPart(id: string, index: number, bytes: Uint8Array): Promise<void>;
  getPart(id: string, index: number): Promise<Uint8Array>;
  deleteParts(id: string, count: number): Promise<void>;
  setEntry(id: string, entry: CloudEntry): Promise<void>;
  removeEntry(id: string): Promise<void>;
}

/**
 * Uploads one file. The pieces go first and the index entry last, so a file never shows to students until all of it is there.
 * If anything fails, the pieces already written are removed (best effort) and the error is passed on.
 */
export async function uploadCloud(
  store: CloudStore, bytes: Uint8Array,
  meta: { name: string; title?: string; section: string; cls: string; subject?: string; category: CategoryId; added?: string },
  onProgress: (done: number, total: number) => void = () => {}, makeId: () => string = newFileId
): Promise<string> {
  const chunks = splitChunks(bytes);
  if (!chunks.length || chunks.length > MAX_PARTS + 1) throw new Error('File is empty or too large.');
  const id = makeId();
  try {
    for (const [i, c] of chunks.entries()) { await store.putPart(id, i, c); onProgress(i + 1, chunks.length); }
    await store.setEntry(id, {
      name: meta.name, title: meta.title?.trim() || titleFromFilename(meta.name), size: bytes.length, ext: extOf(meta.name),
      section: meta.section, cls: meta.cls, ...(meta.subject ? { subject: meta.subject } : {}), category: meta.category, added: meta.added ?? todayLocal(), parts: chunks.length
    });
  } catch (e) {
    try { await store.deleteParts(id, chunks.length); } catch { /* leftovers are harmless: nothing lists them */ }
    throw e;
  }
  return id;
}

/** Deletes a file: the index entry first (so it vanishes for students at once), then its pieces. */
export async function deleteCloud(store: CloudStore, id: string, parts: number): Promise<void> {
  await store.removeEntry(id);
  await store.deleteParts(id, parts);
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
  if (c === 'permission-denied') return 'This Google account is not allowed to change the Library. Sign in with the admin account, or add this email to firestore.rules and deploy the rules.';
  if (c === 'resource-exhausted' || c === 'quota-exceeded') return 'The free daily limit was reached. Try again tomorrow.';
  if (c === 'unavailable' || c === 'network-request-failed' || c === 'deadline-exceeded') return 'Could not reach Firebase. Check your internet connection and try again.';
  if (c === 'popup-closed-by-user' || c === 'cancelled-popup-request' || c === 'user-cancelled') return 'Sign-in was cancelled.';
  if (c === 'popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (c === 'unauthorized-domain') return 'This website address is not allowed to sign in yet. In the Firebase console open Authentication, then Settings, then Authorized domains, and add it.';
  if (c === 'operation-not-allowed') return 'Google sign-in is switched off. In the Firebase console open Authentication, then Sign-in method, and turn on Google.';
  if (c === 'unauthenticated') return 'Please sign in again.';
  return fallback || 'Something went wrong. Please try again.';
}
