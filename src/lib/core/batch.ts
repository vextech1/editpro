// Small pure helpers shared by the batch image tools (watermark).
import { EXT } from './download.ts';

const OK = ['image/jpeg', 'image/png', 'image/webp'];
/** The format to save a photo in: the one picked, or ('keep') the photo's own when the browser can write it, else JPG. */
export function outType(inputMime: string, choice: string): string {
  if (choice !== 'keep') return choice;
  return OK.includes(inputMime) ? inputMime : 'image/jpeg';
}
/** "holiday.heic" + "rotated" + image/jpeg → "holiday-rotated.jpg" */
export function outName(name: string, suffix: string, mime: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}-${suffix}.${EXT[mime] ?? 'jpg'}`;
}
