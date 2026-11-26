/**
 * The hadith of the day (`src/hadith/daily.ts`): one a day, the same for
 * everyone on that day, from "Agreed upon" and nowhere else.
 */
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async () => null),
  packStatus: jest.fn(() => ({ state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => [],
}));

import fs from 'fs';
import path from 'path';
import { AGREED_IDS } from '../src/hadith/catalog';
import { dailyHadithId, dailyIndex, dayNumber, strideFor } from '../src/hadith/daily';

describe('the hadith of the day', () => {
  it('is one of the hadith al-Bukhārī and Muslim both report', () => {
    for (let d = 0; d < 400; d++) {
      const id = dailyHadithId(new Date(2026, 10, 26 + d));
      expect(id).toMatch(/^h:\d+$/);
      expect(AGREED_IDS).toContain(id!.slice(2));
    }
  });

  it('is the same all day, whatever the hour, and another the next day', () => {
    const morning = dailyHadithId(new Date(2026, 10, 26, 0, 1));
    expect(dailyHadithId(new Date(2026, 10, 26, 23, 59))).toBe(morning);
    expect(dailyHadithId(new Date(2026, 10, 27, 0, 1))).not.toBe(morning);
  });

  it('goes by the calendar day, not by how many hours have passed', () => {
    // A day an hour short and a day an hour long are each one day.
    expect(dayNumber(2026, 3, 30) - dayNumber(2026, 3, 29)).toBe(1);
    expect(dayNumber(2026, 10, 26) - dayNumber(2026, 10, 25)).toBe(1);
    expect(dayNumber(2026, 1, 1)).toBe(0);
    expect(dayNumber(2025, 12, 31)).toBe(-1);
    expect(dayNumber(2028, 3, 1) - dayNumber(2028, 2, 28)).toBe(2);
  });

  it('comes round to every hadith once before any twice', () => {
    const n = AGREED_IDS.length;
    const seen = new Set<number>();
    for (let d = 0; d < n; d++) seen.add(dailyIndex(d, n));
    expect(seen.size).toBe(n);
    // And on from where it began.
    expect(dailyIndex(n, n)).toBe(dailyIndex(0, n));
  });

  it('does not walk the list in its own order: two days running are not neighbours', () => {
    const n = AGREED_IDS.length;
    let neighbours = 0;
    for (let d = 0; d < 365; d++) if (Math.abs(dailyIndex(d + 1, n) - dailyIndex(d, n)) <= 1) neighbours++;
    expect(neighbours).toBe(0);
  });

  it('steps by a number that shares no factor with the list’s length, whatever that comes to be', () => {
    for (const n of [1, 2, 613, 1226, 1243, 1300, 3065]) {
      const s = strideFor(n);
      const seen = new Set<number>();
      for (let d = 0; d < n; d++) seen.add(dailyIndex(d, n));
      expect([n, seen.size]).toEqual([n, n]);
      expect(s).toBeGreaterThanOrEqual(613);
    }
  });

  it('works for a day before the first, and says nothing of an empty list', () => {
    expect(dailyIndex(-1, 10)).toBeGreaterThanOrEqual(0);
    expect(dailyIndex(-1, 10)).toBeLessThan(10);
    expect(dailyHadithId(new Date(2026, 0, 1), [])).toBeNull();
    expect(dailyHadithId(new Date(2026, 0, 1), ['7'])).toBe('h:7');
  });
});

describe('on the Hadith tab', () => {
  const screen = fs.readFileSync(path.join(__dirname, '..', 'src/screens/HadithScreen.tsx'), 'utf8');

  it('is at the top of Learn, and opens in the list it is from', () => {
    expect(screen).toMatch(/<View style=\{styles\.stack\}>\s+<DailyHadith navigation=\{navigation\} lang=\{lang\} \/>/);
    expect(screen).toContain("onPress={() => navigation.push('HadithReader', { id, list: AGREED_LIST })}");
  });

  it('shows nothing until the day’s hadith is on the device, and is not offered in a browser', () => {
    expect(screen).toContain('const id = useMemo(() => (AGREED_OFFERED ? dailyHadithId(new Date()) : null), []);');
    expect(screen).toContain('if (!id || !title) return null;');
  });
});
