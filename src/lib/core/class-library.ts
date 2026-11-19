// Shared, browser-safe logic for the Firestore-backed Class Library.
import { SITE, abs } from '#lib/site.ts';
import type { LibraryStructure } from './library-structure.ts';

export type CategoryId = 'notes' | 'assignments' | 'past-papers' | 'other';
export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'past-papers', label: 'Past papers' },
  { id: 'other', label: 'Other' }
];
/** Longest custom label an admin can write. */
export const MAX_LABEL = 40;
/** A typed label with stray spaces removed and its length capped; '' when nothing useful was typed. */
export const cleanLabel = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) : '');
/** The words shown for a file's category. An admin's own label (kept with the 'other' category) wins over the plain name. */
export const categoryLabel = (id: CategoryId, label?: string) => (id === 'other' && cleanLabel(label)) || (CATEGORIES.find((c) => c.id === id)?.label ?? 'Other');
/** One key per chip: the built-in category id, or `other:<label>` for each custom label (case-insensitive). */
export const categoryKey = (f: { category: CategoryId; label?: string }): string => (f.category === 'other' && cleanLabel(f.label) ? `other:${cleanLabel(f.label).toLowerCase()}` : f.category);

/** File types accepted by the Library upload form. */
export const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg'] as const;

/** Attribution and usage information shown on the public file page. */
export interface Credit { by?: string; link?: string; license?: string; note?: string }

export interface ClassFile {
  id: string; name: string; title: string; size: number; ext: string; category: CategoryId;
  /** The admin's own label, used only with the 'other' category. */
  label?: string;
  /** YYYY-MM-DD. */
  added?: string;
  cloud: { id: string; parts: number; user?: boolean };
  /** Link entries point to public files on another site and have no stored pieces. */
  url?: string;
  thumb?: string;
  credit?: Credit;
  uploader?: string;
  student?: boolean;
}

/** "database-systems_week-3.pdf" becomes "Database Systems Week 3". Words with capitals in them are left alone. */
export function titleFromFilename(name: string): string {
  const i = name.lastIndexOf('.');
  const base = (i > 0 ? name.slice(0, i) : name).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.split(' ').map((w) => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

export const extOf = (name: string): string => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
export const isAllowedExt = (ext: string): boolean => (ALLOWED_EXT as readonly string[]).includes(ext);

/** Case-insensitive match on every word typed, against the file title, file name and class name. */
export function filterFiles<T extends { title: string; name: string; category: CategoryId }>(
  files: T[], q: { text?: string; category?: CategoryId | 'all'; extra?: (f: T) => string }
): T[] {
  const words = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return files.filter((f) => {
    if (q.category && q.category !== 'all' && f.category !== q.category) return false;
    const hay = `${f.title} ${f.name} ${q.extra?.(f) ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const countLabel = (n: number): string => `${n} ${n === 1 ? 'file' : 'files'}`;

/** The message a student sends when something is missing. */
export const requestMessage = (what: string, className?: string): string =>
  `Hello! I am a student using the EditPro Class Library. I could not find this material${className ? ` for ${className}` : ''}: ${what.trim() || '[file name or topic]'}`;

export const whatsappLink = (message: string): string => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
export const emailLink = (message: string): string =>
  `mailto:${SITE.contactEmail}?subject=${encodeURIComponent('EditPro Class Library: file request')}&body=${encodeURIComponent(message)}`;

/** A WhatsApp link that lets a student share the Library location containing a file. Used where the device has no share sheet. */
export const shareLink = (title: string, pagePath: string): string =>
  `https://wa.me/?text=${encodeURIComponent(`${title} (EditPro Class Library): ${abs(pagePath)}`)}`;

/** What the device's share sheet is given for a file: any app the student picks (WhatsApp, Telegram, Messages, Copy link...) receives it. */
export const sharePayload = (title: string, pagePath: string) => ({ title, text: `${title} (EditPro Class Library)`, url: abs(pagePath) });
/** `shared`: the sheet took it. `cancelled`: the student closed the sheet. `failed`: the sheet could not open. `unsupported`: this browser has no share sheet. */
export type ShareResult = 'shared' | 'cancelled' | 'failed' | 'unsupported';
type ShareNav = Partial<Pick<Navigator, 'share'>>;
export const canShareNatively = (nav: ShareNav = typeof navigator === 'undefined' ? {} : navigator): boolean => typeof nav.share === 'function';
export async function shareNatively(title: string, pagePath: string, nav: ShareNav = typeof navigator === 'undefined' ? {} : navigator): Promise<ShareResult> {
  if (typeof nav.share !== 'function') return 'unsupported';
  try { await nav.share(sharePayload(title, pagePath)); return 'shared'; }
  catch (e) { return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed'; }
}

/** True when a file was added in the last `days` days. `now` is passed in so the same code gives the same answer in tests. */
export function isRecent(added: string | undefined, now: number, days = 14): boolean {
  if (!added) return false;
  const t = Date.parse(added + 'T00:00:00Z');
  return Number.isFinite(t) && now - t >= 0 && now - t < (days + 1) * 86400000;
}

/** Newest first, then by name with numbers in order ("Week 2" before "Week 10"), so the list does not shuffle between loads. */
export function sortFiles<T extends { title: string; added?: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => (b.added ?? '').localeCompare(a.added ?? '') || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}

/** "2026-11-01" as "1 Nov 2026" (in the visitor's language). Anything that is not a real date reads as nothing. */
export function fmtAdded(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** The Library address for a section, class or subject. Each level is only included when the one above it is. */
export function libraryHref(section = '', cls = '', subject = ''): string {
  const q = new URLSearchParams();
  if (section) q.set('section', section);
  if (section && cls) q.set('class', cls);
  if (section && cls && subject) q.set('subject', subject);
  const s = q.toString();
  return `/class-library${s ? `?${s}` : ''}`;
}

/** "Secondary School" -> "secondary-school", to match a name typed into an old URL. Case, accents ("Matemáticas" -> "matematicas") and
 *  punctuation do not matter, and letters of any alphabet are kept (an Arabic or Hindi name must not turn into an empty slug). */
export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

/** Finds the section (and, if given, the class inside it) whose name slugifies to the given slug(s). Case- and
 *  punctuation-insensitive, so a renamed or re-punctuated section/class can still be found by its old link. */
export function findBySlugs(structure: LibraryStructure, sectionSlug: string, classSlug = ''): { section: string; cls: string } | undefined {
  // The link is normalised the same way as the names, so /Medical, /medical- and /MEDICAL all find "Medical".
  const wantSection = slugify(sectionSlug), wantClass = slugify(classSlug);
  if (!wantSection) return undefined;
  const section = structure.find((s) => slugify(s.name) === wantSection);
  if (!section) return undefined;
  if (!wantClass) return { section: section.id, cls: '' };
  const cls = section.classes.find((c) => slugify(c.name) === wantClass);
  return cls ? { section: section.id, cls: cls.id } : { section: section.id, cls: '' };
}
