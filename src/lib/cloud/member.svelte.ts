// Signed-in student state and the Library download gate.
import { cloudEnabled } from '#lib/cloud/firebase.ts';
import { readAccessState, unlockFile, watchMember, memberSignIn, memberSignOut, type Member } from '#lib/cloud/user.ts';
import { resolveAccess } from '#lib/core/access-flow.ts';

export const member = $state<{ ready: boolean; user: Member | null }>({ ready: !cloudEnabled(), user: null });
const FLAG = 'editpro-member';
const flag = {
  has: () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } },
  set: () => { try { localStorage.setItem(FLAG, '1'); } catch { /* not remembered */ } },
  clear: () => { try { localStorage.removeItem(FLAG); } catch { /* nothing to clear */ } }
};
const store = () => { try { return localStorage; } catch { return null; } };
let started: Promise<void> | undefined;
export function initMember(force = false): Promise<void> {
  if (!cloudEnabled()) { member.ready = true; return Promise.resolve(); }
  if (started) return started;
  if (!force && !flag.has()) { member.ready = true; return Promise.resolve(); }
  started = new Promise<void>((resolve) => {
    let first = true;
    void watchMember((m) => {
      member.user = m; member.ready = true;
      if (m) flag.set(); else flag.clear();
      if (first) { first = false; resolve(); }
    }).catch(() => { member.ready = true; started = undefined; resolve(); });
  });
  return started;
}
export async function signInMember(): Promise<boolean> {
  await initMember(true);
  flag.set();
  try {
    const signedIn = await memberSignIn();
    if (signedIn) member.user = signedIn;
    return !!signedIn;
  } catch (error) {
    if (!member.user) flag.clear();
    throw error;
  }
}
export async function signOutMember(): Promise<void> { await memberSignOut(); member.user = null; flag.clear(); }

export interface GateFile { id: string; title: string; uploader?: string }
export const gate = $state<{ open: boolean; kind: 'sign-in' | 'upload'; reason: 'download' | 'share'; title: string; retry: (() => void) | null }>({ open: false, kind: 'sign-in', reason: 'download', title: '', retry: null });
export const closeGate = (): void => { gate.open = false; gate.retry = null; };
export async function requestAccess(file: GateFile, retry?: () => void): Promise<boolean> {
  if (!cloudEnabled()) return true;
  await initMember();
  const result = await resolveAccess({ store: store(), uid: member.user?.uid ?? null, readState: readAccessState, unlock: unlockFile }, file);
  if (result.allowed) return true;
  gate.kind = result.access; gate.reason = 'download'; gate.title = file.title; gate.retry = retry ?? null; gate.open = true;
  return false;
}
export async function openShare(): Promise<void> {
  await initMember();
  gate.kind = member.user ? 'upload' : 'sign-in'; gate.reason = 'share'; gate.title = ''; gate.retry = member.user ? null : () => void openShare(); gate.open = true;
}
