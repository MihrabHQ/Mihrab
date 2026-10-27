/**
 * How far back the practice graph reaches (src/practice/historyWeeks.ts).
 */
import { HISTORY_WEEKS, weeksToCover } from '../src/practice/historyWeeks';

// A Thursday, so "today" sits mid-week and the trailing days are future.
const NOW = new Date(2026, 7, 6, 12, 0, 0);

/**
 * The span used to be a constant, which quietly deleted every square older
 * than a quarter. These pin the replacement: the graph reaches the first
 * logged day, however far back that is.
 */
describe('weeksToCover', () => {
  it('falls back to the minimum with nothing logged', () => {
    expect(weeksToCover(null, NOW)).toBe(HISTORY_WEEKS);
    expect(weeksToCover(undefined, NOW)).toBe(HISTORY_WEEKS);
  });

  it('never shrinks below the minimum for a recent first entry', () => {
    expect(weeksToCover('2026-08-01', NOW)).toBe(HISTORY_WEEKS);
  });

  it('counts whole weeks back to the first entry', () => {
    // Monday 13 weeks before this week's Monday — the boundary case.
    expect(weeksToCover('2026-05-11', NOW)).toBe(13);
    // One week further back is one more column.
    expect(weeksToCover('2026-05-04', NOW)).toBe(14);
  });

  it('reaches years back, not just a quarter', () => {
    // 2 Aug 2023 → 3 Aug 2026 is 157 weeks of Mondays, inclusive.
    expect(weeksToCover('2023-08-02', NOW)).toBe(158);
  });

  it('survives a key it cannot parse rather than sizing a grid on NaN', () => {
    expect(weeksToCover('not-a-date', NOW)).toBe(HISTORY_WEEKS);
    expect(weeksToCover('', NOW)).toBe(HISTORY_WEEKS);
  });

  it('is unaffected by the DST change between the two dates', () => {
    // Europe/Stockholm springs forward on 29 March 2026. Counting in raw
    // milliseconds without a noon anchor loses an hour and rounds short.
    expect(weeksToCover('2026-03-23', NOW)).toBe(20);
  });
});
