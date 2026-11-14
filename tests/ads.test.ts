import { describe, it, expect } from 'vitest';
import { ADS, adPage } from '#lib/ads.ts';

describe('ads config', () => {
  it('uses https addresses with 32-character unit keys', () => {
    expect(ADS.nativeBanner.src).toMatch(/^https:\/\/[a-z.]+\/\d+\/[0-9a-f]{32}$/);
    expect(ADS.socialBar.src).toMatch(/^https:\/\/[a-z.]+\/\d+\/[0-9a-f]{32}$/);
    expect(ADS.popunder.src).toMatch(/^https:\/\/[a-z.]+\/\d+\/[0-9a-f]{32}$/);
  });
  it('native container id matches its key', () => {
    expect(ADS.nativeBanner.src.endsWith(ADS.nativeBanner.container.replace('container-', ''))).toBe(true);
  });
  it('keeps the pop-under off by default', () => expect(ADS.popunder.enabled).toBe(false));
  it('shows ads on home, tools and tool pages only', () => {
    for (const p of ['/', '/tools', '/tools/merge-pdf']) expect(adPage(p)).toBe(true);
    for (const p of ['/studio/pdf', '/library', '/settings', '/faq', '/privacy']) expect(adPage(p)).toBe(false);
  });
});
