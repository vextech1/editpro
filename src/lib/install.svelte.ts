// Captures the browser's install prompt so an in-app button can use it. Start it once from the root layout.
import { installMode, isIos, type InstallMode } from '#lib/core/install.ts';

interface PromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

class InstallStore {
  private ev = $state<PromptEvent | undefined>();
  private standalone = $state(false);
  private ios = $state(false);
  private started = false;

  mode: InstallMode = $derived(installMode({ standalone: this.standalone, hasPrompt: !!this.ev, ios: this.ios }));

  init() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const check = () => { this.standalone = !!mq?.matches || (navigator as { standalone?: boolean }).standalone === true; };
    check(); mq?.addEventListener?.('change', check);
    this.ios = isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.ev = e as PromptEvent; });
    window.addEventListener('appinstalled', () => { this.ev = undefined; this.standalone = true; });
  }
  /** Shows the browser's install dialog. Returns true if the person accepted. */
  async install(): Promise<boolean> {
    const e = this.ev; if (!e) return false;
    this.ev = undefined;   // the prompt can only be used once
    try { await e.prompt(); return (await e.userChoice).outcome === 'accepted'; } catch { return false; }
  }
}
export const installApp = new InstallStore();
