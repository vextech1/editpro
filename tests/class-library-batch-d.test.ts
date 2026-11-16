import { describe, it, expect } from 'vitest';
import { slugify, findBySlugs } from '../src/lib/core/class-library';
import type { LibraryStructure } from '../src/lib/core/library-structure';

const structure: LibraryStructure = [
  { id: 'fsection001', name: 'Medical', classes: [{ id: 'fclass0001', name: 'Gross Anatomy', subjects: [] }] },
  { id: 'fsection002', name: "O'Level", classes: [] }
];

describe('slugify', () => {
  it('matches how a name would appear in a URL', () => {
    expect(slugify('Secondary School')).toBe('secondary-school');
    expect(slugify("O'Level")).toBe('o-level');
    expect(slugify('  Gross  Anatomy  ')).toBe('gross-anatomy');
  });
});

describe('findBySlugs', () => {
  it('finds a section by its current name', () => {
    expect(findBySlugs(structure, 'medical')).toEqual({ section: 'fsection001', cls: '' });
  });
  it('finds a class inside the right section', () => {
    expect(findBySlugs(structure, 'medical', 'gross-anatomy')).toEqual({ section: 'fsection001', cls: 'fclass0001' });
  });
  it('falls back to the section when the class is not found', () => {
    expect(findBySlugs(structure, 'medical', 'zoology')).toEqual({ section: 'fsection001', cls: '' });
  });
  it('returns nothing for a section that no longer exists', () => {
    expect(findBySlugs(structure, 'law')).toBeUndefined();
  });
  it('matches a name with punctuation', () => {
    expect(findBySlugs(structure, 'o-level')).toEqual({ section: 'fsection002', cls: '' });
  });
});
