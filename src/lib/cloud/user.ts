// Browser-only Firebase calls for student sign-in, shared files, download credits and account data.
import { cloudEnabled, listCloudFiles, openFirebase, reader } from '#lib/cloud/firebase.ts';
import { ENTRY_OVERHEAD_BYTES, PART_OVERHEAD_BYTES, STORAGE_LIMIT_BYTES, deleteAllParts, storageUsed } from '#lib/core/cloud-library.ts';
import { parseNotices, type Notice } from '#lib/core/access.ts';
import {
  checkLibraryRoom, checkUserUpload, deleteUserFile, looksLikeExt, parseSavedUserFiles, parseUserFile, sha256Hex, staleUploads, uploadUserFile, userPartId,
  type UserFile, type UserMeta, type UserStore
} from '#lib/core/user-library.ts';
import { extOf } from '#lib/core/class-library.ts';
import { browserListStore, forgetLists, forgetUnlocked, rememberUnlocked, savedOrLoad, wasUnlocked } from '#lib/core/list-cache.ts';

export { cloudEnabled };
type Opened = Awaited<ReturnType<typeof openFirebase>>;
const userP = { current: undefined as Promise<Opened> | undefined };
const member = () => (userP.current ??= openFirebase('user'));
export interface Member { uid: string; name: string }

export async function watchMember(cb: (m: Member | null) => void): Promise<() => void> {
  const { app } = await member(); const { getAuth, onAuthStateChanged, getRedirectResult } = await import('firebase/auth');
  const auth = getAuth(app);
  void getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, (user) => { forgetAccess(); cb(user ? { uid: user.uid, name: user.displayName || 'Student' } : null); });
}
export async function memberSignIn(): Promise<Member | null> {
  const { app } = await member(); const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  const auth = getAuth(app); const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  try { const { user } = await signInWithPopup(auth, provider); return { uid: user.uid, name: user.displayName || 'Student' }; }
  catch (error) {
    if ((error as { code?: string }).code === 'auth/popup-blocked') { await signInWithRedirect(auth, provider); return null; }
    throw error;
  }
}
export async function memberSignOut(): Promise<void> {
  const { app } = await member(); const { getAuth, signOut } = await import('firebase/auth'); await signOut(getAuth(app)); forgetAccess();
}

export interface AccessState { unlocked: boolean; liveUploads: number; used: number }
const cache = { uid: '', numbers: undefined as Promise<{ liveUploads: number; used: number }> | undefined, unlocked: new Map<string, boolean>() };
export function forgetAccess(): void { cache.uid = ''; cache.numbers = undefined; cache.unlocked.clear(); }
async function readNumbers(uid: string) {
  const { fs, db } = await member();
  const [profile, count] = await Promise.all([
    fs.getDoc(fs.doc(db, 'users', uid)),
    fs.getCount(fs.query(fs.collection(db, 'userFiles'), fs.where('uploader', '==', uid), fs.where('status', '==', 'live')))
  ]);
  return { used: Number(profile.data()?.used) || 0, liveUploads: count.data().count };
}
export async function readAccountNumbers(uid: string): Promise<{ liveUploads: number; used: number }> {
  forgetAccess(); cache.uid = uid; return readNumbers(uid);
}
export async function readAccessState(uid: string, fileId: string): Promise<AccessState> {
  if (cache.uid !== uid) { forgetAccess(); cache.uid = uid; }
  // A file once unlocked stays unlocked: if this device already knows, ask Firebase nothing (the credit numbers only matter for a new unlock).
  if (cache.unlocked.get(fileId) === true || wasUnlocked(browserListStore(), uid, fileId)) { cache.unlocked.set(fileId, true); return { unlocked: true, liveUploads: 0, used: 0 }; }
  const numbers = await (cache.numbers ??= readNumbers(uid).catch((error) => { cache.numbers = undefined; throw error; }));
  let unlocked = cache.unlocked.get(fileId);
  if (unlocked === undefined) {
    const { fs, db } = await member();
    unlocked = (await fs.getDoc(fs.doc(db, 'users', uid, 'unlocked', fileId))).exists(); cache.unlocked.set(fileId, unlocked);
    if (unlocked) rememberUnlocked(browserListStore(), uid, fileId);
  }
  return { unlocked, ...numbers };
}
export async function unlockFile(uid: string, fileId: string): Promise<void> {
  const { fs, db } = await member();
  const profile = fs.doc(db, 'users', uid); const unlocked = fs.doc(db, 'users', uid, 'unlocked', fileId);
  await fs.runTransaction(db, async (transaction) => {
    if ((await transaction.get(unlocked)).exists()) return;
    const account = await transaction.get(profile);
    transaction.set(unlocked, { at: Date.now() });
    transaction.set(profile, { used: (Number(account.data()?.used) || 0) + 1 }, { merge: true });
  });
  rememberUnlocked(browserListStore(), uid, fileId);
  forgetAccess();
}

