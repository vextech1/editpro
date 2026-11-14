// Shared, browser-safe logic for the Firestore-backed Class Library.
import { SITE, abs } from '#lib/site.ts';

export type CategoryId = 'notes' | 'assignments' | 'past-papers' | 'other';
export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'past-papers', label: 'Past papers' },
  { id: 'other', label: 'Other' }
];
export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';

/** File types accepted by the Library upload form. */
export const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg'] as const;

export interface ClassFile {
  id: string; name: string; title: string; size: number; ext: string; category: CategoryId;
  /** YYYY-MM-DD. */
  added?: string;
  cloud: { id: string; parts: number };
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

/** A WhatsApp link that lets a student share the Library location containing a file. */
export const shareLink = (title: string, pagePath: string): string =>
  `https://wa.me/?text=${encodeURIComponent(`${title} (EditPro Class Library): ${abs(pagePath)}`)}`;

/** True when a file was added in the last `days` days. `now` is passed in so the same code gives the same answer in tests. */
export function isRecent(added: string | undefined, now: number, days = 14): boolean {
  if (!added) return false;
  const t = Date.parse(added + 'T00:00:00Z');
  return Number.isFinite(t) && now - t >= 0 && now - t < (days + 1) * 86400000;
}
