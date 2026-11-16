// The steps taken when someone asks for a Library file, with the browser and Firebase passed in, so the whole flow can be tested.
import { decideAccess, freeFileId, markFreeUsed, type Access, type KeyValueStore } from '#lib/core/access.ts';

export interface AccessDeps {
  store: KeyValueStore | null;
  uid: string | null;
  readState(uid: string, fileId: string): Promise<{ unlocked: boolean; liveUploads: number; used: number }>;
  unlock(uid: string, fileId: string): Promise<void>;
}
export interface FileRef { id: string; uploader?: string }
export type AccessResult = { allowed: true; access: Access; left: number } | { allowed: false; access: 'sign-in' | 'upload'; left: number };

/** Decides and records access before returning; recording failures prevent access. */
export async function resolveAccess(deps: AccessDeps, file: FileRef): Promise<AccessResult> {
  const free = freeFileId(deps.store);
  if (free === file.id) return { allowed: true, access: 'free', left: 0 };
  const own = !!deps.uid && !!file.uploader && file.uploader === deps.uid;
  if (free === null && !own) { markFreeUsed(deps.store, file.id); return { allowed: true, access: 'free', left: 0 }; }
  const state = deps.uid && !own ? await deps.readState(deps.uid, file.id) : { unlocked: false, liveUploads: 0, used: 0 };
  const d = decideAccess({ fileId: file.id, free, own, signedIn: !!deps.uid, unlocked: state.unlocked, liveUploads: state.liveUploads, used: state.used });
  switch (d.access) {
    case 'free': markFreeUsed(deps.store, file.id); return { allowed: true, access: 'free', left: d.left };
    case 'credit': await deps.unlock(deps.uid!, file.id); return { allowed: true, access: 'credit', left: d.left - 1 };
    case 'own': case 'unlocked': return { allowed: true, access: d.access, left: d.left };
    default: return { allowed: false, access: d.access, left: d.left };
  }
}
