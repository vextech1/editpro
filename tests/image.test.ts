import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBitmap } from '../src/lib/core/image';

afterEach(() => vi.unstubAllGlobals());

describe('loadBitmap', () => {
  it('asks the browser to downsample huge JPEGs before decoding', async () => {
    const options: unknown[] = [];
    vi.stubGlobal('createImageBitmap', async (_file: Blob, opt?: ImageBitmapOptions) => {
      options.push(opt);
      return { width: 4096, height: 3072, close() {} } as ImageBitmap;
    });
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x2f, 0xd0, 0x3f, 0xc0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
    const bitmap = await loadBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ resizeWidth: 4096, resizeQuality: 'high', imageOrientation: 'from-image' });
    expect([bitmap.width, bitmap.height]).toEqual([4096, 3072]);
    bitmap.close();
  });
});