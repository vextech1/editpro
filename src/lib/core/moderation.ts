// Owner-side review of study files contributed by students.
import { MAX_REASON } from '#lib/core/access.ts';
import type { UserFile } from '#lib/core/user-library.ts';

export const REASON_CHOICES = [
  'It is not yours to share: it appears to be copied from a book or someone else’s work.',
  'It is not study material.',
  'It is a duplicate or spam.',
  'It contains content that is not appropriate for students.',
  'The file is damaged or cannot be opened.'
] as const;
export type ReasonCheck = { ok: true; reason: string } | { ok: false; problem: string };
export function checkReason(text: string): ReasonCheck {
  const reason = text.replace(/\s+/g, ' ').trim();
  if (reason.length < 5) return { ok: false, problem: 'Write a reason (at least a few words), so the student knows why it was removed.' };
  if (reason.length > MAX_REASON) return { ok: false, problem: `Keep the reason under ${MAX_REASON} characters.` };
  return { ok: true, reason };
}
export interface NoticeDoc { kind: 'pulled'; title: string; reason: string; at: string }
export const noticeFor = (file: Pick<UserFile, 'title'>, reason: string, now = new Date()): NoticeDoc => ({ kind: 'pulled', title: file.title.slice(0, 120), reason, at: now.toISOString() });
export interface ModerationStore {
  markPulled(file: { id: string; uploader: string }, reason: string, noticeId: string, notice: NoticeDoc): Promise<void>;
  deleteParts(id: string, count: number): Promise<void>;
  markCleaned(id: string): Promise<void>;
  deleteFile(id: string): Promise<void>;
}
export async function pullStudentFile(store: ModerationStore, file: UserFile, reasonText: string, makeNoticeId: () => string, now = new Date()): Promise<{ cleaned: boolean }> {
  const check = checkReason(reasonText);
  if (!check.ok) throw new Error(check.problem);
  if (file.status !== 'live') throw new Error('Only a live file can be pulled.');
  await store.markPulled(file, check.reason, makeNoticeId(), noticeFor(file, check.reason, now));
  return { cleaned: await retryPieces(store, file) };
}
export async function retryPieces(store: ModerationStore, file: Pick<UserFile, 'id' | 'parts'>): Promise<boolean> {
  try { await store.deleteParts(file.id, file.parts); await store.markCleaned(file.id); return true; }
  catch { return false; }
}
export async function deleteRecord(store: ModerationStore, file: Pick<UserFile, 'id' | 'parts'>): Promise<void> {
  await store.deleteParts(file.id, file.parts);
  await store.deleteFile(file.id);
}
export function reportHref(email: string, file: { id: string; title: string }): string {
  const subject = `Report a Library document: ${file.title}`.slice(0, 150);
  const body = `I am reporting this document in the EditPro Library.\nTitle: ${file.title}\nFile ID: ${file.id}\n\nWhy (for example: it copies my work, and here is who I am and where the original is):\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
