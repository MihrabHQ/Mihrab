/**
 * The checks that decide whether an Algerian dataset build may ship
 * (`tools/algeria-ministry/dataset.ts`). Each one stands for a way the
 * Ministry's database, or the file it came in, could hurt a user.
 */
jest.unmock('adhan');

import {
  buildCities,
  changedDays,
  dayTuple,
  formatClock,
  methodMinutes,
  parseClock,
  sunNearZenithAtNoon,
  type MinistryCity,
  type MinistryRow,
} from '../tools/algeria-ministry/dataset';

const ALGIERS: MinistryCity = { id: 27, name: 'الجزائر', parentId: null };
const ORAN: MinistryCity = { id: 28, name: 'وهران ', parentId: 27 }; // trailing space, as in the database

/** A day that agrees with the Ministry's method at Algiers, the way the real data does. */
function row(cityId: number, date: string, lat = 36.7538, lon = 3.0588): MinistryRow {
  const m = methodMinutes(lat, lon, date).map((x, i) => x + (i === 3 ? 0 : 1));
  const c = m.map(x => formatClock(x).replace(/^0/, ''));
  return { cityId, date, fajr: c[0], sunrise: c[1], dhuhr: c[2], asr: c[3], maghrib: c[4], isha: c[5] };
}

const days = ['2026-10-07', '2026-10-08', '2026-10-09'];

describe('reading the database', () => {
  it('parses its clock formats', () => {
    expect(parseClock('5:24')).toBe(324);
    expect(parseClock('05:24:00')).toBe(324);
    expect(parseClock('24:10')).toBeNaN();
    expect(parseClock('')).toBeNaN();
  });

  it('writes the shared day tuple with Imsak ten minutes before Fajr', () => {
    expect(dayTuple([323, 409, 756, 951, 1105, 1183])).toEqual([
      '05:13', '05:23', '06:49', '12:36', '15:51', '18:25', '19:43',
    ]);
  });
});

describe('buildCities', () => {
  it('accepts a clean table', () => {
    const out = buildCities([ALGIERS], days.map(d => row(27, d)), days[0], days[2]);
    expect(out).toHaveLength(1);
    expect(out[0].nameEn).toBe('Algiers');
    expect(Object.keys(out[0].minutes)).toEqual(days);
  });

  it('refuses a city it has no coordinates for, rather than dropping it', () => {
    expect(() =>
      buildCities([{ id: 99, name: 'مدينة جديدة', parentId: null }], [], days[0], days[2]),
    ).toThrow(/no coordinates/);
  });

  it('refuses a missing day', () => {
    expect(() =>
      buildCities([ALGIERS], [row(27, days[0]), row(27, days[2])], days[0], days[2]),
    ).toThrow(/no row for 2026-10-08/);
  });

  it('refuses a table shifted onto the wrong city', () => {
    // Algiers' times filed under Oran: three degrees of longitude is twelve minutes.
    expect(() =>
      buildCities([ORAN], days.map(d => row(28, d)), days[0], days[2]),
    ).toThrow(/Oran .* min from the method/);
  });

  it('refuses a corrupted value', () => {
    const rows = days.map(d => row(27, d));
    rows[1] = { ...rows[1], maghrib: '19:25' };
    expect(() => buildCities([ALGIERS], rows, days[0], days[2])).toThrow(/maghrib/);
  });

  it('refuses times out of order', () => {
    const rows = days.map(d => row(27, d));
    rows[1] = { ...rows[1], asr: rows[1].dhuhr };
    expect(() => buildCities([ALGIERS], rows, days[0], days[2])).toThrow(/out of order/);
  });

  it('refuses a duplicated day', () => {
    const rows = [...days.map(d => row(27, d)), row(27, days[1])];
    expect(() => buildCities([ALGIERS], rows, days[0], days[2])).toThrow(/duplicate/);
  });

  it('reads names the way the database pads them', () => {
    const out = buildCities([ORAN], days.map(d => row(28, d, 35.6911, -0.6417)), days[0], days[2]);
    expect(out[0].name).toBe('وهران');
  });
});

describe('the far south', () => {
  it('knows when the noon sun is at the zenith', () => {
    expect(sunNearZenithAtNoon(19.5667, '2027-06-05')).toBe(true); // In Guezzam
    expect(sunNearZenithAtNoon(19.5667, '2026-12-21')).toBe(false);
    expect(sunNearZenithAtNoon(36.75, '2027-06-21')).toBe(false); // Algiers, never
  });
});

describe('changedDays', () => {
  it('lists a day already published whose times moved', () => {
    const before = { '2026-10-08': dayTuple([323, 409, 756, 951, 1105, 1183]) };
    expect(changedDays(before, { '2026-10-08': [323, 409, 756, 951, 1105, 1183] })).toEqual([]);
    expect(changedDays(before, { '2026-10-08': [323, 409, 756, 951, 1106, 1183] })).toEqual([
      '2026-10-08',
    ]);
    expect(changedDays(undefined, { '2026-10-08': [1, 2, 3, 4, 5, 6] })).toEqual([]);
  });
});
