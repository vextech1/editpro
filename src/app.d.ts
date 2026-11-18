// State a page can keep in the browser's history without changing its address (SvelteKit shallow routing).
declare global {
  namespace App {
    interface PageState {
      /** The Library file page is in full-screen reading mode, so the phone's Back button leaves reading, not the page. */
      reading?: boolean;
    }
  }
}
export {};