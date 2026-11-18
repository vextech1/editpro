import { describe, expect, it } from 'vitest';
import { errorDetail, withDetail } from '../src/lib/core/error-detail';

describe('errorDetail', () => {
  it('shows the Firebase code and message', () => {
    expect(errorDetail({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe('permission-denied: Missing or insufficient permissions.');
  });
  it('uses the error name when there is no code, and skips the bare "Error"', () => {
    expect(errorDetail(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(errorDetail(new Error('plain'))).toBe('plain');
  });
  it('handles strings, empty values and odd things', () => {
    expect(errorDetail('boom')).toBe('boom');
    expect(errorDetail(undefined)).toBe('No error details were given.');
    expect(errorDetail({ code: 'unavailable' })).toBe('unavailable');
  });
  it('puts the sentence first and the exact error after it', () => {
    expect(withDetail('Student documents could not be loaded.', { code: 'failed-precondition', message: 'The query requires an index.' }))
      .toBe('Student documents could not be loaded. Error: failed-precondition: The query requires an index.');
  });
});
