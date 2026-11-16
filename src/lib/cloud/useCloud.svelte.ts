// A page's view of the Library's data (uploaded files and the section > class > subject catalog).
//   loaded:  there is a list to show (fresh, or the copy saved on this device)
//   failed:  nothing could be loaded and there is no saved copy: say so, do not pretend the Library is empty
//   stale:   'saved' = showing the copy kept on this device because the latest list could not be fetched; 'partial' = some files could not be read
// If uploads are not set up, it is loaded and empty from the start.
import { loadLibraryData, cloudEnabled } from '#lib/cloud/firebase.ts';
import { decodeLibraryCache, encodeLibraryCache } from '#lib/core/library-cache.ts';
import type { LibraryStructure } from '#lib/core/library-structure.ts';
import type { CloudFile } from '#lib/core/cloud-library.ts';

const CACHE_KEY = 'editpro.library.v1';
/** After this long without an answer, a first visit shows "could not load" instead of waiting for ever. A late answer is still used. */
const SLOW_MS = 15_000;

export function useCloud() {
  const state = $state<{ files: CloudFile[]; structure: LibraryStructure; loaded: boolean; failed: boolean; stale: '' | 'saved' | 'partial' }>(
    { files: [], structure: [], loaded: !cloudEnabled(), failed: false, stale: '' });
  /** Call from onMount. Call again to retry. */
  const load = () => {
    if (!cloudEnabled()) return;
    state.failed = false;
    if (!state.loaded) {
      let saved; try { saved = decodeLibraryCache(localStorage.getItem(CACHE_KEY)); } catch { /* storage unavailable */ }
      if (saved) { state.files = saved.files; state.structure = saved.structure; state.loaded = true; state.stale = 'saved'; }
    }
    const slow = setTimeout(() => { if (!state.loaded) state.failed = true; }, SLOW_MS);
    loadLibraryData().then((d) => {
      state.files = d.files; state.structure = d.structure; state.loaded = true; state.failed = false; state.stale = d.partial ? 'partial' : '';
      if (!d.partial) { try { localStorage.setItem(CACHE_KEY, encodeLibraryCache(d)); } catch { /* optional */ } }
    }).catch(() => { if (state.loaded) state.stale ||= 'saved'; else state.failed = true; }).finally(() => clearTimeout(slow));
  };
  return { state, load };
}
