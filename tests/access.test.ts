import { describe, it, expect } from 'vitest';
import {
  DOWNLOADS_PER_UPLOAD, FREE_KEY, creditsLeft, creditsText, decideAccess, freeFileId, gateCopy, isAllowed, markFreeUsed, parseNotices, pulledNoticeText,
  type AccessInput, type KeyValueStore
} from '../src/lib/core/access';

const mem = (): KeyValueStore & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }; };
const base: AccessInput = { fileId: 'fA', free: null, own: false, signedIn: false, unlocked: false, liveUploads: 0, used: 0 };
const ask = (o: Partial<AccessInput>) => decideAccess({ ...base, ...o });

describe('the free download on this device', () => {
  it('is remembered, and only the first one counts', () => {
    const s = mem(); expect(freeFileId(s)).toBeNull();
    markFreeUsed(s, 'fA', 1); markFreeUsed(s, 'fB', 2);
    expect(freeFileId(s)).toBe('fA');
  });
  it('copes with no storage, broken storage and junk', () => {
    expect(freeFileId(null)).toBeNull(); expect(() => markFreeUsed(null, 'fA')).not.toThrow();
    const broken: KeyValueStore = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    expect(freeFileId(broken)).toBeNull(); expect(() => markFreeUsed(broken, 'fA')).not.toThrow();
    const junk = mem(); junk.setItem(FREE_KEY, '{not json'); expect(freeFileId(junk)).toBeNull();
    junk.setItem(FREE_KEY, JSON.stringify({ id: 5 })); expect(freeFileId(junk)).toBeNull();
  });
});

describe('credits', () => {
  it('give 3 downloads for each live upload, minus the downloads used', () => {
    expect(DOWNLOADS_PER_UPLOAD).toBe(3);
    expect(creditsLeft(0, 0)).toBe(0); expect(creditsLeft(1, 0)).toBe(3); expect(creditsLeft(1, 2)).toBe(1); expect(creditsLeft(2, 3)).toBe(3);
  });
  it('never go below zero, whatever the numbers are (a pulled upload can leave more used than earned)', () => {
    expect(creditsLeft(1, 3)).toBe(0); expect(creditsLeft(0, 5)).toBe(0); expect(creditsLeft(-1, 0)).toBe(0); expect(creditsLeft(1, -4)).toBe(3);
  });
  it('are described in words', () => { expect(creditsText(1)).toBe('1 download left'); expect(creditsText(3)).toBe('3 downloads left'); expect(creditsText(0)).toBe('0 downloads left'); });
});

describe('decideAccess (the whole rule)', () => {
  it('lets anyone, signed in or not, have their first download free', () => {
    expect(ask({}).access).toBe('free'); expect(ask({ signedIn: true }).access).toBe('free');
  });
  it('always lets the free file be opened again', () => { expect(ask({ free: 'fA' }).access).toBe('free'); expect(ask({ free: 'fA', signedIn: true, liveUploads: 0 }).access).toBe('free'); });
  it('asks a visitor who has used the free download to sign in', () => { expect(ask({ free: 'fB' }).access).toBe('sign-in'); });
  it('asks a signed-in person with nothing left to upload a document', () => {
    expect(ask({ free: 'fB', signedIn: true }).access).toBe('upload');
    expect(ask({ free: 'fB', signedIn: true, liveUploads: 1, used: 3 }).access).toBe('upload');
  });
  it('spends a credit for a signed-in person who has one, and says how many are left', () => {
    expect(ask({ free: 'fB', signedIn: true, liveUploads: 1, used: 0 })).toEqual({ access: 'credit', left: 3 });
    expect(ask({ free: 'fB', signedIn: true, liveUploads: 1, used: 2 })).toEqual({ access: 'credit', left: 1 });
  });
  it('charges nothing for a file the account unlocked before, even with no credits', () => {
    expect(ask({ free: 'fB', signedIn: true, unlocked: true, liveUploads: 0, used: 9 }).access).toBe('unlocked');
  });
  it('ignores "unlocked" for someone who is not signed in', () => { expect(ask({ free: 'fB', signedIn: false, unlocked: true }).access).toBe('sign-in'); });
  it('never charges for a person\'s own upload', () => { expect(ask({ free: 'fB', signedIn: true, own: true }).access).toBe('own'); expect(ask({ own: true }).access).toBe('own'); });
  it('says only the outcomes that allow the file are allowed', () => {
    for (const a of ['own', 'free', 'unlocked', 'credit'] as const) expect(isAllowed(a)).toBe(true);
    for (const a of ['sign-in', 'upload'] as const) expect(isAllowed(a)).toBe(false);
  });
  it('plays out the whole story: free, blocked, sign in, upload, three downloads, blocked, upload again', () => {
    const store = mem(); let used = 0; let uploads = 0; let signedIn = false;
    const open = (id: string) => {
      const d = decideAccess({ fileId: id, free: freeFileId(store), own: false, signedIn, unlocked: false, liveUploads: uploads, used });
      if (d.access === 'free') markFreeUsed(store, id); if (d.access === 'credit') used++;
      return d.access;
    };
    expect(open('f1')).toBe('free'); expect(open('f1')).toBe('free'); expect(open('f2')).toBe('sign-in');
    signedIn = true; expect(open('f2')).toBe('upload');
    uploads = 1; expect([open('f2'), open('f3'), open('f4'), open('f5')]).toEqual(['credit', 'credit', 'credit', 'upload']);
    uploads = 2; expect(open('f5')).toBe('credit');
  });
});

describe('gate copy', () => {
  it('explains what to do and that the rest stays free', () => {
    expect(gateCopy('sign-in').action).toMatch(/Google/); expect(gateCopy('sign-in').body).toMatch(/free/);
    expect(gateCopy('upload').action).toMatch(/Upload/); expect(gateCopy('upload').body).toMatch(/3 more downloads/);
  });
});

describe('notices', () => {
  it('reads good notices, newest first, and drops anything else', () => {
    const n = parseNotices([
      { id: 'a', data: { kind: 'pulled', title: 'Old notes', reason: 'Copied from a textbook', at: '2026-11-01' } },
      { id: 'b', data: { kind: 'pulled', title: 'New notes', reason: 'No permission to share', at: '2026-11-10' } },
      { id: 'c', data: { kind: 'other', reason: 'x' } }, { id: 'd', data: { kind: 'pulled', reason: '   ' } }, { id: 'e', data: null }, { id: 'f', data: 'text' }
    ]);
    expect(n.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('shortens long text and fills in a missing title', () => {
    const [n] = parseNotices([{ id: 'x', data: { kind: 'pulled', reason: 'r'.repeat(900), title: 't'.repeat(300), at: '2026-11-10T12:00:00Z' } }]);
    expect(n.reason).toHaveLength(500); expect(n.title).toHaveLength(120); expect(n.at).toBe('2026-11-10');
    expect(parseNotices([{ id: 'y', data: { kind: 'pulled', reason: 'why' } }])[0].title).toBe('A file');
  });
  it('words the message for the person', () => { expect(pulledNoticeText({ title: 'Notes', reason: 'Not yours to share' })).toBe('“Notes” was removed from the Library. Reason: Not yours to share'); });
});