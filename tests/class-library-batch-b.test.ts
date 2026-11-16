import { describe, it, expect } from 'vitest';
import { fmtAdded } from '../src/lib/core/class-library';
import { downloadErrorMessage } from '../src/lib/core/cloud-library';

describe('fmtAdded', () => {
  it('writes a stored date in words', () => { expect(fmtAdded('2026-11-01')).toMatch(/2026/); expect(fmtAdded('2026-11-01')).not.toContain('2026-11-01'); });
  it('reads nothing for missing, malformed or impossible dates', () => {
    for (const x of [undefined, '', 'yesterday', '2026-02-31', '2026-13-01']) expect(fmtAdded(x)).toBe('');
  });
});
describe('downloadErrorMessage', () => {
  it('explains a missing piece', () => { expect(downloadErrorMessage(new Error('Piece 2 of the file is missing.'))).toMatch(/incomplete/); });
  it('never mentions admin sign-in to a student', () => {
    expect(downloadErrorMessage(Object.assign(new Error('x'), { code: 'permission-denied' }))).not.toMatch(/admin|account|sign/i);
  });
  it('keeps the network and quota messages', () => {
    expect(downloadErrorMessage({ code: 'unavailable' })).toMatch(/internet/);
    expect(downloadErrorMessage({ code: 'resource-exhausted' })).toMatch(/tomorrow/);
    expect(downloadErrorMessage(new Error('boom'))).toMatch(/did not finish/);
  });
});

import { libraryHref } from '../src/lib/core/class-library';
describe('libraryHref', () => {
  it('builds each level and skips levels whose parent is missing', () => {
    expect(libraryHref()).toBe('/class-library');
    expect(libraryHref('fa')).toBe('/class-library?section=fa');
    expect(libraryHref('fa', 'fb', 'fc')).toBe('/class-library?section=fa&class=fb&subject=fc');
    expect(libraryHref('', 'fb', 'fc')).toBe('/class-library');
    expect(libraryHref('fa', '', 'fc')).toBe('/class-library?section=fa');
  });
});
