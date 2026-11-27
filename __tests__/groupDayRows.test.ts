/**
 * The optional times share thin strips, whichever of them are on and
 * wherever they fall in the day.
 */
import { displayRowsFor, groupDayRows, type DisplayPrayerKey } from '../src/types/prayer';

const DAY = { Fajr: '05:35', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' };
const EXTRA: Record<string, string> = { Sunrise: '08:01', Midnight: '22:23', Lastthird: '00:46', Firstthird: '19:58' };
const shape = (t: Record<string, string>) =>
  groupDayRows(displayRowsFor(t)).map(g => (g.kind === 'row' ? g.key : `[${g.keys.join(' ')}]`));

describe('groupDayRows', () => {
  it('all four on, a Stockholm November: three strips where four rows were', () => {
    expect(shape({ ...DAY, ...EXTRA })).toEqual([
      '[Lastthird]', 'Fajr', '[Sunrise]', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', '[Firstthird Midnight]',
    ]);
  });

  it('both marks before Fajr share the strip above it', () => {
    expect(shape({ ...DAY, Sunrise: '08:01', Midnight: '00:47', Lastthird: '02:48', Firstthird: '22:10' })).toEqual([
      '[Midnight Lastthird]', 'Fajr', '[Sunrise]', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', '[Firstthird]',
    ]);
  });

  it('every one of the sixteen on/off combinations: five rows, and each time on in exactly one strip', () => {
    const names = Object.keys(EXTRA);
    for (let mask = 0; mask < 16; mask++) {
      const on = names.filter((_, i) => mask & (1 << i));
      const groups = groupDayRows(displayRowsFor({ ...DAY, ...Object.fromEntries(on.map(k => [k, EXTRA[k]])) }));
      expect(groups.filter(g => g.kind === 'row').map(g => (g as { key: string }).key)).toEqual(Object.keys(DAY));
      const inStrips = groups.flatMap(g => (g.kind === 'strip' ? g.keys : [])) as DisplayPrayerKey[];
      expect([...inStrips].sort()).toEqual([...on].sort());
      // Never two strips in a row, and never an empty one.
      groups.forEach((g, i) => {
        if (g.kind !== 'strip') return;
        expect(g.keys.length).toBeGreaterThan(0);
        expect(groups[i + 1]?.kind).not.toBe('strip');
      });
    }
  });

  it('with every toggle off the card is its five rows', () => {
    expect(shape(DAY)).toEqual(Object.keys(DAY));
  });
});
