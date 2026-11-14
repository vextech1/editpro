// Browser-only Firebase calls for the Library's uploaded files. Everything here is loaded on demand (dynamic imports), so pages that do
// not use it, and the build's prerendering, never load the Firebase code. The logic that decides what to do is in #lib/core/cloud-library.ts.
//
// Two separate Firebase apps are used on purpose:
//   "reader": no sign-in code at all. Students only read, and read access is public (see firestore.rules).
//   "admin":  adds Google sign-in. Writes are allowed by firestore.rules only for the admin email(s).
// Firestore "lite" is used because it is small, has no background connection, and is all that reading and writing documents needs.
import { SITE } from '#lib/site.ts';
import { downloadCloud, mimeOf, parseCloudIndex, partId, type CloudEntry, type CloudFile, type CloudStore } from '#lib/core/cloud-library.ts';
import { parseLibraryStructure, type LibraryStructure } from '#lib/core/library-structure.ts';

/** False until the Firebase web app settings are filled in (src/lib/site.ts). Then the site works exactly as before, with no uploaded files. */
export const cloudEnabled = (): boolean => !!SITE.firebase.apiKey && !!SITE.firebase.appId;

type Lite = typeof import('firebase/firestore/lite');
const INDEX = ['library', 'index'] as const;
const STRUCTURE = ['library', 'structure'] as const;

async function open(name: 'reader' | 'admin') {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  if (name === 'admin') await import('firebase/auth');      // registers sign-in so Firestore sends the admin's token
  const fs: Lite = await import('firebase/firestore/lite');
  const app = getApps().some((a) => a.name === name) ? getApp(name) : initializeApp(SITE.firebase, name);
  return { app, fs, db: fs.getFirestore(app) };
}
const readerP = { current: undefined as ReturnType<typeof open> | undefined };
const adminP = { current: undefined as ReturnType<typeof open> | undefined };
const reader = () => (readerP.current ??= open('reader'));
const admin = () => (adminP.current ??= open('admin'));

function makeStore({ fs, db }: Awaited<ReturnType<typeof open>>): CloudStore {
  const part = (id: string, i: number) => fs.doc(db, 'libraryChunks', id, 'parts', partId(i));
  const index = () => fs.doc(db, ...INDEX);
  return {
    async putPart(id, i, bytes) { await fs.setDoc(part(id, i), { data: fs.Bytes.fromUint8Array(bytes) }); },
    async getPart(id, i) {
      const snap = await fs.getDoc(part(id, i));
      const data = snap.data()?.data;
      if (!snap.exists() || !(data instanceof fs.Bytes)) throw new Error(`Piece ${i + 1} of the file is missing.`);
      return data.toUint8Array();
    },
    async deleteParts(id, count) { for (let i = 0; i < count; i++) await fs.deleteDoc(part(id, i)); },
    async setEntry(id, entry: CloudEntry) { await fs.setDoc(index(), { files: { [id]: entry } }, { merge: true }); },
    async removeEntry(id) { await fs.setDoc(index(), { files: { [id]: fs.deleteField() } }, { merge: true }); }
  };
}

// ---- students: list and download ----
let listing: Promise<CloudFile[]> | undefined;
/** Every uploaded file. One document read, then kept for the rest of the visit. Never throws: any problem means "no uploaded files". */
export function listCloudFiles(): Promise<CloudFile[]> {
  if (!cloudEnabled()) return Promise.resolve([]);
  return (listing ??= (async () => {
    try { const { fs, db } = await reader(); return parseCloudIndex((await fs.getDoc(fs.doc(db, ...INDEX))).data()); }
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

/** Reads the file's pieces and hands the finished file to the browser as a normal download. */
export async function saveCloudFile(file: { name: string; ext: string; cloud: { id: string; parts: number } }, onProgress?: (done: number, total: number) => void): Promise<void> {
  const store = makeStore(await reader());
  const bytes = await downloadCloud(store, file.cloud.id, file.cloud.parts, onProgress);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(file.ext) }));
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
export async function adminList(): Promise<CloudFile[]> {
  const { fs, db } = await admin();
  return parseCloudIndex((await fs.getDoc(fs.doc(db, ...INDEX))).data());
}

export async function adminLibraryStructure(): Promise<LibraryStructure> {
  const { fs, db } = await admin();
  return parseLibraryStructure((await fs.getDoc(fs.doc(db, ...STRUCTURE))).data());
}

export async function adminSaveLibraryStructure(sections: LibraryStructure): Promise<void> {
  const { fs, db } = await admin();
  await fs.setDoc(fs.doc(db, ...STRUCTURE), { sections });
}
