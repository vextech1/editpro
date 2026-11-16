import { describe, expect, it } from 'vitest';
import { findBySlugs, slugify } from '../src/lib/core/class-library';
import type { LibraryStructure } from '../src/lib/core/library-structure';

const structure: LibraryStructure = [
  { id: 'fsection001', name: 'Medical', classes: [{ id: 'fclass0001', name: 'Gross Anatomy', subjects: [] }] },
  { id: 'fsection002', name: "O'Level", classes: [] },
  { id: 'fsection003', name: 'Matemáticas', classes: [] },
  { id: 'fsection004', name: 'الرياضيات', classes: [{ id: 'fclass0004', name: 'السنة الأولى', subjects: [] }] },
  { id: 'fsection005', name: '१२ कक्षा', classes: [] },
  { id: 'fsection006', name: '???', classes: [] }
];

describe('slugify keeps real names usable', () => {
  it('ignores accents, so the plain-letter link matches', () => { expect(slugify('Matemáticas')).toBe('matematicas'); expect(slugify('Café Français')).toBe('cafe-francais'); });
  it('keeps letters of other alphabets instead of producing an empty slug', () => {
    expect(slugify('الرياضيات')).not.toBe(''); expect(slugify('१२ कक्षा')).toMatch(/-/); expect(slugify('数学 一年级')).toBe('数学-一年级');
  });
  it('still reduces punctuation and spacing the way the first version did', () => {
    expect(slugify('Secondary School')).toBe('secondary-school'); expect(slugify("O'Level")).toBe('o-level'); expect(slugify('  Gross  Anatomy  ')).toBe('gross-anatomy');
    expect(slugify('???')).toBe(''); expect(slugify('')).toBe('');
  });
  it('gives the same slug for the same name however it was typed', () => expect(slugify('MEDICAL')).toBe(slugify('medical')));
});

describe('findBySlugs is as forgiving as it says', () => {
  it('finds a section whatever the case or stray hyphens of the link', () => {
    for (const link of ['medical', 'Medical', 'MEDICAL', 'medical-', '-medical', 'medical--']) expect(findBySlugs(structure, link)).toEqual({ section: 'fsection001', cls: '' });
  });
  it('finds the class with a capitalised link too', () => expect(findBySlugs(structure, 'MEDICAL', 'Gross-Anatomy')).toEqual({ section: 'fsection001', cls: 'fclass0001' }));
  it("finds a name with an apostrophe from the decoded link", () => expect(findBySlugs(structure, "O'Level")).toEqual({ section: 'fsection002', cls: '' }));
  it('finds an accented name from the plain-letter link', () => expect(findBySlugs(structure, 'matematicas')).toEqual({ section: 'fsection003', cls: '' }));
  it('finds names in other alphabets', () => {
    expect(findBySlugs(structure, 'الرياضيات')).toEqual({ section: 'fsection004', cls: '' });
    expect(findBySlugs(structure, 'الرياضيات', 'السنة-الأولى')).toEqual({ section: 'fsection004', cls: 'fclass0004' });
    expect(findBySlugs(structure, slugify('१२ कक्षा'))).toEqual({ section: 'fsection005', cls: '' });
  });
  it('never matches a link that is only symbols, even a section whose name is only symbols', () => {
    for (const link of ['', '-', '---', '???']) expect(findBySlugs(structure, link)).toBeUndefined();
  });
  it('treats a class link made only of symbols as no class', () => expect(findBySlugs(structure, 'medical', '---')).toEqual({ section: 'fsection001', cls: '' }));
  it('keeps the first-version behaviour: unknown class falls back to the section, unknown section finds nothing', () => {
    expect(findBySlugs(structure, 'medical', 'zoology')).toEqual({ section: 'fsection001', cls: '' }); expect(findBySlugs(structure, 'law')).toBeUndefined();
  });
});
