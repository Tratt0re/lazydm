import { describe, expect, it } from 'vitest';

import { relativeTimeParts } from './relative-time';

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTimeParts', () => {
  it('is "now" under a minute and for the future', () => {
    expect(relativeTimeParts(NOW, NOW)).toEqual([0, 'second']);
    expect(relativeTimeParts(NOW - 59_000, NOW)).toEqual([0, 'second']);
    expect(relativeTimeParts(NOW + 5 * DAY, NOW)).toEqual([0, 'second']);
  });

  it('picks the largest whole unit', () => {
    expect(relativeTimeParts(NOW - 5 * MIN, NOW)).toEqual([-5, 'minute']);
    expect(relativeTimeParts(NOW - 90 * MIN, NOW)).toEqual([-1, 'hour']);
    expect(relativeTimeParts(NOW - 50 * HOUR, NOW)).toEqual([-2, 'day']);
    expect(relativeTimeParts(NOW - 8 * DAY, NOW)).toEqual([-1, 'week']);
    expect(relativeTimeParts(NOW - 65 * DAY, NOW)).toEqual([-2, 'month']);
    expect(relativeTimeParts(NOW - 800 * DAY, NOW)).toEqual([-2, 'year']);
  });

  it('works with Intl.RelativeTimeFormat', () => {
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
    expect(format.format(...relativeTimeParts(NOW - DAY, NOW))).toBe('yesterday');
    expect(format.format(...relativeTimeParts(NOW, NOW))).toBe('now');
  });
});