const seen = new Map<string, Promise<UserFile[]>>();
/** The live student files for a section/class/subject. Taken from the copy saved on this device while it is recent (no Firebase reads), otherwise one read per file. */
export function listLiveUserFiles(section = '', cls = '', subject?: string): Promise<UserFile[]> {
  if (!cloudEnabled()) return Promise.resolve([]);
  const key = `${section}/${cls}/${subject ?? ''}`;
  let found = seen.get(key);
  if (!found) {
    found = savedOrLoad<UserFile[]>(browserListStore(), `user/${key}`, async () => {
      const { fs, db } = await reader();
      const filters = [fs.where('status', '==', 'live'), ...(section ? [fs.where('section', '==', section)] : []), ...(cls ? [fs.where('cls', '==', cls)] : []), ...(subject ? [fs.where('subject', '==', subject)] : [])];
      const files: UserFile[] = []; let cursor: unknown;
      while (true) {
        const snap = await fs.getDocs(fs.query(fs.collection(db, 'userFiles'), ...filters, fs.limit(300), ...(cursor ? [fs.startAfter(cursor)] : [])));
        files.push(...snap.docs.map((d) => parseUserFile(d.id, d.data())).filter((f): f is UserFile => f !== null));
        if (snap.docs.length < 300) return files;
        cursor = snap.docs.at(-1);
      }
    }, parseSavedUserFiles).catch((error) => { seen.delete(key); throw error; });
    seen.set(key, found);
  }
  return found;
}
/** Forget the student lists kept in memory and saved on this device, so the next request reads the real ones. */
export const forgetUserFiles = (): void => { seen.clear(); forgetLists(browserListStore(), 'user/'); forgetLists(browserListStore(), 'userfile/'); };
export async function getUserFile(id: string): Promise<UserFile | null> {
  if (!cloudEnabled()) return null;
  try {
    return await savedOrLoad<UserFile | null>(browserListStore(), `userfile/${id}`, async () => {
      const { fs, db } = await reader(); const snap = await fs.getDoc(fs.doc(db, 'userFiles', id)); return snap.exists() ? parseUserFile(id, snap.data()) : null;
    }, (d) => (d && typeof d === 'object' ? parseUserFile(id, d) ?? undefined : undefined), { keep: (f) => f?.status === 'live' });
  } catch { return null; }
}

export function buildUserStore({ fs, db }: Opened): UserStore {
  const part = (id: string, index: number) => fs.doc(db, 'userChunks', id, 'parts', userPartId(index));
  return {
    async createFile(id, entry) { await fs.setDoc(fs.doc(db, 'userFiles', id), entry); },
    async putPart(id, index, bytes) { await fs.setDoc(part(id, index), { data: fs.Bytes.fromUint8Array(bytes) }); },
    async publish(id) { await fs.updateDoc(fs.doc(db, 'userFiles', id), { status: 'live' }); },
    async deleteParts(id, count) { await deleteAllParts(count, (i) => fs.deleteDoc(part(id, i)), async (i) => (await fs.getDoc(part(id, i))).exists()); },
    async deleteFile(id) { await fs.deleteDoc(fs.doc(db, 'userFiles', id)); }
  };
}
async function makeUserStore(): Promise<UserStore> { return buildUserStore(await member()); }

async function allMyFileRecords(uid: string): Promise<UserFile[]> {
  const { fs, db } = await member(); const results: UserFile[] = []; let cursor: unknown;
  while (true) {
    const constraints = [fs.where('uploader', '==', uid), fs.limit(300), ...(cursor ? [fs.startAfter(cursor)] : [])];
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'userFiles'), ...constraints));
    results.push(...snap.docs.map((d) => parseUserFile(d.id, d.data())).filter((f): f is UserFile => f !== null));
    if (snap.docs.length < 300) break;
    cursor = snap.docs.at(-1);
  }
  return results;
}
export async function listMyFiles(uid: string): Promise<UserFile[]> {
  const files = await allMyFileRecords(uid); const stale = staleUploads(files);
  if (stale.length) { const store = await makeUserStore(); for (const file of stale) await deleteUserFile(store, file.id, file.parts).catch(() => {}); }
  const gone = new Set(stale.map((f) => f.id));
  return files.filter((f) => !gone.has(f.id)).sort((a, b) => b.added.localeCompare(a.added));
}

