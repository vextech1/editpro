// Who may download what. The Library is a collection of study documents that students share:
//   * Everyone's first download is free, with no account.
//   * After that a person signs in with Google and uploads a study document. Each upload unlocks DOWNLOADS_PER_UPLOAD more downloads.
//   * Everything else on the site stays free, with or without an account. Only Library downloads are counted.
// This is the logic only (no browser, no Firebase). It decides; #lib/cloud/user.ts reads and writes the numbers.
//
// Honest limit: this is a rule of the website, applied by the website. The Library's files can be read by anyone who talks to the database
// directly, so a determined person can get around it. That is acceptable for a sharing scheme, and it can be hardened later (see firestore.rules).

export const FREE_DOWNLOADS = 1;
export const DOWNLOADS_PER_UPLOAD = 3;

/** How many more downloads an account has: each of its live uploads gives DOWNLOADS_PER_UPLOAD, and each download takes one. Never below 0. */
export const creditsLeft = (liveUploads: number, used: number): number => Math.max(0, DOWNLOADS_PER_UPLOAD * Math.max(0, liveUploads) - Math.max(0, used));

// ---- the free download, remembered on this device ----
export const FREE_KEY = 'editpro-free-download';
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** The id of the file this device downloaded for free, or null if it has not used its free download. */
export function freeFileId(store: KeyValueStore | null): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(FREE_KEY); if (!raw) return null;
    const id = (JSON.parse(raw) as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  } catch { return null; }
}
export function markFreeUsed(store: KeyValueStore | null, fileId: string, now = Date.now()): void {
  if (!store || freeFileId(store)) return;
  try { store.setItem(FREE_KEY, JSON.stringify({ id: fileId, at: now })); } catch { /* storage unavailable: the free download is simply not remembered */ }
}

export type Access = 'own' | 'free' | 'unlocked' | 'credit' | 'sign-in' | 'upload';
export interface AccessInput {
  fileId: string;
  free: string | null;
  own: boolean;
  signedIn: boolean;
  unlocked: boolean;
  liveUploads: number;
  used: number;
}
export interface AccessDecision { access: Access; left: number }

/** What happens when someone asks for a file. 'credit' and 'free' mean the file is allowed and the caller must record it. */
export function decideAccess(i: AccessInput): AccessDecision {
  const left = i.signedIn ? creditsLeft(i.liveUploads, i.used) : 0;
  if (i.own) return { access: 'own', left };
  if (i.free === i.fileId) return { access: 'free', left };
  if (i.signedIn && i.unlocked) return { access: 'unlocked', left };
  if (i.free === null) return { access: 'free', left };
  if (!i.signedIn) return { access: 'sign-in', left };
  return left > 0 ? { access: 'credit', left } : { access: 'upload', left };
}

export const isAllowed = (a: Access): boolean => a === 'own' || a === 'free' || a === 'unlocked' || a === 'credit';

export interface GateCopy { title: string; body: string; action: string }
export function gateCopy(access: 'sign-in' | 'upload'): GateCopy {
  if (access === 'sign-in') return {
    title: 'Sign in to keep downloading',
    body: `Your first download was free. To download more, sign in with Google and share one study document: every document you upload unlocks ${DOWNLOADS_PER_UPLOAD} more downloads. All other tools on this site stay free, with or without an account.`,
    action: 'Sign in with Google'
  };
  return {
    title: 'Upload a study document to download more',
    body: `This Library grows because students share. Upload one study document (notes, an assignment or a past paper) and you unlock ${DOWNLOADS_PER_UPLOAD} more downloads. All other tools on this site stay free.`,
    action: 'Upload a document'
  };
}

export const creditsText = (left: number): string => left === 1 ? '1 download left' : `${left} downloads left`;

export interface Notice { id: string; kind: 'pulled'; title: string; reason: string; at: string }
export const MAX_REASON = 500;
export function parseNotices(docs: { id: string; data: unknown }[]): Notice[] {
  const out: Notice[] = [];
  for (const { id, data } of docs) {
    const d = data as Partial<Record<keyof Notice, unknown>> | null;
    if (!d || typeof d !== 'object' || d.kind !== 'pulled' || typeof d.reason !== 'string' || !d.reason.trim()) continue;
    out.push({ id, kind: 'pulled', title: typeof d.title === 'string' ? d.title.slice(0, 120) : 'A file', reason: d.reason.slice(0, MAX_REASON), at: typeof d.at === 'string' ? d.at.slice(0, 10) : '' });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
export const pulledNoticeText = (n: Pick<Notice, 'title' | 'reason'>): string => `“${n.title}” was removed from the Library. Reason: ${n.reason}`;
