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
