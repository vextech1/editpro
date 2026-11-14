import { describe, it, expect } from 'vitest';
import { watchForUpdate, type RegistrationLike, type WorkerLike } from '../src/lib/core/update';

function worker(state = 'installing') {
  const fns: (() => void)[] = [];
  const w = { state, addEventListener: (_: 'statechange', f: () => void) => void fns.push(f), fire: (s: string) => { w.state = s; fns.forEach((f) => f()); } };
  return w as WorkerLike & { fire(s: string): void };
}
function registration(waiting: unknown = null) {
  const fns: (() => void)[] = [];
  const r = { waiting, installing: null as WorkerLike | null, addEventListener: (_: 'updatefound', f: () => void) => void fns.push(f), found: (w: WorkerLike) => { r.installing = w; fns.forEach((f) => f()); } };
  return r as RegistrationLike & { found(w: WorkerLike): void };
}
describe('update detection', () => {
  it('speaks up when a new version is already waiting', () => {
    let n = 0; watchForUpdate(registration({}), () => true, () => n++); expect(n).toBe(1);
  });
  it('speaks up once a newly found version finishes installing', () => {
    const r = registration(); let n = 0; watchForUpdate(r, () => true, () => n++);
    const w = worker(); r.found(w); expect(n).toBe(0);
    w.fire('installing'); expect(n).toBe(0);
    w.fire('installed'); expect(n).toBe(1);
  });
  it('stays quiet on the first visit, when there is no older version to replace', () => {
    const r = registration({}); let n = 0; watchForUpdate(r, () => false, () => n++);
    const w = worker(); r.found(w); w.fire('installed'); expect(n).toBe(0);
  });
  it('ignores an update that ends in a failure', () => {
    const r = registration(); let n = 0; watchForUpdate(r, () => true, () => n++);
    const w = worker(); r.found(w); w.fire('redundant'); expect(n).toBe(0);
  });
});
