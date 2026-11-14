export interface LibrarySubject { id: string; name: string }
export interface LibraryClass { id: string; name: string; subjects: LibrarySubject[] }
export interface LibrarySection { id: string; name: string; classes: LibraryClass[] }
export type LibraryStructure = LibrarySection[];

const ID = /^f[a-z0-9]{8,32}$/;
const BAD_NAME = /[#?%/\\]/;

export function newLibraryId(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  return 'f' + [...random(10)].map((byte) => byte.toString(36).padStart(2, '0').slice(-2)).join('').slice(0, 16);
}

export function parseLibraryStructure(data: unknown): LibraryStructure {
  const sections = (data as { sections?: unknown } | null | undefined)?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((rawSection) => {
    if (!rawSection || typeof rawSection !== 'object') return [];
    const section = rawSection as Partial<LibrarySection>;
    if (!validEntity(section)) return [];
    const classes = Array.isArray(section.classes) ? section.classes.flatMap((rawClass) => {
      if (!rawClass || typeof rawClass !== 'object') return [];
      const cls = rawClass as Partial<LibraryClass>;
      if (!validEntity(cls)) return [];
      const subjects = Array.isArray(cls.subjects) ? cls.subjects.flatMap((rawSubject) => {
        if (!rawSubject || typeof rawSubject !== 'object') return [];
        const subject = rawSubject as Partial<LibrarySubject>;
        return validEntity(subject) ? [{ id: subject.id!, name: subject.name!.trim() }] : [];
      }) : [];
      return [{ id: cls.id!, name: cls.name!.trim(), subjects }];
    }) : [];
    return [{ id: section.id!, name: section.name!.trim(), classes }];
  });
}

function validEntity<T extends { id?: unknown; name?: unknown }>(entity: T): entity is T & { id: string; name: string } {
  return typeof entity.id === 'string' && ID.test(entity.id)
    && typeof entity.name === 'string' && !!entity.name.trim() && entity.name.trim().length <= 80 && !BAD_NAME.test(entity.name);
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Enter a name.');
  if (name.length > 80) throw new Error('Names must be 80 characters or fewer.');
  if (BAD_NAME.test(name)) throw new Error('Names cannot contain #, ?, %, / or \\.');
  return name;
}

function uniqueName(items: { id: string; name: string }[], name: string, exceptId?: string): void {
  if (items.some((item) => item.id !== exceptId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error(`“${name}” already exists here.`);
  }
}

function mapSection(structure: LibraryStructure, sectionId: string, update: (section: LibrarySection) => LibrarySection): LibraryStructure {
  let found = false;
  const result = structure.map((section) => {
    if (section.id !== sectionId) return section;
    found = true;
    return update(section);
  });
  if (!found) throw new Error('Choose a section first.');
  return result;
}

function mapClass(structure: LibraryStructure, sectionId: string, classId: string, update: (cls: LibraryClass) => LibraryClass): LibraryStructure {
  return mapSection(structure, sectionId, (section) => {
    let found = false;
    const classes = section.classes.map((cls) => {
      if (cls.id !== classId) return cls;
      found = true;
      return update(cls);
    });
    if (!found) throw new Error('Choose a class first.');
    return { ...section, classes };
  });
}

export function addSection(structure: LibraryStructure, value: string, id = newLibraryId()): LibraryStructure {
  const name = cleanName(value);
  uniqueName(structure, name);
  return [...structure, { id, name, classes: [] }];
}

export function renameSection(structure: LibraryStructure, id: string, value: string): LibraryStructure {
  const name = cleanName(value);
  uniqueName(structure, name, id);
  return mapSection(structure, id, (section) => ({ ...section, name }));
}

export function deleteSection(structure: LibraryStructure, id: string): LibraryStructure {
  if (!structure.some((section) => section.id === id)) throw new Error('Choose a section first.');
  return structure.filter((section) => section.id !== id);
}

export function addClass(structure: LibraryStructure, sectionId: string, value: string, id = newLibraryId()): LibraryStructure {
  const name = cleanName(value);
  return mapSection(structure, sectionId, (section) => {
    uniqueName(section.classes, name);
    return { ...section, classes: [...section.classes, { id, name, subjects: [] }] };
  });
}

export function renameClass(structure: LibraryStructure, sectionId: string, id: string, value: string): LibraryStructure {
  const name = cleanName(value);
  return mapSection(structure, sectionId, (section) => {
    if (!section.classes.some((cls) => cls.id === id)) throw new Error('Choose a class first.');
    uniqueName(section.classes, name, id);
    return { ...section, classes: section.classes.map((cls) => cls.id === id ? { ...cls, name } : cls) };
  });
}

export function deleteClass(structure: LibraryStructure, sectionId: string, id: string): LibraryStructure {
  return mapSection(structure, sectionId, (section) => {
    if (!section.classes.some((cls) => cls.id === id)) throw new Error('Choose a class first.');
    return { ...section, classes: section.classes.filter((cls) => cls.id !== id) };
  });
}

export function addSubject(structure: LibraryStructure, sectionId: string, classId: string, value: string, id = newLibraryId()): LibraryStructure {
  const name = cleanName(value);
  return mapClass(structure, sectionId, classId, (cls) => {
    uniqueName(cls.subjects, name);
    return { ...cls, subjects: [...cls.subjects, { id, name }] };
  });
}

export function renameSubject(structure: LibraryStructure, sectionId: string, classId: string, id: string, value: string): LibraryStructure {
  const name = cleanName(value);
  return mapClass(structure, sectionId, classId, (cls) => {
    uniqueName(cls.subjects, name, id);
    if (!cls.subjects.some((subject) => subject.id === id)) throw new Error('Choose a subject first.');
    return { ...cls, subjects: cls.subjects.map((subject) => subject.id === id ? { ...subject, name } : subject) };
  });
}

export function deleteSubject(structure: LibraryStructure, sectionId: string, classId: string, id: string): LibraryStructure {
  return mapClass(structure, sectionId, classId, (cls) => {
    if (!cls.subjects.some((subject) => subject.id === id)) throw new Error('Choose a subject first.');
    return { ...cls, subjects: cls.subjects.filter((subject) => subject.id !== id) };
  });
}