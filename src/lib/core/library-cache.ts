// The last Library list that loaded, kept on the device so a student with a poor connection still sees what is there
// instead of an empty page. Read back through the same checks as the live data: a damaged or old copy just reads as "nothing saved".
import { parseCloudIndex, type CloudFile } from './cloud-library.ts';
import { parseLibraryStructure, type LibraryStructure } from './library-structure.ts';

export interface LibraryData { files: CloudFile[]; structure: LibraryStructure }

export function encodeLibraryCache(d: LibraryData): string {
  return JSON.stringify({ v: 1, files: Object.fromEntries(d.files.map(({ id, ...entry }) => [id, entry])), sections: d.structure });
}
export function decodeLibraryCache(raw: string | null | undefined): LibraryData | undefined {
  try {
    const j = JSON.parse(raw ?? '');
    if (!j || j.v !== 1) return undefined;
    return { files: parseCloudIndex({ files: j.files }), structure: parseLibraryStructure({ sections: j.sections }) };
  } catch { return undefined; }
}

export interface Catalog extends LibraryData { partial: boolean }
/** The catalog as kept by list-cache (files as a list, structure as the section array). Anything invalid reads as "nothing saved". */
export function parseSavedCatalog(d: unknown): Catalog | undefined {
  const j = d as { files?: unknown; structure?: unknown } | null;
  if (!j || !Array.isArray(j.files)) return undefined;
  try {
    const files = parseCloudIndex({ files: Object.fromEntries((j.files as CloudFile[]).map(({ id, ...entry }) => [id, entry])) });
    return { files, structure: parseLibraryStructure({ sections: j.structure }), partial: false };
  } catch { return undefined; }
}
