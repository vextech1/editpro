// Student-shared study files stored beside the owner's Library files in Firestore.
import { CHUNK_BYTES, ID_PATTERN, checkCloudUpload, newFileId, splitChunks, todayLocal, type UploadCheck } from '#lib/core/cloud-library.ts';
import { CATEGORIES, extOf, titleFromFilename, type CategoryId, type ClassFile } from '#lib/core/class-library.ts';

export const USER_MAX_BYTES = 5 * 1024 * 1024;
export const USER_MIN_BYTES = 10_000;
export const USER_MAX_PARTS = Math.ceil(USER_MAX_BYTES / CHUNK_BYTES);
export const MAX_TITLE = 120;
export const USER_EXT = ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'png', 'jpg', 'jpeg'] as const;
export const isUserExt = (ext: string): boolean => (USER_EXT as readonly string[]).includes(ext);
export const USER_STALE_MS = 60 * 60 * 1000;
export const userPartId = (i: number): string => String(i);

export type UserFileStatus = 'uploading' | 'live' | 'pulled';
export interface UserFileEntry {
  uploader: string; title: string; name: string; size: number; ext: string;
  section: string; cls: string; subject?: string; category: CategoryId; added: string; parts: number;
  sha?: string;
  status: UserFileStatus; pulledReason?: string; cleaned?: boolean;
}
export interface UserFile extends UserFileEntry { id: string }
const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';
const BAD = (reason: string): UploadCheck => ({ ok: false, reason });

export function checkUserUpload(name: string, size: number): UploadCheck {
  const base = checkCloudUpload(name, Math.min(Math.max(size, 1), 1));
  if (!base.ok) return base;
  if (!isUserExt(extOf(name))) return BAD(`.${extOf(name)} files cannot be shared here. Use ${USER_EXT.map((e) => '.' + e).join(', ')}`);
  if (size < USER_MIN_BYTES) return BAD('it is too small to be a study document (under 10 KB)');
  if (size > USER_MAX_BYTES) return BAD(`${mb(size)} is over the ${mb(USER_MAX_BYTES)} limit for student uploads. Compress it first`);
  return { ok: true };
}

export function looksLikeExt(ext: string, head: Uint8Array): boolean {
  const is = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (ext) {
    case 'pdf': return is(0x25, 0x50, 0x44, 0x46);
    case 'png': return is(0x89, 0x50, 0x4e, 0x47);
    case 'jpg': case 'jpeg': return is(0xff, 0xd8, 0xff);
    case 'docx': case 'pptx': case 'xlsx': return is(0x50, 0x4b, 0x03, 0x04);
    case 'txt': return !head.subarray(0, 512).includes(0);
    default: return false;
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface UserMeta { name: string; title?: string; section: string; cls: string; subject?: string; category: CategoryId }
export function buildUserEntry(uploader: string, meta: UserMeta, size: number, parts: number, sha: string | undefined, added = todayLocal()): UserFileEntry {
  return {
    uploader, title: (meta.title?.trim() || titleFromFilename(meta.name)).slice(0, MAX_TITLE), name: meta.name, size, ext: extOf(meta.name),
    section: meta.section, cls: meta.cls, ...(meta.subject ? { subject: meta.subject } : {}), category: meta.category, added, parts,
    ...(sha ? { sha } : {}), status: 'uploading'
  };
}

export interface UserStore {
  createFile(id: string, entry: UserFileEntry): Promise<void>;
  putPart(id: string, index: number, bytes: Uint8Array): Promise<void>;
  publish(id: string): Promise<void>;
  deleteParts(id: string, count: number): Promise<void>;
  deleteFile(id: string): Promise<void>;
}

export async function uploadUserFile(
  store: UserStore, bytes: Uint8Array, uploader: string, meta: UserMeta, sha?: string,
  onProgress: (done: number, total: number) => void = () => {}, makeId: () => string = newFileId
): Promise<string> {
  const check = checkUserUpload(meta.name, bytes.length);
  if (!check.ok) throw new Error(check.reason);
  const chunks = splitChunks(bytes);
  if (chunks.length > USER_MAX_PARTS) throw new Error('This file is too large.');
  const id = makeId();
  let created = false;
  try {
    await store.createFile(id, buildUserEntry(uploader, meta, bytes.length, chunks.length, sha));
    created = true;
    for (const [i, chunk] of chunks.entries()) { await store.putPart(id, i, chunk); onProgress(i + 1, chunks.length); }
    await store.publish(id);
  } catch (error) {
    if (created) { try { await store.deleteParts(id, chunks.length); await store.deleteFile(id); } catch { /* stale uploading records are cleaned up later */ } }
    throw error;
  }
  return id;
}

export async function deleteUserFile(store: UserStore, id: string, parts: number): Promise<void> {
  await store.deleteParts(id, parts);
  await store.deleteFile(id);
}

export const staleUploads = (files: UserFile[], now = Date.now()): UserFile[] =>
  files.filter((f) => f.status === 'uploading' && f.added !== '' && now - Date.parse(f.added) > USER_STALE_MS + 24 * 3600_000);

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
const STATUSES = new Set(['uploading', 'live', 'pulled']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function parseUserFile(id: string, data: unknown): UserFile | null {
  const d = data as Partial<Record<keyof UserFileEntry, unknown>> | null;
  if (!ID_PATTERN.test(id) || !d || typeof d !== 'object') return null;
  const { uploader, title, name, size, ext, section, cls, subject, category, added, parts, sha, status, pulledReason, cleaned } = d;
  if (typeof uploader !== 'string' || !uploader || typeof name !== 'string' || !name || typeof ext !== 'string' || !isUserExt(ext)) return null;
  if (extOf(name) !== ext || typeof section !== 'string' || !section || typeof cls !== 'string' || !cls || typeof category !== 'string' || !CATEGORY_IDS.has(category)) return null;
  if (subject !== undefined && typeof subject !== 'string') return null;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null;
  if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 1 || parts > USER_MAX_PARTS + 1) return null;
  if (typeof status !== 'string' || !STATUSES.has(status)) return null;
  return {
    id, uploader, name, ext, size, section, cls, ...(typeof subject === 'string' ? { subject } : {}), category: category as CategoryId, parts,
    title: typeof title === 'string' && title.trim() ? title.trim().slice(0, MAX_TITLE) : titleFromFilename(name),
    added: typeof added === 'string' && DATE.test(added) ? added : '', status: status as UserFileStatus,
    ...(typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha) ? { sha } : {}),
    ...(typeof pulledReason === 'string' ? { pulledReason: pulledReason.slice(0, 500) } : {}),
    ...(cleaned === true ? { cleaned: true } : {})
  };
}

export const toUserClassFile = (f: UserFile): ClassFile => ({
  id: `user/${f.id}`, name: f.name, title: f.title, size: f.size, ext: f.ext, category: f.category, added: f.added || undefined,
  cloud: { id: f.id, parts: f.parts, user: true }, uploader: f.uploader, student: true
});
export const userFilesFor = (files: UserFile[], section: string, cls: string, subject?: string): UserFile[] =>
  files.filter((f) => f.status === 'live' && f.section === section && f.cls === cls && (subject === undefined || f.subject === subject));

export function checkLibraryRoom(adminUsed: number, studentBytes: number, studentCount: number, newSize: number, limit: number, perFileOverhead: number): UploadCheck {
  const used = adminUsed + studentBytes + studentCount * perFileOverhead;
  const need = newSize + perFileOverhead;
  return used + need <= limit ? { ok: true } : BAD('the Library is full right now. Please try again later');
}
