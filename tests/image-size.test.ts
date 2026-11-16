import { describe, it, expect } from 'vitest';
import { HUGE_PIXELS, isHuge, readImageSize } from '../src/lib/core/image-size';

const a = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
function jpeg(w: number, h: number, opts: { marker?: number; before?: number[][] } = {}): Uint8Array {
  const segs = (opts.before ?? []).flatMap((body, i) => [0xff, 0xe0 + i, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]);
  return Uint8Array.from([0xff, 0xd8, ...segs, 0xff, opts.marker ?? 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
}
const png = (w: number, h: number) => Uint8Array.from([0x89, ...a('PNG'), 13, 10, 26, 10, 0, 0, 0, 13, ...a('IHDR'), ...be32(w), ...be32(h), 8, 2, 0, 0, 0]);
const gif = (w: number, h: number) => Uint8Array.from([...a('GIF89a'), ...le16(w), ...le16(h), 0, 0, 0]);

describe('readImageSize', () => {
  it('reads baseline and progressive JPEG sizes, including after metadata', () => {
    expect(readImageSize(jpeg(4032, 3024))).toEqual({ w: 4032, h: 3024 });
    expect(readImageSize(jpeg(1200, 1600, { marker: 0xc2 }))).toEqual({ w: 1200, h: 1600 });
    expect(readImageSize(jpeg(16320, 12240, { before: [new Array(60000).fill(1), new Array(40000).fill(2), new Array(100).fill(3)] }))).toEqual({ w: 16320, h: 12240 });
  });
  it('does not mistake an embedded thumbnail for the JPEG dimensions', () => {
    expect(readImageSize(jpeg(8000, 6000, { before: [Array.from(jpeg(160, 120))] }))).toEqual({ w: 8000, h: 6000 });
  });
  it('returns null for truncated or unknown headers', () => {
    expect(readImageSize(jpeg(100, 100, { before: [new Array(300).fill(1)] }).subarray(0, 100))).toBeNull();
    expect(readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 0, 0]))).toBeNull(); expect(readImageSize(new Uint8Array())).toBeNull();
  });
  it('reads PNG and GIF sizes', () => { expect(readImageSize(png(5000, 7000))).toEqual({ w: 5000, h: 7000 }); expect(readImageSize(gif(320, 200))).toEqual({ w: 320, h: 200 }); });
  it('reads extended, lossless and lossy WebP sizes', () => {
    const riff = (chunk: string, body: number[]) => Uint8Array.from([...a('RIFF'), 0, 0, 0, 0, ...a('WEBP'), ...a(chunk), 0, 0, 0, 0, ...body]);
    expect(readImageSize(riff('VP8X', [0, 0, 0, 0, ...le24(1999), ...le24(1499), 0, 0]))).toEqual({ w: 2000, h: 1500 });
    const bits = ((800 - 1) | ((600 - 1) << 14)) >>> 0;
    expect(readImageSize(riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255, 0, 0, 0, 0, 0]))).toEqual({ w: 800, h: 600 });
    expect(readImageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(480), 0, 0]))).toEqual({ w: 640, h: 480 });
  });
});

describe('isHuge', () => {
  it('uses a pixel threshold and handles unknown dimensions', () => {
    expect(isHuge({ w: 16320, h: 12240 })).toBe(true); expect(isHuge({ w: 8000, h: 8000 })).toBe(false); expect(isHuge(null)).toBe(false);
    expect(HUGE_PIXELS).toBeGreaterThan(50_000_000);
  });
});