export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB']; let v = n / 1024, i = 0;
  while (v >= 1023.95 && i < units.length - 1) { v /= 1024; i++; }   // 1048575 B reads "1.00 MB", not "1024.0 KB"
  return `${v.toFixed(i === 0 ? 1 : 2)} ${units[i]}`;
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** Scale (w, h) down so the longest side is at most `max` (0 = keep original). Never upscales. */
export function scaleTo(w: number, h: number, max: number): { w: number; h: number } {
  if (!max || Math.max(w, h) <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
