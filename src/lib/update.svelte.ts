// Tells the page when a newer version of the app is waiting, and switches to it when the person agrees.
import { SKIP_WAITING, UPDATE_CHECK_MS, watchForUpdate } from '#lib/core/update.ts';

class UpdateStore {
  available = $state(false);
  private reg?: ServiceWorkerRegistration;
  private started = false;
  private reloading = false;

  async init() {
    if (this.started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    this.started = true;
    try {
      this.reg = await navigator.serviceWorker.ready;
      watchForUpdate(this.reg, () => !!navigator.serviceWorker.controller, () => { this.available = true; });
      // Once the new version takes over, load it so the page and its files match.
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!this.reloading) { this.reloading = true; location.reload(); } });
      const check = () => { void this.reg?.update().catch(() => { /* offline: try again later */ }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, UPDATE_CHECK_MS);
    } catch { /* no service worker here: nothing to update */ }
  }
  /** Ask the waiting version to take over. The page reloads itself when it does. */
  apply() { this.reg?.waiting?.postMessage({ type: SKIP_WAITING }); }
  dismiss() { this.available = false; }
}
export const updateApp = new UpdateStore();
