// Install-to-home-screen helpers. Pure functions so they can be tested in Node; the browser wiring is in install.svelte.ts.
export const INSTALL_DISMISS_KEY = 'editpro.installDismissedAt';
/** After "Not now" the home banner stays away this long. The Settings row is always available. */
export const INSTALL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'none';
export interface InstallEnv { standalone: boolean; hasPrompt: boolean; ios: boolean }

/** iPhone and iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIos(ua: string, platform = '', touchPoints = 0): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
/** What the install control should do: nothing, run the browser's prompt, or explain Add to Home Screen. */
export function installMode(e: InstallEnv): InstallMode {
  if (e.standalone) return 'installed';
  if (e.hasPrompt) return 'prompt';
  if (e.ios) return 'ios';
  return 'none';
}
export function wasDismissedRecently(now = Date.now(), s: Store | undefined = local()): boolean {
  try { const t = Number(s?.getItem(INSTALL_DISMISS_KEY)); return !!t && now - t < INSTALL_COOLDOWN_MS && now >= t; } catch { return false; }
}
export function dismissInstall(now = Date.now(), s: Store | undefined = local()) { try { s?.setItem(INSTALL_DISMISS_KEY, String(now)); } catch { /* ignore */ } }
