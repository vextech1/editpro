// Browser-only Firebase calls for the Library's uploaded files. Everything here is loaded on demand (dynamic imports), so pages that do
// not use it, and the build's prerendering, never load the Firebase code. The logic that decides what to do is in #lib/core/cloud-library.ts.
//
// Two separate Firebase apps are used on purpose:
//   "reader": no sign-in code at all. Students only read, and read access is public (see firestore.rules).
//   "admin":  adds Google sign-in. Writes are allowed by firestore.rules only for the owner and the admins added on the admin page.
// Firestore "lite" is used because it is small, has no background connection, and is all that reading and writing documents needs.
import { SITE } from '#lib/site.ts';
import { ADMINS_COLLECTION, normalizeEmail, sortedAdmins } from '#lib/core/admins.ts';
import { deleteAllParts, downloadCloud, mimeOf, parseTrash, partId, readIndex, shardDocName, type CloudEntry, type CloudFile, type CloudStore, type ReadIndex, type TrashItem } from '#lib/core/cloud-library.ts';
import { FILE_CACHE_MAX_BYTES, FILE_CACHE_NAME, cachedDownload, planEviction, type FileCache } from '#lib/core/file-cache.ts';
import { parseLibraryStructure, type LibraryStructure } from '#lib/core/library-structure.ts';

/** False until the Firebase web app settings are filled in (src/lib/site.ts). Then the site works exactly as before, with no uploaded files. */
export const cloudEnabled = (): boolean => !!SITE.firebase.apiKey && !!SITE.firebase.appId;

type Lite = typeof import('firebase/firestore/lite');
const STRUCTURE = ['library', 'structure'] as const;
const TRASH = ['library', 'trash'] as const;

