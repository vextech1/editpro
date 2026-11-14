// One place for the title and description each page shows to search engines and in link previews.
// The page's own <svelte:head> and the layout's Open Graph tags both read from here, so they always agree.
// Keep titles to about 60 characters and descriptions to about 120-155, or Google cuts them off.
import { SITE } from '#lib/site.ts';
import type { Tool } from '#lib/tools.ts';
import type { Workspace } from '#lib/core/workspaces.ts';

export interface PageMeta { title: string; description: string }

const TAIL = ` | ${SITE.name}`;
const FREE = ' Free, no sign-up.';

/** Hand-written wording for tools whose generated title or description would be too short or too long. */
const toolOverrides: Record<string, Partial<PageMeta>> = {
  'convert-image': { description: 'Convert photos between JPG, PNG and WebP online. Pick one or many images, choose the format and download the results.' + FREE },
  'split-pdf': { description: 'Split a PDF into single pages or page ranges online. Pick the pages you want and download each part or all of them.' + FREE },
  'pdf-to-images': { description: 'Turn every page of a PDF into a JPG or PNG picture online. Choose the format you want, then download your pages.' + FREE },
  'compress-image': { description: 'Compress photos online to make them smaller for sending and storing. Choose the quality and longest side, then download.' + FREE },
  'merge-pdf': { description: 'Merge PDF files into one online. Choose two or more PDFs, put them in the order you want and download the combined file.' + FREE },
  'images-to-pdf': { description: 'Turn images into a single PDF online, one per page. Set the page order and the page size, then create the file.' + FREE },
  'scan-document': { description: 'Scan documents with your phone camera or from photos. Flatten the page, check the corners and save the pages as one clean PDF.' + FREE },
  'resize-image': {
    title: `Resize image (passport, ID, print), free online${TAIL}`,
    description: 'Resize a photo to the exact size you need: passport and ID, forms with a file-size limit, print sizes or social posts.' + FREE
  },
  'watermark-image': { description: 'Add your name, a copyright line or a logo to one photo or a whole batch. Choose the corner or repeat it, then set size and opacity.' + FREE },
  'color-picker': { title: `Photo colour picker and palette, free online${TAIL}` }
};

export function toolMeta(t: Tool): PageMeta {
  const o = toolOverrides[t.slug] ?? {};
  return { title: o.title ?? `${t.title}, free online${TAIL}`, description: o.description ?? `${t.intro}${FREE}` };
}

export function workspaceMeta(w: Workspace): PageMeta {
  return { title: `${w.title}, free online${TAIL}`, description: `${w.intro}${FREE}` };
}

/** Pages that are not generated from the tool list. Keys are paths without a trailing slash. */
export const pageMeta: Record<string, PageMeta> = {
  '/': {
    title: `${SITE.name}: scan, convert, compress and edit documents`,
    description: 'Free document and image tools in your browser: edit PDFs, scan, compress, convert and organize files.'
  },
  '/tools': {
    title: `Free PDF, image and document tools${TAIL}`,
    description: 'Free online PDF, image and document tools that run in your browser: scan, edit, merge, split, compress, convert and extract text. No sign-up.'
  },
  '/faq': {
    title: `FAQ: privacy, offline use and file size${TAIL}`,
    description: 'Answers to common questions about the EditPro website: privacy, saved files, offline use, browsers and file size.'
  },
  '/privacy': {
    title: `Privacy policy${TAIL}`,
    description: 'How EditPro handles files and data in its browser-based tools and public class Library.'
  },
  '/terms': {
    title: `Terms of use${TAIL}`,
    description: 'The terms of use for the EditPro website and its free in-browser PDF, image and document tools. Please read them before you use the site.'
  },
  '/class-library': {
    title: `Library: free class notes and past papers${TAIL}`,
    description: 'Browse and download free class notes, assignments and past papers for your course. No sign-up. Missing a file? Ask for it on WhatsApp or email.'
  },
  '/contact': {
    title: `Contact ${SITE.name}: support and feedback`,
    description: 'How to contact the EditPro team for support, feedback or privacy requests. Tell us which tool and browser you used so we can help faster.'
  }
};

