import { describe, it, expect } from 'vitest';
import { persistState, requestPersist } from '../src/lib/core/persist';

const fake = (granted: boolean, already = false) => { let asked = 0; return { asked: () => asked, persisted: async () => already, persist: async () => { asked++; return granted; } }; };
describe('storage protection', () => {
  it('reports unsupported where the browser has no such API', async () => {
    expect(await persistState({})).toBe('unsupported'); expect(await requestPersist({})).toBe('unsupported'); expect(await requestPersist(undefined)).toBe('unsupported');
  });
  it('reports whether files are already protected', async () => {
    expect(await persistState(fake(true, true))).toBe('persisted'); expect(await persistState(fake(true, false))).toBe('not-persisted');
  });
  it('asks the browser, and reports a yes or a no', async () => {
    expect(await requestPersist(fake(true))).toBe('persisted'); expect(await requestPersist(fake(false))).toBe('not-persisted');
  });
  it('does not ask again once protected', async () => { const s = fake(true, true); expect(await requestPersist(s)).toBe('persisted'); expect(s.asked()).toBe(0); });
  it('treats an error as unsupported instead of failing', async () => {
    const bad = { persisted: async () => { throw new Error('x'); }, persist: async () => { throw new Error('x'); } };
    expect(await persistState(bad)).toBe('unsupported'); expect(await requestPersist(bad)).toBe('unsupported');
  });
});
