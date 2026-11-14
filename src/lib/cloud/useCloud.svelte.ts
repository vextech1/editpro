// A page's view of the uploaded files: empty until they have loaded, and always empty if uploads are not set up or Firebase is unreachable.
import { getLibraryStructure, listCloudFiles, cloudEnabled } from '#lib/cloud/firebase.ts';
import type { LibraryStructure } from '#lib/core/library-structure.ts';
import type { CloudFile } from '#lib/core/cloud-library.ts';

export function useCloud() {
  const state = $state<{ files: CloudFile[]; structure: LibraryStructure; loaded: boolean }>({ files: [], structure: [], loaded: !cloudEnabled() });
  /** Call from onMount. */
  const load = () => {
    if (!cloudEnabled()) return;
    void Promise.all([listCloudFiles(), getLibraryStructure()]).then(([files, structure]) => {
      state.files = files; state.structure = structure; state.loaded = true;
    });
  };
  return { state, load };
}
