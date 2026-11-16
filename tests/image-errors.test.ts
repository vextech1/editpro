import { describe, it, expect } from 'vitest';
import { classifyImageError, explainImageFailure, imageProblemMessage, inferType, isHeicHead, readHead } from '../src/lib/core/image-errors';
import { screenFiles } from '../src/lib/core/pick';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const head = (brand: string, ftyp = 'ftyp') => Uint8Array.from([0, 0, 0, 24, ...ascii(ftyp), ...ascii(brand), 0, 0, 0, 0]);
const file = (name: string, type: string, bytes: number[] | Uint8Array = [1, 2, 3]) => new File([Uint8Array.from(bytes)], name, { type });

describe('inferType and file selection', () => {
  it('keeps the browser type or infers known types from names', () => {
    expect(inferType('x.jpg', 'image/png')).toBe('image/png'); expect(inferType('IMG_1.HEIC', '')).toBe('image/heic');
    expect(inferType('scan.jfif', '')).toBe('image/jpeg'); expect(inferType('doc.PDF', '')).toBe('application/pdf');
    expect(inferType('pic.webp', '')).toBe('image/webp'); expect(inferType('noending', '')).toBe('');
  });
  it('accepts files with empty MIME types when their extensions match', async () => {
    const r = await screenFiles([file('a.heic', ''), file('b.jpg', ''), file('c.txt', ''), file('d.png', 'image/png')], 'image/*');
    expect(r.files.map((f) => f.name)).toEqual(['a.heic', 'b.jpg', 'd.png']); expect(r.skipped.map((f) => f.name)).toEqual(['c.txt']);
    expect((await screenFiles([file('a.pdf', ''), file('b.jpg', '')], 'application/pdf')).files.map((f) => f.name)).toEqual(['a.pdf']);
  });
});

describe('HEIC and image failure classification', () => {
  it('recognizes HEIF brands without mistaking other ISO files', () => {
    expect(isHeicHead(head('heic'))).toBe(true); expect(isHeicHead(head('mif1'))).toBe(true);
    expect(isHeicHead(head('isom'))).toBe(false); expect(isHeicHead(head('heic', 'abcd'))).toBe(false);
  });
  it('classifies unreadable, oversized and damaged files', () => {
    expect(classifyImageError(Object.assign(new Error('x'), { name: 'NotReadableError' }), false)).toBe('unreadable');
    expect(classifyImageError(new RangeError('allocation failed'), false)).toBe('too-large');
    expect(classifyImageError(new Error('decode failed'), false)).toBe('damaged');
    expect(classifyImageError(new Error('decode failed'), true)).toBe('heic');
  });
  it('gives specific next steps and includes small diagnostic facts', async () => {
    expect(imageProblemMessage('heic', 'IMG.HEIC')).toMatch(/Safari.*JPG/);
    expect(await explainImageFailure(new Error('bad'), file('a.jpg', 'image/jpeg'))).toMatch(/damaged.*Details: Error, image\/jpeg/s);
    expect((await readHead(file('a.jpg', '', new Uint8Array(100)), 12)).length).toBe(12);
  });
});