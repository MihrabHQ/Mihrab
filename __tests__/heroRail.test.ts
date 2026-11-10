import { dayRailOf, intervalRail } from '../src/screens/home/heroRail';

const DAY = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};
const at = (h: number, m = 0, d = 23) => new Date(2026, 7, d, h, m, 0);

describe('intervalRail', () => {
  it('runs from the prayer last passed to the one counted to', () => {
    const r = intervalRail(DAY, at(13, 30), at(15, 0))!;
    expect(r.from.key).toBe('Dhuhr');
    expect(r.from.at).toEqual(at(12, 0));
    expect(r.pct).toBeCloseTo(0.5, 5);
  });

  it('before Fajr runs from last night’s Isha rather than vanishing', () => {
    const r = intervalRail(DAY, at(2, 0), at(5, 0))!;
    expect(r.from.key).toBe('Isha');
    expect(r.from.at).toEqual(at(20, 0, 22));
    // Six of the nine hours between Isha and Fajr.
    expect(r.pct).toBeCloseTo(6 / 9, 5);
  });

  it('stays between 0 and 1, and is not drawn with no interval to measure', () => {
    expect(intervalRail({}, at(13, 0), at(15, 0))).toBeNull();
    expect(intervalRail(DAY, at(15, 30), at(15, 0))).toBeNull();
    for (let h = 0; h < 24; h++) {
      const r = intervalRail(DAY, at(h, 20), at(h + 1, 0));
      if (r) {
        expect(r.pct).toBeGreaterThanOrEqual(0);
        expect(r.pct).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reads an Isha written past midnight as tonight’s, not as already passed', () => {
    // A northern June: Isha at 00:47 belongs to the night that follows.
    const june = { ...DAY, Maghrib: '22:05', Isha: '00:47' };
    const r = intervalRail(june, at(23, 0), new Date(2026, 7, 24, 0, 47))!;
    expect(r.from.key).toBe('Maghrib');
    expect(r.pct).toBeGreaterThan(0);
    expect(r.pct).toBeLessThan(1);
  });
});

describe('dayRailOf', () => {
  it('is Fajr to the next Fajr, a mark a prayer, in order', () => {
    const r = dayRailOf(DAY, at(13, 0))!;
    expect(r.marks.map(m => m.key)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Fajr']);
    expect(r.marks[0].at).toBe(0);
    expect(r.marks.at(-1)!.at).toBe(1);
    expect(r.marks[1].at).toBeCloseTo(7 / 24, 5);
    const places = r.marks.map(m => m.at);
    expect([...places].sort((x, y) => x - y)).toEqual(places);
    // 13:00 is eight hours after Fajr.
    expect(r.pct).toBeCloseTo(8 / 24, 5);
  });

  it('before Fajr is still yesterday’s day, near its end', () => {
    const r = dayRailOf(DAY, at(3, 0))!;
    expect(r.pct).toBeCloseTo(22 / 24, 5);
    expect(r.marks.every(m => m.at >= 0 && m.at <= 1)).toBe(true);
  });

  it('leaves out a prayer the day does not list, and needs Fajr', () => {
    const { Asr: _asr, ...noAsr } = DAY;
    expect(dayRailOf(noAsr, at(13, 0))!.marks.map(m => m.key)).toEqual(['Fajr', 'Dhuhr', 'Maghrib', 'Isha', 'Fajr']);
    const { Fajr: _fajr, ...noFajr } = DAY;
    expect(dayRailOf(noFajr, at(13, 0))).toBeNull();
  });
});