async function open(name: 'reader' | 'admin') {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  if (name === 'admin') await import('firebase/auth');      // registers sign-in so Firestore sends the admin's token
  const fs: Lite = await import('firebase/firestore/lite');
  const existing = getApps().some((a) => a.name === name);
  const app = existing ? getApp(name) : initializeApp(SITE.firebase, name);
  // App Check proves a request comes from this website rather than a script, which is what stops someone using up the free daily reads.
  // It is switched on by filling in SITE.appCheckSiteKey; until then nothing changes. It must be set up before Firestore is created.
  if (!existing && SITE.appCheckSiteKey) {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(SITE.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  return { app, fs, db: fs.getFirestore(app) };
}
const readerP = { current: undefined as ReturnType<typeof open> | undefined };
const adminP = { current: undefined as ReturnType<typeof open> | undefined };
const reader = () => (readerP.current ??= open('reader'));
const admin = () => (adminP.current ??= open('admin'));

function makeStore({ fs, db }: Awaited<ReturnType<typeof open>>): CloudStore {
  const part = (id: string, i: number) => fs.doc(db, 'libraryChunks', id, 'parts', partId(i));
  const shardDoc = (n: number) => fs.doc(db, 'library', shardDocName(n));
  return {
    async putPart(id, i, bytes) { await fs.setDoc(part(id, i), { data: fs.Bytes.fromUint8Array(bytes) }); },
    async getPart(id, i) {
      const snap = await fs.getDoc(part(id, i));
      const data = snap.data()?.data;
      if (!snap.exists() || !(data instanceof fs.Bytes)) throw new Error(`Piece ${i + 1} of the file is missing.`);
      return data.toUint8Array();
    },
    // Also removes pieces beyond `count` if there are any (one extra read to check), so a wrong count cannot strand them.
    async deleteParts(id, count) { await deleteAllParts(count, (i) => fs.deleteDoc(part(id, i)), async (i) => (await fs.getDoc(part(id, i))).exists()); },
    async setEntry(id, entry: CloudEntry, shard) { await fs.setDoc(shardDoc(shard), { files: { [id]: entry } }, { merge: true }); },
    async removeEntry(id, shard) { await fs.setDoc(shardDoc(shard), { files: { [id]: fs.deleteField() } }, { merge: true }); },
    async replaceEntries(add, remove) {
      const batch = fs.writeBatch(db);
      batch.set(shardDoc(add.shard), { files: { [add.id]: add.entry } }, { merge: true });
      for (const r of remove) batch.set(shardDoc(r.shard), { files: { [r.id]: fs.deleteField() } }, { merge: true });
      await batch.commit();
    },
    async commitRemoval(files, structure) {
      const batch = fs.writeBatch(db);
      const byShard = new Map<number, Record<string, unknown>>(); const pending: Record<string, unknown> = {}; const at = Date.now();
      for (const f of files) {
        byShard.set(f.shard, { ...(byShard.get(f.shard) ?? {}), [f.id]: fs.deleteField() });
        pending[f.id] = { parts: f.parts, kind: 'delete', at };
      }
      for (const [shard, removed] of byShard) batch.set(shardDoc(shard), { files: removed }, { merge: true });
      if (files.length) batch.set(fs.doc(db, ...TRASH), { pending }, { merge: true });
      batch.set(fs.doc(db, ...STRUCTURE), { sections: structure });
      await batch.commit();
    },
    async setShardCount(count) { await fs.setDoc(shardDoc(0), { shards: count }, { merge: true }); },
    async markTrash(item: TrashItem) { await fs.setDoc(fs.doc(db, ...TRASH), { pending: { [item.id]: { parts: item.parts, kind: item.kind, at: item.at } } }, { merge: true }); },
    async clearTrash(id) { await fs.setDoc(fs.doc(db, ...TRASH), { pending: { [id]: fs.deleteField() } }, { merge: true }); },
    async listTrash() { return parseTrash((await fs.getDoc(fs.doc(db, ...TRASH))).data()); }
  };
}

// ---- students: list and download ----
const copyUrl = (id: string) => `/__library-files/${id}`;
/** Copies kept on this device (Cache API). Undefined where the browser has none, such as an insecure page. */
function deviceCache(): FileCache | undefined {
  if (typeof caches === 'undefined') return undefined;
  return {
    async get(id) { const r = await (await caches.open(FILE_CACHE_NAME)).match(copyUrl(id)); return r ? new Uint8Array(await r.arrayBuffer()) : undefined; },
    async put(id, bytes) {
      const c = await caches.open(FILE_CACHE_NAME);
      await c.put(copyUrl(id), new Response(bytes as BodyInit, { headers: { 'x-size': String(bytes.length), 'x-at': String(Date.now()) } }));
      const items = (await Promise.all((await c.keys()).map(async (k) => {
        const r = await c.match(k);
        return { id: new URL(k.url).pathname.split('/').pop() ?? '', size: Number(r?.headers.get('x-size')) || 0, at: Number(r?.headers.get('x-at')) || 0 };
      })));
      for (const old of planEviction(items, FILE_CACHE_MAX_BYTES, id)) await c.delete(copyUrl(old));
    }
  };
}
/** Removes device copies of files that are no longer in the Library. */
async function pruneDeviceCopies(validIds: Set<string>): Promise<void> {
  if (typeof caches === 'undefined') return;
  const c = await caches.open(FILE_CACHE_NAME);
  for (const k of await c.keys()) if (!validIds.has(new URL(k.url).pathname.split('/').pop() ?? '')) await c.delete(k);
}
const loading = new Map<string, Promise<Uint8Array>>();
let listing: Promise<CloudFile[]> | undefined;
/** Every uploaded file. One document read, then kept for the rest of the visit. Never throws: any problem means "no uploaded files". */
export function listCloudFiles(): Promise<CloudFile[]> {
  if (!cloudEnabled()) return Promise.resolve([]);
  return (listing ??= (async () => {
    try {
      const { fs, db } = await reader();
      const { files, failed } = await readIndex(async (name) => (await fs.getDoc(fs.doc(db, 'library', name))).data());
      if (failed) listing = undefined;     // some parts could not be read: show what there is now, and try again on the next request
      else if (files.length) void pruneDeviceCopies(new Set(files.map((f) => f.id))).catch(() => {});
      return files;
    }
    catch { listing = undefined; return []; }       // try again next time instead of remembering a failure
  })());
}
export const forgetCloudList = (): void => { listing = undefined; };

export async function getLibraryStructure(): Promise<LibraryStructure> {
  if (!cloudEnabled()) return [];
  try {
    const { fs, db } = await reader();
    return parseLibraryStructure((await fs.getDoc(fs.doc(db, ...STRUCTURE))).data());
  } catch { return []; }
}

/** Reads the file's pieces and returns them with their original content type. */
export async function fetchCloudFile(file: { name: string; ext: string; size?: number; cloud: { id: string; parts: number } }, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const bytes = await cachedDownload(deviceCache(), loading, file.cloud.id, file.size, async () => downloadCloud(makeStore(await reader()), file.cloud.id, file.cloud.parts, onProgress), onProgress);
  return new Blob([bytes as BlobPart], { type: mimeOf(file.ext) });
}

/** Reads the file's pieces and hands the finished file to the browser as a normal download. */
export async function saveCloudFile(file: { name: string; ext: string; size?: number; cloud: { id: string; parts: number } }, onProgress?: (done: number, total: number) => void): Promise<void> {
  const blob = await fetchCloudFile(file, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- admin: sign in, upload, delete ----
export interface AdminSession { email: string }
export async function adminStore(): Promise<CloudStore> { return makeStore(await admin()); }

/** Calls back with the signed-in Google account, or null. Returns a function that stops listening. */
export async function watchAdmin(cb: (s: AdminSession | null) => void): Promise<() => void> {
  const { app } = await admin(); const { getAuth, onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(getAuth(app), (u) => cb(u?.email ? { email: u.email } : null));
}
export async function adminSignIn(): Promise<void> {
  const { app } = await admin(); const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  const auth = getAuth(app); const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    // Some phone browsers block the pop-up window: fall back to a full-page sign-in.
    if ((e as { code?: string }).code === 'auth/popup-blocked') { await signInWithRedirect(auth, provider); return; }
    throw e;
  }
}
export async function adminSignOut(): Promise<void> {
  const { app } = await admin(); const { getAuth, signOut } = await import('firebase/auth'); await signOut(getAuth(app));
}
/** The admin always reads fresh (not the students' kept copy), so the list after an upload or delete is the real one. */
export async function adminList(): Promise<ReadIndex> {
  const { fs, db } = await admin();
  const index = await readIndex(async (name) => (await fs.getDoc(fs.doc(db, 'library', name))).data());
  // A missing part would make the list, and where new files go, wrong. Better to stop than to guess.
  if (index.failed) throw Object.assign(new Error('Part of the Library index could not be read.'), { code: 'unavailable' });
  return index;
}

/** Pieces that may still need deleting (the cleanup list), read fresh. */
export async function adminTrash(): Promise<TrashItem[]> {
  const { fs, db } = await admin();
  return parseTrash((await fs.getDoc(fs.doc(db, ...TRASH))).data());
}

export async function adminLibraryStructure(): Promise<LibraryStructure> {
  const { fs, db } = await admin();
  return parseLibraryStructure((await fs.getDoc(fs.doc(db, ...STRUCTURE))).data());
}

export async function adminSaveLibraryStructure(sections: LibraryStructure): Promise<void> {
  const { fs, db } = await admin();
  await fs.setDoc(fs.doc(db, ...STRUCTURE), { sections });
}

// ---- admins: who may change the Library (see #lib/core/admins.ts) ----
/** The helper admins, or null when this account is not the owner (only the owner may see or change the list). */
export async function adminListAdmins(): Promise<string[] | null> {
  const { fs, db } = await admin();
  try { return sortedAdmins((await fs.getDocs(fs.collection(db, ADMINS_COLLECTION))).docs.map((d) => d.id)); }
  catch (e) { if ((e as { code?: string }).code === 'permission-denied') return null; throw e; }
}
export async function adminAddAdmin(email: string): Promise<void> {
  const { fs, db } = await admin();
  await fs.setDoc(fs.doc(db, ADMINS_COLLECTION, normalizeEmail(email)), { added: new Date().toISOString().slice(0, 10) });
}
export async function adminRemoveAdmin(email: string): Promise<void> {
  const { fs, db } = await admin();
  await fs.deleteDoc(fs.doc(db, ADMINS_COLLECTION, normalizeEmail(email)));
}
