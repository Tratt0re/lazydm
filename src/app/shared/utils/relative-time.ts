const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 3600e3],
  ['month', 30 * 24 * 3600e3],
  ['week', 7 * 24 * 3600e3],
  ['day', 24 * 3600e3],
  ['hour', 3600e3],
  ['minute', 60e3],
];

/**
 * A moment as the arguments of `Intl.RelativeTimeFormat.format`: the largest whole unit that fits, counted back
 * from `now` (`[-3, 'day']` reads "3 days ago"). Anything under a minute, or in the future, is "now".
 */
export function relativeTimeParts(
  timestampMs: number,
  now: number = Date.now(),
): [number, Intl.RelativeTimeFormatUnit] {
  const elapsed = now - timestampMs;
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) {
      return [-Math.floor(elapsed / size), unit];
    }
  }

  return [0, 'second'];
}
