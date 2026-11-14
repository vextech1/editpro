import { describe, expect, it } from 'vitest';
import {
  addClass, addSection, addSubject, deleteClass, deleteSection, deleteSubject, newLibraryId, parseLibraryStructure,
  renameClass, renameSection, renameSubject
} from '../src/lib/core/library-structure.ts';

describe('admin-managed Library structure', () => {
  it('starts empty and creates a section, class, and subject', () => {
    const section = addSection([], 'School', 'fsection01');
    const classes = addClass(section, 'fsection01', 'Form 1', 'fclass0001');
    const full = addSubject(classes, 'fsection01', 'fclass0001', 'Mathematics', 'fsubject01');
    expect(full).toEqual([{ id: 'fsection01', name: 'School', classes: [{ id: 'fclass0001', name: 'Form 1', subjects: [{ id: 'fsubject01', name: 'Mathematics' }] }] }]);
  });

  it('renames without changing IDs or children', () => {
    const structure = addSubject(addClass(addSection([], 'School', 'fsection01'), 'fsection01', 'Form 1', 'fclass0001'), 'fsection01', 'fclass0001', 'Math', 'fsubject01');
    const renamed = renameSubject(renameClass(renameSection(structure, 'fsection01', 'Secondary school'), 'fsection01', 'fclass0001', 'Year 1'), 'fsection01', 'fclass0001', 'fsubject01', 'Mathematics');
    expect(renamed[0]).toMatchObject({ id: 'fsection01', name: 'Secondary school' });
    expect(renamed[0].classes[0]).toMatchObject({ id: 'fclass0001', name: 'Year 1' });
    expect(renamed[0].classes[0].subjects[0]).toEqual({ id: 'fsubject01', name: 'Mathematics' });
  });

  it('rejects empty, unsafe, too-long and duplicate sibling names', () => {
    const structure = addSection([], 'School', 'fsection01');
    expect(() => addSection(structure, ' school ', 'fsection02')).toThrow(/already exists/);
    expect(() => addSection(structure, '   ', 'fsection02')).toThrow(/Enter a name/);
    expect(() => addSection(structure, 'School/West', 'fsection02')).toThrow(/cannot contain/);
    expect(() => addSection(structure, 'x'.repeat(81), 'fsection02')).toThrow(/80 characters/);
  });

  it('rejects renaming an unknown class', () => {
    expect(() => renameClass(addSection([], 'School', 'fsection01'), 'fsection01', 'fmissing01', 'Form 1')).toThrow(/Choose a class/);
  });

  it('deletes only the selected branch', () => {
    const structure = addClass(addSection([], 'School', 'fsection01'), 'fsection01', 'Form 1', 'fclass0001');
    const withTwo = addSection(structure, 'College', 'fsection02');
    expect(deleteClass(withTwo, 'fsection01', 'fclass0001')[0].classes).toEqual([]);
    expect(deleteSection(withTwo, 'fsection01').map((section) => section.id)).toEqual(['fsection02']);
    expect(deleteSubject(addSubject(withTwo, 'fsection01', 'fclass0001', 'Math', 'fsubject01'), 'fsection01', 'fclass0001', 'fsubject01')[0].classes[0].subjects).toEqual([]);
  });

  it('parses valid catalog entries and drops malformed entities', () => {
    expect(parseLibraryStructure({ sections: [
      { id: 'fsection01', name: ' School ', classes: [{ id: 'fclass0001', name: 'Form 1', subjects: [{ id: 'fsubject01', name: 'Math' }, { id: 'bad', name: 'Bad' }] }] },
      { id: 'bad', name: 'Ignored', classes: [] }
    ] })).toEqual([{ id: 'fsection01', name: 'School', classes: [{ id: 'fclass0001', name: 'Form 1', subjects: [{ id: 'fsubject01', name: 'Math' }] }] }]);
  });

  it('generates IDs accepted by the parser', () => { expect(newLibraryId()).toMatch(/^f[a-z0-9]{16}$/); });
});