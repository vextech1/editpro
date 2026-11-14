// Who may change the Library. The owner's email is written in firestore.rules (it cannot be removed from the website, so nobody can lock
// themselves out). Everyone else is a document in the `admins` collection, one per email, added and removed on the Library admin page,
// so adding a helper needs no rules edit and no redeploy. The Firestore rules do the real checking; this file only tidies emails.
export const ADMINS_COLLECTION = 'admins';
export const MAX_ADMINS = 50;
const EMAIL = /^[^\s@/\\]+@[^\s@/\\]+\.[^\s@/\\]+$/;

/** An email as it is kept: no spaces at the ends, all lower case (the sign-in token and the rules compare it that way). */
export const normalizeEmail = (input: string): string => input.trim().toLowerCase();

export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string };
/** Checks an email typed into the admin page. `existing` are the helpers already added; `owner` is the owner's own email. */
export function checkAdminEmail(input: string, existing: readonly string[] = [], owner = ''): EmailCheck {
  const email = normalizeEmail(input);
  if (!email) return { ok: false, reason: 'Type an email address.' };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, reason: 'That does not look like an email address.' };
  if (owner && email === normalizeEmail(owner)) return { ok: false, reason: 'That is the owner account. It can always make changes.' };
  if (existing.some((e) => normalizeEmail(e) === email)) return { ok: false, reason: 'That email is already an admin.' };
  if (existing.length >= MAX_ADMINS) return { ok: false, reason: `There can be at most ${MAX_ADMINS} admins besides the owner.` };
  return { ok: true, email };
}

/** The saved admin documents' ids, tidied and in alphabetical order. */
export const sortedAdmins = (ids: readonly string[]): string[] => [...new Set(ids.map(normalizeEmail).filter(Boolean))].sort();
