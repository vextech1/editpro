// Read image dimensions from the file header before decoding, so very large phone photos can be downsampled first.

export const HUGE_PIXELS = 64_000_000;
export const HUGE_DECODE_SIDE = 4096;
export const HEAD_BYTES = 262_144;

export interface ImageSize { w: number; h: number }

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
const valid = (w: number, h: number): ImageSize | null => (w > 0 && h > 0 ? { w, h } : null);

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  for (let step = 0; step < 4096 && i + 4 <= b.length; step++) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x00) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16(b, i + 2);
    if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return i + 9 <= b.length ? valid(u16(b, i + 7), u16(b, i + 5)) : null;
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  const kind = ascii(b, 12, 4);
  if (kind === 'VP8X' && b.length >= 30) return valid(le24(b, 24) + 1, le24(b, 27) + 1);
  if (kind === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (kind === 'VP8 ' && b.length >= 30) return valid(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  return null;
}

/** Size of a JPEG, PNG, GIF or WebP from its header; null when unknown or malformed. */
export function readImageSize(b: Uint8Array): ImageSize | null {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return valid(u32(b, 16), u32(b, 20));
  if (b.length >= 10 && ascii(b, 0, 3) === 'GIF') return valid(le16(b, 6), le16(b, 8));
  if (b.length >= 16 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webpSize(b);
  return null;
}

export const isHuge = (size: ImageSize | null | undefined): boolean => !!size && size.w * size.h > HUGE_PIXELS;