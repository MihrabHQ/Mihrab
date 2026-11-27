/**
 * The prayers are an unbroken list; the optional times stand together
 * under it, whichever of them are on.
 */
import { displayRowsFor, splitDayRows } from '../src/types/prayer';

const DAY = { Fajr: '05:35', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' };
const EXTRA: Record<string, string> = { Sunrise: '08:01', Midnight: '22:23', Lastthird: '00:46', Firstthird: '19:58' };

describe('splitDayRows', () => {
  it('all four on, a Stockholm November: five rows, and the four in the order the day reaches them', () => {
    const { prayers, extras } = splitDayRows(displayRowsFor({ ...DAY, ...EXTRA }));
    expect(prayers).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(extras).toEqual(['Lastthird', 'Sunrise', 'Firstthird', 'Midnight']);
  });

  it('a short night: both marks are before Fajr, and come first', () => {
    const t = { ...DAY, Sunrise: '08:01', Midnight: '00:47', Lastthird: '02:48', Firstthird: '22:10' };
    expect(splitDayRows(displayRowsFor(t)).extras).toEqual(['Midnight', 'Lastthird', 'Sunrise', 'Firstthird']);
  });

  it('every one of the sixteen on/off combinations: the same five rows, and exactly the times that are on', () => {
    const names = Object.keys(EXTRA);
    for (let mask = 0; mask < 16; mask++) {
      const on = names.filter((_, i) => mask & (1 << i));
      const { prayers, extras } = splitDayRows(displayRowsFor({ ...DAY, ...Object.fromEntries(on.map(k => [k, EXTRA[k]])) }));
      expect(prayers).toEqual(Object.keys(DAY));
      expect([...extras].sort()).toEqual([...on].sort());
    }
  });

  it('with every toggle off there is no block', () => {
    expect(splitDayRows(displayRowsFor(DAY)).extras).toEqual([]);
  });
});
