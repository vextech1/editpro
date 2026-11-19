import { describe, it, expect } from 'vitest';
import {
  THUMB_MAX_CHARS, addLink, checkLinkUrl, cleanCredit, deleteCloud, deleteTree, entryBytesFor, entryExtraBytes, extFromUrl, isThumbData, linkName,
  parseCloudIndex, storageUsed, titleFromUrl, toClassFile, uploadCloud, type CloudEntry, type CloudFile, type CloudStore, type TrashItem
} from '../src/lib/core/cloud-library';

const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
function recordingStore() {
  const log: string[] = []; const entries = new Map<string, CloudEntry>(); const trash = new Map<string, TrashItem>();
  const store: CloudStore = {
    async putPart(id, i) { log.push(`putPart ${i}`); }, async getPart() { return new Uint8Array(); },
    async deleteParts(id, n) { log.push(`deleteParts ${id} ${n}`); },
    async setEntry(id, entry, shard) { entries.set(id, entry); log.push(`setEntry s${shard}`); },
    async removeEntry(id, shard) { entries.delete(id); log.push(`removeEntry s${shard}`); }, async relabelEntries() {},
    async replaceEntries(add, remove) { entries.set(add.id, add.entry); for (const item of remove) entries.delete(item.id); log.push(`replaceEntries -${remove.length}`); },
    async commitRemoval(files) { for (const file of files) entries.delete(file.id); log.push(`commitRemoval ${files.length}`); },
    async setShardCount(n) { log.push(`shards ${n}`); },
    async markTrash(item) { trash.set(item.id, item); log.push(`markTrash ${item.id}`); },
    async clearTrash(id) { trash.delete(id); log.push(`clearTrash ${id}`); }, async listTrash() { return [...trash.values()]; }
  };
  return { store, log, entries, trash };
}
const where = { section: 's1', cls: 'c1', subject: 'u1', category: 'notes' as const };

describe('checkLinkUrl', () => {
  it('accepts public HTTP(S), upgrades bare hosts and removes fragments', () => {
    expect(checkLinkUrl('https://example.com/a.pdf#page=2')).toEqual({ ok: true, url: 'https://example.com/a.pdf', host: 'example.com' });
    expect(checkLinkUrl(' www.example.org/x.pdf ')).toEqual({ ok: true, url: 'https://www.example.org/x.pdf', host: 'example.org' });
    expect(checkLinkUrl('http://example.com/a').ok).toBe(true);
  });
  it('rejects unsafe or invalid hosts and protocols', () => {
    for (const value of ['', 'a b.com', 'ftp://example.com/a', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@example.com/a',
      'http://localhost/a', 'http://localhost./a', 'http://192.168.1.5/a', 'http://127.0.0.1./a', 'http://10.0.0.1/a', 'http://169.254.169.254/a',
      'http://172.20.0.1/a', 'https://intranet/a', 'https://printer.local/a', 'http://[::1]/a']) expect(checkLinkUrl(value).ok, value).toBe(false);
    expect(checkLinkUrl('https://example.com/' + 'a'.repeat(2100)).ok).toBe(false);
    expect(checkLinkUrl('http://8.8.8.8/a').ok).toBe(true);
    expect(checkLinkUrl('http://172.32.0.1/a').ok).toBe(true);
  });
});

