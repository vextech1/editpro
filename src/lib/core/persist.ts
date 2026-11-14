// Asks the browser to keep this site's saved files (work in progress, My Files) instead of clearing them when the device runs low
// on space. Files only live on this device, so this matters. Framework-free so it can be tested with fakes.
export type PersistState = 'persisted' | 'not-persisted' | 'unsupported';
export interface StorageLike { persisted?(): Promise<boolean>; persist?(): Promise<boolean> }
const here = (): StorageLike | undefined => { try { return globalThis.navigator?.storage; } catch { return undefined; } };

/** Whether saved files are already protected. */
export async function persistState(s: StorageLike | undefined = here()): Promise<PersistState> {
  if (!s?.persisted) return 'unsupported';
  try { return (await s.persisted()) ? 'persisted' : 'not-persisted'; } catch { return 'unsupported'; }
}
/** Ask for protection (once already granted, nothing more is asked). Returns where things stand afterwards. */
export async function requestPersist(s: StorageLike | undefined = here()): Promise<PersistState> {
  if (!s?.persist) return 'unsupported';
  try {
    if (s.persisted && (await s.persisted())) return 'persisted';
    return (await s.persist()) ? 'persisted' : 'not-persisted';
  } catch { return 'unsupported'; }
}
