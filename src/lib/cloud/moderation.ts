// Owner-side Firebase calls for reviewing student-shared files.
import { adminApp, fetchCloudFile } from '#lib/cloud/firebase.ts';
import { buildUserStore } from '#lib/cloud/user.ts';
import { newFileId } from '#lib/core/cloud-library.ts';
import { deleteRecord, pullStudentFile, retryPieces, type ModerationStore } from '#lib/core/moderation.ts';
import { parseUserFile, type UserFile, type UserFileStatus } from '#lib/core/user-library.ts';

export async function listStudentFiles(status: UserFileStatus): Promise<UserFile[]> {
  const { fs, db } = await adminApp();
  const files: UserFile[] = []; let cursor: unknown;
  while (true) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'userFiles'), fs.where('status', '==', status), fs.limit(200), ...(cursor ? [fs.startAfter(cursor)] : [])));
    files.push(...snap.docs.map((doc) => parseUserFile(doc.id, doc.data())).filter((file): file is UserFile => file !== null));
    if (snap.docs.length < 200) break;
    cursor = snap.docs.at(-1);
  }
  return files.sort((a, b) => b.added.localeCompare(a.added));
}
export async function studentUsage(): Promise<{ bytes: number; count: number }> {
  const { fs, db } = await adminApp();
  const aggregate = await fs.getAggregate(fs.query(fs.collection(db, 'userFiles'), fs.where('status', '==', 'live')), { bytes: fs.sum('size'), files: fs.count() });
  return { bytes: Number(aggregate.data().bytes) || 0, count: Number(aggregate.data().files) || 0 };
}
async function moderationStore(): Promise<ModerationStore> {
  const opened = await adminApp(); const { fs, db } = opened; const userStore = buildUserStore(opened);
  return {
    async markPulled(file, reason, noticeId, notice) {
      const batch = fs.writeBatch(db);
      batch.update(fs.doc(db, 'userFiles', file.id), { status: 'pulled', pulledReason: reason });
      batch.set(fs.doc(db, 'users', file.uploader, 'notices', noticeId), notice);
      await batch.commit();
    },
    deleteParts: userStore.deleteParts,
    async markCleaned(id) { await fs.updateDoc(fs.doc(db, 'userFiles', id), { cleaned: true }); },
    deleteFile: userStore.deleteFile
  };
}
export async function pullFile(file: UserFile, reason: string): Promise<{ cleaned: boolean }> {
  return pullStudentFile(await moderationStore(), file, reason, newFileId);
}
export async function retryFilePieces(file: UserFile): Promise<boolean> { return retryPieces(await moderationStore(), file); }
export async function deleteFileRecord(file: UserFile): Promise<void> { return deleteRecord(await moderationStore(), file); }
export function previewStudentFile(file: UserFile): Promise<Blob> {
  return fetchCloudFile({ name: file.name, ext: file.ext, size: file.size, cloud: { id: file.id, parts: file.parts, user: true } });
}
export async function getUserUploadsOpen(): Promise<boolean> {
  const { fs, db } = await adminApp();
  return (await fs.getDoc(fs.doc(db, 'library', 'settings'))).data()?.userUploads !== 'closed';
}
export async function setUserUploadsOpen(open: boolean): Promise<void> {
  const { fs, db } = await adminApp();
  await fs.setDoc(fs.doc(db, 'library', 'settings'), { userUploads: open ? 'open' : 'closed' }, { merge: true });
}
