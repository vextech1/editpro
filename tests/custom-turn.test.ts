import { describe, expect, it } from 'vitest';
import { NO_TURN, flipOnScreen, isTurned, turnBy, turnedSize } from '#lib/core/photo-ops.ts';

describe('Rotate and Flip sheets', () => {
  it('counts quarter turns around, both ways', () => {
    expect(turnBy(NO_TURN, 1).turns).toBe(1);
    expect(turnBy(NO_TURN, -1).turns).toBe(3);
    expect(turnBy(turnBy(NO_TURN, 1), 3).turns).toBe(0);
    expect(turnBy(NO_TURN, 2).turns).toBe(2);
  });
  it('knows when nothing has changed', () => {
    expect(isTurned(NO_TURN)).toBe(false);
    expect(isTurned(turnBy(turnBy(NO_TURN, 1), -1))).toBe(false);
    expect(isTurned(turnBy(NO_TURN, 2))).toBe(true);
    expect(isTurned(flipOnScreen(NO_TURN, 'h'))).toBe(true);
  });
  it('swaps width and height only on a quarter turn', () => {
    expect(turnedSize(400, 300, turnBy(NO_TURN, 1))).toEqual({ w: 300, h: 400 });
    expect(turnedSize(400, 300, turnBy(NO_TURN, 2))).toEqual({ w: 400, h: 300 });
  });
  it('flips what is on screen, even after a quarter turn', () => {
    expect(flipOnScreen(NO_TURN, 'h')).toMatchObject({ flipH: true, flipV: false });
    expect(flipOnScreen(NO_TURN, 'v')).toMatchObject({ flipH: false, flipV: true });
    const sideways = turnBy(NO_TURN, 1);   // the photo's own sides have swapped places
    expect(flipOnScreen(sideways, 'h')).toMatchObject({ flipH: false, flipV: true });
    expect(flipOnScreen(sideways, 'v')).toMatchObject({ flipH: true, flipV: false });
    expect(flipOnScreen(flipOnScreen(NO_TURN, 'h'), 'h')).toMatchObject({ flipH: false, flipV: false });
  });
});
