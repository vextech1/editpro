// Download saved files as one ZIP: a backup of everything, or just the files that were selected.
import type { Library } from './library.ts';
import { zipFiles } from './zip.ts';

/** The files with these ids as a ZIP. `missing` counts files whose saved bytes could not be found (they are left out). */
export async function zipSaved(lib: Library, ids: string[]): Promise<{ blob: Blob; count: number; missing: number }> {
  const files: { name: string; bytes: Uint8Array }[] = []; let missing = 0;
  for (const id of ids) {
    const f = await lib.file(id);
    if (!f) { missing++; continue; }
    files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return { blob: new Blob([zipFiles(files) as BlobPart], { type: 'application/zip' }), count: files.length, missing };
}

export const backupName = (d = new Date()): string => `editpro-files-${d.toISOString().slice(0, 10)}.zip`;
