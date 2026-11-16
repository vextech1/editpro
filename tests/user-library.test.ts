import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES } from '../src/lib/core/cloud-library';
import { checkUserUpload, looksLikeExt, parseUserFile, uploadUserFile, type UserFileEntry, type UserStore } from '../src/lib/core/user-library';

const pdf = (size: number) => { const bytes = new Uint8Array(size).fill(32); bytes.set([0x25, 0x50, 0x44, 0x46]); return bytes; };
const meta = { name: 'notes.pdf', section: 'section', cls: 'class', subject: 'subject', category: 'notes' as const };
function memory(failAt = -1) {
  const files = new Map<string, UserFileEntry>(); const parts = new Map<string, Uint8Array>(); const calls: string[] = [];
  const store: UserStore = {
    async createFile(id, entry) { files.set(id, entry); calls.push('create'); },
    async putPart(id, index, bytes) { calls.push(`part-${index}`); if (index === failAt) throw new Error('upload interrupted'); parts.set(`${id}/${index}`, bytes); },
    async publish(id) { files.get(id)!.status = 'live'; calls.push('publish'); },
    async deleteParts(id, count) { for (let i = 0; i < count; i++) parts.delete(`${id}/${i}`); calls.push('delete-parts'); },
    async deleteFile(id) { files.delete(id); calls.push('delete-file'); }
  };
  return { store, files, parts, calls };
}

describe('student file uploads', () => {
  it('validates document types, size and signature', () => {
    expect(checkUserUpload('notes.pdf', 20_000).ok).toBe(true);
    expect(checkUserUpload('app.exe', 20_000).ok).toBe(false);
    expect(checkUserUpload('notes.pdf', 100).ok).toBe(false);
    expect(looksLikeExt('pdf', pdf(20_000))).toBe(true);
    expect(looksLikeExt('pdf', new TextEncoder().encode('not a pdf'))).toBe(false);
  });
  it('creates metadata, writes all parts, then publishes', async () => {
    const m = memory();
    const id = await uploadUserFile(m.store, pdf(CHUNK_BYTES + 100), 'uid', meta, 'a'.repeat(64), undefined, () => 'fabcdefgh123');
    expect(m.calls).toEqual(['create', 'part-0', 'part-1', 'publish']);
    expect(m.files.get(id)).toMatchObject({ uploader: 'uid', status: 'live', parts: 2, sha: 'a'.repeat(64) });
  });
  it('cleans up an interrupted upload and preserves the original error', async () => {
    const m = memory(1);
    await expect(uploadUserFile(m.store, pdf(CHUNK_BYTES + 100), 'uid', meta, undefined, undefined, () => 'fabcdefgh123')).rejects.toThrow('upload interrupted');
    expect(m.files.size).toBe(0); expect(m.parts.size).toBe(0);
  });
  it('drops malformed public records, including mismatched filename extensions', () => {
    const entry = { uploader: 'uid', title: 'Notes', name: 'notes.pdf', size: 20_000, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '2026-11-16', parts: 1, status: 'live' };
    expect(parseUserFile('fabcdefgh123', entry)?.title).toBe('Notes');
    expect(parseUserFile('fabcdefgh123', { ...entry, name: 'notes.exe' })).toBeNull();
    expect(parseUserFile('invalid', entry)).toBeNull();
  });
});
