import { describe, it, expect } from 'vitest';
import { sortFiles } from '../src/lib/core/class-library';
import { encodeLibraryCache, decodeLibraryCache } from '../src/lib/core/library-cache';

const f = (id: string, title: string, added = '') => ({ id, title, name: title + '.pdf', size: 10, ext: 'pdf', section: 'fsection001', cls: 'fclass0001', category: 'notes' as const, added, parts: 1 });

describe('sortFiles', () => {
  it('puts the newest first, then orders names with numbers in order', () => {
    const out = sortFiles([{ title: 'Week 10', added: '2026-01-01' }, { title: 'Week 2', added: '2026-01-01' }, { title: 'Old', added: '2025-01-01' }, { title: 'Newest', added: '2026-05-01' }]);
    expect(out.map((x) => x.title)).toEqual(['Newest', 'Week 2', 'Week 10', 'Old']);
  });
  it('does not change the list it is given, and puts undated files last', () => {
    const input = [{ title: 'B' }, { title: 'A', added: '2026-01-01' }];
    expect(sortFiles(input).map((x) => x.title)).toEqual(['A', 'B']);
    expect(input[0].title).toBe('B');
  });
});

describe('saved Library list', () => {
  it('reads back what was saved', () => {
    const data = { files: [f('fabcdefgh1', 'Notes', '2026-01-02')], structure: [{ id: 'fsection001', name: 'Sec', classes: [{ id: 'fclass0001', name: 'Cls', subjects: [{ id: 'fsubject01', name: 'Sub' }] }] }] };
    const back = decodeLibraryCache(encodeLibraryCache(data as never));
    expect(back?.files.map((x) => x.id)).toEqual(['fabcdefgh1']);
    expect(back?.structure[0].classes[0].subjects[0].id).toBe('fsubject01');
  });
  it('treats missing, damaged or old copies as nothing saved', () => {
    expect(decodeLibraryCache(null)).toBeUndefined();
    expect(decodeLibraryCache('{oops')).toBeUndefined();
    expect(decodeLibraryCache(JSON.stringify({ v: 0, files: {}, sections: [] }))).toBeUndefined();
  });
});
