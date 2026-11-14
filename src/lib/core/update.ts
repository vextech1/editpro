// "A new version is ready" detection for the service worker. Framework-free so it can be tested with fakes.
export interface WorkerLike { state: string; addEventListener(type: 'statechange', fn: () => void): void }
export interface RegistrationLike {
  waiting: unknown | null | undefined;
  installing: WorkerLike | null | undefined;
  addEventListener(type: 'updatefound', fn: () => void): void;
}
/**
 * Calls `ready` when a new version has finished installing and is waiting to take over.
 * `hasController` is false on a person's very first visit: that install is not an update, so it never asks.
 */
export function watchForUpdate(reg: RegistrationLike, hasController: () => boolean, ready: () => void) {
  if (reg.waiting && hasController()) ready();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing; if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'installed' && hasController()) ready(); });
  });
}
/** The message the page sends a waiting worker to tell it to take over now. */
export const SKIP_WAITING = 'SKIP_WAITING';
/** How often an open app checks for a newer version, besides when it comes back to the front. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;
