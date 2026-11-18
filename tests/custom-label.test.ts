import { describe, expect, it } from 'vitest';
import { categoryKey, categoryLabel, cleanLabel, MAX_LABEL } from '#lib/core/class-library.ts';
import { parseCloudIndex, toClassFile } from '#lib/core/cloud-library.ts';

const entry = (over: Record<string, unknown> = {}) => ({
  name: 'a.pdf', title: 'A', size: 10, ext: 'pdf', section: 's', cls: 'c', subject: 'x', category: 'other', added: '2026-01-02', parts: 1, ...over
});
const parse = (e: Record<string, unknown>) => parseCloudIndex({ files: { f0000000000000001: e } });

describe('custom category labels', () => {
  it('cleans typed labels', () => {
    expect(cleanLabel('  Lab   manuals ')).toBe('Lab manuals');
    expect(cleanLabel('x'.repeat(100))).toHaveLength(MAX_LABEL);
    expect(cleanLabel(undefined)).toBe('');
  });
  it('shows the custom label only for the other category', () => {
    expect(categoryLabel('other', 'Lab manuals')).toBe('Lab manuals');
    expect(categoryLabel('other')).toBe('Other');
    expect(categoryLabel('notes', 'Lab manuals')).toBe('Notes');
  });
  it('groups labels without regard to capitals', () => {
    expect(categoryKey({ category: 'other', label: 'Lab Manuals' })).toBe(categoryKey({ category: 'other', label: ' lab manuals' }));
    expect(categoryKey({ category: 'other' })).toBe('other');
    expect(categoryKey({ category: 'notes' })).toBe('notes');
  });
  it('keeps a label from the index and passes it to the file', () => {
    const [f] = parse(entry({ label: ' Lab manuals ' }));
    expect(f.label).toBe('Lab manuals');
    expect(toClassFile(f).label).toBe('Lab manuals');
  });
  it('drops a label that does not belong', () => {
    expect(parse(entry({ category: 'notes', label: 'Sneaky' }))[0].label).toBeUndefined();
    expect(parse(entry({ label: 42 }))[0].label).toBeUndefined();
    expect(parse(entry())[0].label).toBeUndefined();
  });
});

import { buildUserEntry, parseUserFile, toUserClassFile } from '#lib/core/user-library.ts';
import { relabelCloud, type CloudFile, type CloudStore } from '#lib/core/cloud-library.ts';

describe('student labels', () => {
  const meta = { name: 'a.pdf', section: 's', cls: 'c', subject: 'x' };
  it('stores a label only with the other category', () => {
    expect(buildUserEntry('u', { ...meta, category: 'other', label: ' Lab  manuals ' }, 20000, 1, undefined).label).toBe('Lab manuals');
    expect(buildUserEntry('u', { ...meta, category: 'notes', label: 'Sneaky' }, 20000, 1, undefined).label).toBeUndefined();
  });
  it('reads it back and shows it to other students', () => {
    const e = buildUserEntry('u', { ...meta, category: 'other', label: 'Lab manuals' }, 20000, 1, undefined);
    const f = parseUserFile('f0000000000000001', { ...e, status: 'live' });
    expect(f?.label).toBe('Lab manuals');
    expect(toUserClassFile(f!).label).toBe('Lab manuals');
  });
});

describe('relabelCloud', () => {
  const file = (id: string, over: Partial<CloudFile> = {}): CloudFile => ({
    id, name: id + '.pdf', title: id, size: 10, ext: 'pdf', section: 's', cls: 'c', subject: 'x', category: 'notes', added: '2026-01-02', parts: 1, shard: 1, ...over
  });
  it('asks the store to change only the label, per index document', async () => {
    const calls: { items: { id: string; shard: number }[]; label: string }[] = [];
    const store = { relabelEntries: async (items: { id: string; shard: number }[], label: string) => { calls.push({ items, label }); } } as unknown as CloudStore;
    await relabelCloud(store, [file('f1'), file('f2', { category: 'other', label: 'Old', shard: 0 })], '  Lab   manuals ');
    expect(calls).toEqual([{ items: [{ id: 'f1', shard: 1 }, { id: 'f2', shard: 0 }], label: 'Lab manuals' }]);
  });
  it('refuses an empty label', async () => {
    await expect(relabelCloud({} as CloudStore, [file('f1')], '   ')).rejects.toThrow();
  });
});
