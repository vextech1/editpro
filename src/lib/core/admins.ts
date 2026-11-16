// Who may change the Library besides the owner. The owner's address is fixed in firestore.rules; the owner adds helpers on the Library
// admin page. Each helper is one document in the `libraryAdmins` collection whose id is their (lower-case) email, and firestore.rules lets
// a signed-in, verified account write to the Library when such a document exists for it.

export const ADMINS_COLLECTION = 'libraryAdmins';

/** The form an email is stored and compared in: trimmed and lower-case. Google sign-in gives lower-case addresses. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Whether this looks like a usable email address. A sanity check for typing mistakes, not a deliverability test. */
export const isValidEmail = (email: string): boolean => /^[^\s@/\\]+@[^\s@/\\]+\.[^\s@/\\]+$/.test(normalizeEmail(email)) && normalizeEmail(email).length <= 254;

/** The stored ids as a clean list: normalised, without repeats, in alphabetical order. */
export const sortedAdmins = (ids: string[]): string[] => [...new Set(ids.map(normalizeEmail).filter(Boolean))].sort((a, b) => a.localeCompare(b));