describe('link names, types and titles', () => {
  it('derives an extension, safe stable name and readable title', () => {
    expect(extFromUrl('https://example.com/files/Notes.PDF')).toBe('pdf');
    expect(extFromUrl('https://example.com/view?id=4')).toBe('link');
    const name = linkName('https://www.example.com/a/b%20c.pdf?x=1&y=2');
    expect(name).not.toMatch(/[#?%\\/]/); expect(name.startsWith('.') || name.startsWith('_')).toBe(false);
    expect(linkName('https://www.example.com/a/b%20c.pdf?x=1&y=2')).toBe(name);
    expect(titleFromUrl('https://example.com/files/database-systems_week-3.pdf')).toBe('Database Systems Week 3');
    expect(titleFromUrl('https://www.example.com/12345')).toBe('example.com');
  });
});

describe('credits and thumbnails', () => {
  it('cleans text and keeps only safe source links', () => {
    expect(cleanCredit({ by: ' Dr   Jane Doe ', license: ' CC BY 4.0 ', note: 'Thanks!\r\n\r\n\r\nAgain.' })).toEqual({ by: 'Dr Jane Doe', license: 'CC BY 4.0', note: 'Thanks!\n\nAgain.' });
    expect(cleanCredit({ link: 'https://example.com/paper#x' })).toEqual({ link: 'https://example.com/paper' });
    expect(cleanCredit({ link: 'javascript:alert(1)' })).toBeUndefined();
    expect(cleanCredit({ by: 'x'.repeat(500), note: 'y'.repeat(5000) })!.by).toHaveLength(120);
    expect(cleanCredit({ by: 'x'.repeat(500), note: 'y'.repeat(5000) })!.note).toHaveLength(600);
  });
  it('accepts only small image data URLs', () => {
    expect(isThumbData(THUMB)).toBe(true);
    expect(isThumbData('data:text/html;base64,AAAA')).toBe(false);
    expect(isThumbData('https://example.com/a.png')).toBe(false);
    expect(isThumbData('data:image/jpeg;base64,' + 'A'.repeat(THUMB_MAX_CHARS))).toBe(false);
  });
});

const linkEntry = { name: 'example.com-notes.pdf', title: 'Notes', size: 0, ext: 'pdf', section: 's1', cls: 'c1', category: 'notes', added: '2026-11-18', parts: 0, url: 'https://example.com/notes.pdf' };
describe('parseCloudIndex links', () => {
  const parse = (entry: Record<string, unknown>) => parseCloudIndex({ files: { fabcdefgh12: entry } });
  it('keeps normalized links, thumbnails and credit; rejects malformed link records', () => {
    const [file] = parse({ ...linkEntry, thumb: THUMB, credit: { by: 'Dr Doe', note: 'Thanks' } });
    expect(file).toMatchObject({ url: 'https://example.com/notes.pdf', parts: 0, size: 0, thumb: THUMB, credit: { by: 'Dr Doe', note: 'Thanks' } });
    expect(parse({ ...linkEntry, ext: 'link' })).toHaveLength(1);
    expect(parse({ ...linkEntry, parts: 3 })).toHaveLength(0);
    expect(parse({ ...linkEntry, size: 4 })).toHaveLength(0);
    expect(parse({ ...linkEntry, url: 'javascript:alert(1)' })).toHaveLength(0);
    expect(parse({ ...linkEntry, url: 42 })).toHaveLength(0);
    expect(parse({ ...linkEntry, thumb: 'https://bad.example/p.png', credit: { link: 'javascript:x' } })[0].thumb).toBeUndefined();
  });
  it('continues reading ordinary files and carries link details to ClassFile', () => {
    const uploaded = parse({ name: 'a.pdf', title: 'A', size: 10, ext: 'pdf', section: 's1', cls: 'c1', category: 'notes', added: '2026-11-18', parts: 1 })[0];
    expect(uploaded.url).toBeUndefined();
    const [link] = parse({ ...linkEntry, thumb: THUMB, credit: { by: 'Dr Doe' } });
    expect(toClassFile(link)).toMatchObject({ url: linkEntry.url, thumb: THUMB, credit: { by: 'Dr Doe' }, cloud: { id: 'fabcdefgh12', parts: 0 } });
  });
});

describe('addLink and cleanup', () => {
  it('adds only an index entry and replaces old uploaded files without orphaning their chunks', async () => {
    const first = recordingStore();
    const id = await addLink(first.store, { url: 'https://www.example.com/files/notes.pdf', thumb: THUMB, credit: { by: ' Dr Doe ', note: 'Thanks' }, ...where }, () => 'fnewlink0001');
    expect(id).toBe('fnewlink0001'); expect(first.log).toEqual(['setEntry s0']);
    expect(first.entries.get(id)).toMatchObject({ url: 'https://www.example.com/files/notes.pdf', ext: 'pdf', size: 0, parts: 0, title: 'Notes', thumb: THUMB, credit: { by: 'Dr Doe', note: 'Thanks' } });
    const second = recordingStore();
    await addLink(second.store, { url: 'https://example.com/x.pdf', ...where, shard: 2, shardCount: 2, replaces: [{ id: 'fold', parts: 3, shard: 1 }] }, () => 'fnewlink0002');
    expect(second.log).toEqual(['shards 3', 'markTrash fold', 'replaceEntries -1', 'deleteParts fold 3', 'clearTrash fold']);
  });
  it('refuses invalid links or thumbnails and handles no-chunk deletion correctly', async () => {
    const { store, log } = recordingStore();
    await expect(addLink(store, { url: 'javascript:alert(1)', ...where })).rejects.toThrow();
    await expect(addLink(store, { url: 'https://example.com/a.pdf', thumb: 'https://bad.example/a.png', ...where })).rejects.toThrow();
    expect(log).toEqual([]);
    await deleteCloud(store, 'fnewlink0001', 0, 1);
    expect(log).toEqual(['removeEntry s1']);
  });
  it('does not delete chunks for a link while removing a tree or replacing it with an upload', async () => {
    const { store, log } = recordingStore();
    await deleteTree(store, [{ id: 'flink', parts: 0 }, { id: 'fupload', parts: 2 }], []);
    expect(log).toEqual(['commitRemoval 2', 'deleteParts fupload 2', 'clearTrash fupload']);
    const replacement = recordingStore();
    await uploadCloud(replacement.store, new Uint8Array(10), { name: 'a.pdf', ...where, replaces: [{ id: 'flink', parts: 0 }] }, () => {}, () => 'fupload1');
    expect(replacement.log.filter((line) => line.startsWith('markTrash') || line.startsWith('deleteParts'))).toEqual(['markTrash fupload1']);
  });
  it('counts thumbnails and credits toward index size, not file-byte storage', () => {
    const extra = entryExtraBytes({ url: 'https://example.com/x.pdf', thumb: THUMB, credit: { by: 'Me' } });
    expect(extra).toBeGreaterThan(THUMB.length);
    expect(entryBytesFor('a.pdf', extra)).toBe(entryBytesFor('a.pdf') + extra);
    const link: CloudFile = { id: 'flink12345678', ...linkEntry, thumb: THUMB } as CloudFile;
    expect(storageUsed([link])).toBeLessThan(5000);
  });
});
