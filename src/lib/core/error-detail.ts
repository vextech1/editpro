/** The exact error behind a failure, for the owner-only admin screens: its code and its message, as Firebase or the browser gave them.
 *  Example: "permission-denied: Missing or insufficient permissions." Never returns an empty string. */
export function errorDetail(e: unknown): string {
  const err = (typeof e === 'object' && e !== null ? e : {}) as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof err.code === 'string' && err.code ? err.code : '';
  const name = typeof err.name === 'string' && err.name && err.name !== 'Error' && err.name !== 'FirebaseError' ? err.name : '';
  const message = typeof err.message === 'string' ? err.message.trim() : typeof e === 'string' ? e.trim() : '';
  const label = code || name;
  if (label && message) return `${label}: ${message}`;
  return label || message || 'No error details were given.';
}

/** A plain sentence followed by the exact error, so the owner sees both what happened and why. */
export function withDetail(sentence: string, e: unknown): string {
  return `${sentence} Error: ${errorDetail(e)}`;
}
