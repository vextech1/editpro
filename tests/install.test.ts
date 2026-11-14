import { describe, it, expect } from 'vitest';
import { installMode, isIos, wasDismissedRecently, dismissInstall, INSTALL_COOLDOWN_MS, INSTALL_DISMISS_KEY } from '../src/lib/core/install';

function fake(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
}
describe('install mode', () => {
  it('is installed when already running as an app, whatever else is true', () => {
    expect(installMode({ standalone: true, hasPrompt: true, ios: true })).toBe('installed');
  });
  it('uses the browser prompt when there is one', () => expect(installMode({ standalone: false, hasPrompt: true, ios: false })).toBe('prompt'));
  it('explains Add to Home Screen on iOS, which has no prompt', () => expect(installMode({ standalone: false, hasPrompt: false, ios: true })).toBe('ios'));
  it('offers nothing where installing is not possible', () => expect(installMode({ standalone: false, hasPrompt: false, ios: false })).toBe('none'));
});
describe('iOS detection', () => {
  it('spots iPhone and iPad', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);   // iPadOS posing as a Mac
  });
  it('does not mistake a real Mac or Android', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv81', 5)).toBe(false);
  });
});
describe('dismissing the banner', () => {
  it('stays hidden for the cooldown, then returns', () => {
    const s = fake(); const t0 = 1_700_000_000_000;
    expect(wasDismissedRecently(t0, s)).toBe(false);
    dismissInstall(t0, s);
    expect(wasDismissedRecently(t0 + 1000, s)).toBe(true);
    expect(wasDismissedRecently(t0 + INSTALL_COOLDOWN_MS + 1, s)).toBe(false);
  });
  it('ignores junk and works without storage', () => {
    expect(wasDismissedRecently(Date.now(), fake({ [INSTALL_DISMISS_KEY]: 'abc' }))).toBe(false);
    expect(wasDismissedRecently(Date.now(), undefined)).toBe(false);
    expect(() => dismissInstall(Date.now(), undefined)).not.toThrow();
  });
  it('is cleared with the other saved preferences', async () => {
    const { clearPrefs } = await import('../src/lib/core/settings');
    const m = new Map([[INSTALL_DISMISS_KEY, '1']]);
    clearPrefs({ get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k) });
    expect(m.size).toBe(0);
  });
});