class UploadRefused extends Error { constructor(public code: string, message: string) { super(message); } }
export async function uploadMyFile(uid: string, bytes: Uint8Array, meta: UserMeta, onProgress?: (done: number, total: number) => void): Promise<string> {
  const check = checkUserUpload(meta.name, bytes.length);
  if (!check.ok) throw new UploadRefused('invalid', check.reason);
  if (!looksLikeExt(extOf(meta.name), bytes.subarray(0, 512))) throw new UploadRefused('not-what-it-says', `its content is not a real .${extOf(meta.name)} file`);
  const { fs, db } = await member(); const sha = await sha256Hex(bytes);
  const [dupes, settings] = await Promise.all([
    fs.getDocs(fs.query(fs.collection(db, 'userFiles'), fs.where('sha', '==', sha), fs.where('status', '==', 'live'), fs.limit(1))),
    fs.getDoc(fs.doc(db, 'library', 'settings')).then((snap) => snap.data(), () => undefined)
  ]);
  if (!dupes.empty) throw new UploadRefused('duplicate', 'this document has already been shared. Please upload a different one');
  if (settings?.userUploads === 'closed') throw new UploadRefused('closed', 'uploads are paused right now. Please try again later');
  const [ownerFiles, aggregate] = await Promise.all([
    listCloudFiles(),
    fs.getAggregate(fs.query(fs.collection(db, 'userFiles'), fs.where('status', '==', 'live')), { bytes: fs.sum('size'), files: fs.count() })
  ]);
  const room = checkLibraryRoom(storageUsed(ownerFiles), Number(aggregate.data().bytes) || 0, Number(aggregate.data().files) || 0, bytes.length, STORAGE_LIMIT_BYTES, ENTRY_OVERHEAD_BYTES + 2 * PART_OVERHEAD_BYTES);
  if (!room.ok) throw new UploadRefused('storage-full', room.reason);
  const id = await uploadUserFile(await makeUserStore(), bytes, uid, meta, sha, onProgress);
  forgetAccess(); forgetUserFiles(); return id;
}
export async function removeMyFile(file: UserFile): Promise<void> {
  await deleteUserFile(await makeUserStore(), file.id, file.parts); forgetAccess(); forgetUserFiles();
}
export function memberUploadError(error: unknown): string {
  if (error instanceof UploadRefused) return `This file was not added because ${error.message}.`;
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied') return 'The upload was not allowed. Sign in again and try once more.';
  if (code === 'resource-exhausted') return 'The Library has reached its daily limit. Please try again tomorrow.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'The connection dropped. Check your internet and try again.';
  return 'Something went wrong while uploading. Please try again.';
}
export async function listNotices(uid: string): Promise<Notice[]> {
  const { fs, db } = await member(); const snap = await fs.getDocs(fs.query(fs.collection(db, 'users', uid, 'notices'), fs.limit(50)));
  return parseNotices(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
}
export async function dismissNotice(uid: string, id: string): Promise<void> {
  const { fs, db } = await member(); await fs.deleteDoc(fs.doc(db, 'users', uid, 'notices', id));
}

export async function deleteMyAccount(uid: string): Promise<void> {
  const { app, fs, db } = await member();
  const { getAuth, GoogleAuthProvider, reauthenticateWithPopup, deleteUser } = await import('firebase/auth');
  const authUser = getAuth(app).currentUser;
  if (!authUser || authUser.uid !== uid) throw Object.assign(new Error('The signed-in account changed.'), { code: 'auth/user-mismatch' });
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  await reauthenticateWithPopup(authUser, provider);

  const store = await makeUserStore();
  for (const file of await allMyFileRecords(uid)) await deleteUserFile(store, file.id, file.parts);
  for (const sub of ['unlocked', 'notices']) {
    const docs = await fs.getDocs(fs.collection(db, 'users', uid, sub));
    for (const doc of docs.docs) await fs.deleteDoc(doc.ref);
  }
  await fs.deleteDoc(fs.doc(db, 'users', uid));
  await deleteUser(authUser);
  forgetUnlocked(browserListStore(), uid);
  forgetAccess(); forgetUserFiles();
}
