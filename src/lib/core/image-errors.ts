// Explain common image-loading failures in terms people can act on.
import { fmtBytes } from './format.ts';
import { HEAD_BYTES, isHuge, readImageSize, type ImageSize } from './image-size.ts';

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf'
};

/** Use the browser MIME type when present, otherwise infer one from the filename. */
export function inferType(name: string, type: string): string {
  if (type) return type;
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? '';
}

export async function readHead(file: Blob, length = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
export function isHeicHead(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  const text = (from: number) => String.fromCharCode(...head.subarray(from, from + 4));
  return text(4) === 'ftyp' && HEIF_BRANDS.has(text(8));
}

export type ImageProblem = 'heic' | 'unreadable' | 'too-large' | 'damaged';

export function classifyImageError(e: unknown, heic: boolean, huge = false): ImageProblem {
  if (heic) return 'heic';
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = String((e as { message?: string } | null)?.message ?? '');
  if (['NotReadableError', 'NotFoundError', 'SecurityError', 'AbortError'].includes(name)) return 'unreadable';
  if (huge || name === 'RangeError' || name === 'QuotaExceededError' || /memory|allocation|too (large|big)|canvas|array (buffer )?length|encode failed/i.test(message)) return 'too-large';
  return 'damaged';
}

export function imageProblemMessage(problem: ImageProblem, name: string): string {
  switch (problem) {
    case 'heic': return `“${name}” is a HEIC photo (the iPhone format), and this browser cannot open it. Open this page in Safari, or share the photo as a JPG from your Photos app, then try again.`;
    case 'unreadable': return `“${name}” could not be read from your device. If it is kept in the cloud (Google Photos, iCloud, OneDrive), download it to your device first, then choose it again.`;
    case 'too-large': return `“${name}” is too large for this device to handle. Try a smaller photo.`;
    default: return `“${name}” could not be opened as an image. It may be damaged, or in a format this browser does not support.`;
  }
}

export function failureDetails(e: unknown, file: { type: string; size: number }, size: ImageSize | null): string {
  const name = (e as { name?: string } | null)?.name || 'Error';
  return `Details: ${name}, ${file.type || 'no file type'}, ${fmtBytes(file.size)}${size ? `, ${size.w}×${size.h}` : ''}.`;
}

export interface ImageDiagnosis { message: string; problem: ImageProblem; size: ImageSize | null }

export async function diagnoseImageFailure(e: unknown, file: File): Promise<ImageDiagnosis> {
  let heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
  let size: ImageSize | null = null; let error = e;
  try { const head = await readHead(file, HEAD_BYTES); heic = heic || isHeicHead(head); size = readImageSize(head); }
  catch (readError) { error = readError; }
  const problem = classifyImageError(error, heic, isHuge(size));
  return { message: `${imageProblemMessage(problem, file.name)} ${failureDetails(error, file, size)}`, problem, size };
}

export async function explainImageFailure(e: unknown, file: File): Promise<string> { return (await diagnoseImageFailure(e, file)).message; }