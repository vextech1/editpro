import { isThumbData } from '#lib/core/cloud-library.ts';

export type ThumbResult = { ok: true; data: string } | { ok: false; reason: string };

const SIDES = [320, 240, 160];
const QUALITIES = [0.82, 0.7, 0.58, 0.46];

/** Makes a small JPEG data URL on the admin's device; the original picture is never uploaded. */
export async function makeThumb(file: File): Promise<ThumbResult> {
  const bad = (reason: string): ThumbResult => ({ ok: false, reason });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return bad('choose a JPG, PNG or WebP picture');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return bad('that picture could not be read'); }
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return bad('this browser cannot make thumbnails');
      context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (isThumbData(data)) return { ok: true, data };
      }
    }
    return bad('it could not be made small enough. Try a simpler picture');
  } finally { bitmap.close(); }
}
