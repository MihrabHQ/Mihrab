/**
 * The offline fallback computes what AlAdhan would have served.
 *
 * `calculationMethod` is an AlAdhan method id everywhere in this app: the
 * picker stores it, `aladhan.ts` forwards it verbatim, and `localAdhan.ts`
 * computes with it when the network is gone. If those two disagree, a
 * user's prayer times change depending on whether they have signal — and
 * nothing in the app would say so.
 *
 * They disagreed for five methods. `parametersForMethod` mapped several
 * named methods onto some other method's angles:
 *
 *    0  Shia Ithna-Ashari, Qum       → Tehran 17.7/14   (should be 16/14)
 *    8  Gulf Region                  → Dubai 18.2/18.2  (should be 19.5 / 90 min)
 *   12  Union Org. Islamic de France → MWL 18/17        (should be 12/12)
 *   14  Spiritual Adm. of Russia     → Moonsighting     (should be 16/15)
 *   21  Morocco                      → absent, so MWL   (should be 19/17 + margins)
 *
 * Morocco is the one that got reported — issue #10, "prayer times in my
 * location are a bit off by minutes" — and only barely, because AlAdhan
 * already auto-selects Morocco for Moroccan coordinates. The gap showed
 * only to someone who had picked a method by hand, and there was no right
 * one to pick, or who was computing offline.
 *
 * The expectations below are READINGS, taken from AlAdhan on 2026-08-30
 * for a city that uses each method. They are not derived from the same
 * parameters they check, which is the whole point: two independent
 * implementations agreeing is evidence, one implementation agreeing with
 * itself is not.
 */
// The shared setup stubs `adhan` with fixed times that ignore every
// parameter — fine for the tests that only need prayer times in order,
// useless here. This file exists to check the arithmetic, so it uses the
// real library.
jest.unmock('adhan');

import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { CALCULATION_METHODS } from '../src/settings/methods';
import {
  HABOUS_RABAT_RABI_AWWAL_1448,
  RABAT,
} from './fixtures/habousRabat';

/**
 * What AlAdhan served for 30 Aug 2026, quoted from its JSON.
 *
 * Asr is deliberately absent. adhan.js computes it one to two minutes
 * before AlAdhan for EVERY method, presets included — a shadow-length
 * rounding difference, not a parameter — so pinning it here would be
 * pinning someone else's rounding. It is asserted loosely below instead.
 */
const ALADHAN = [
  {
    id: 0,
    method: 'Shia Ithna-Ashari, Leva Institute, Qum',
    city: 'Qum',
    latitude: 34.6416,
    longitude: 50.8746,
    timeZone: 'Asia/Tehran',
    // Maghrib is 16 minutes past a sunset of 18:36: held until the redness
    // goes. No angle produces that, and /methods does not mention it.
    times: { Fajr: '04:20', Sunrise: '05:38', Dhuhr: '12:07', Maghrib: '18:52', Isha: '19:43' },
    asr: '15:46',
  },
  {
    id: 8,
    method: 'Gulf Region',
    city: 'Dubai',
    latitude: 25.2048,
    longitude: 55.2708,
    timeZone: 'Asia/Dubai',
    // Isha is Maghrib + 90 minutes, not an angle: 18:40 → 20:10.
    times: { Fajr: '04:33', Sunrise: '05:59', Dhuhr: '12:20', Maghrib: '18:40', Isha: '20:10' },
    asr: '15:50',
  },
  {
    id: 12,
    method: 'Union Organization Islamic de France',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    timeZone: 'Europe/Paris',
    times: { Fajr: '05:51', Sunrise: '07:04', Dhuhr: '13:51', Maghrib: '20:37', Isha: '21:50' },
    asr: '17:37',
  },
  {
    id: 14,
    method: 'Spiritual Administration of Muslims of Russia',
    city: 'Moscow',
    latitude: 55.7558,
    longitude: 37.6173,
    timeZone: 'Europe/Moscow',
    times: { Fajr: '03:23', Sunrise: '05:30', Dhuhr: '12:30', Maghrib: '19:29' },
    // Isha at 55.8°N is within a minute; high latitude, left loose.
    asr: '16:17',
  },
] as const;

/** 30 Aug 2026, built from parts so the box's timezone cannot move it. */
const DATE = new Date(2026, 7, 30);

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * `computeLocalAdhanTimes` formats in the BOX's timezone, which is not the
 * city's. Re-derive the wall clock the city would read, so the fixture can
 * be quoted as AlAdhan printed it.
 */
function inCityTime(hhmm: string, timeZone: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const local = new Date(2026, 7, 30, h, m);
  return local.toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

describe('offline computation agrees with the API it stands in for', () => {
  it.each(ALADHAN.map(c => [c.id, c.method, c] as const))(
    'method %i (%s)',
    (_id, _name, fixture) => {
      const got = computeLocalAdhanTimes({
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        date: DATE,
        calculationMethod: fixture.id,
        school: 0,
      });
      for (const [prayer, expected] of Object.entries(fixture.times)) {
        const mine = inCityTime(
          got.timings[prayer as keyof typeof got.timings]!,
          fixture.timeZone,
        );
        expect(`${prayer} ${mine}`).toBe(`${prayer} ${expected}`);
      }
    },
  );

  it.each(ALADHAN.map(c => [c.id, c] as const))(
    'method %i computes Asr within adhan.js’s known rounding of AlAdhan',
    (_id, fixture) => {
      const got = computeLocalAdhanTimes({
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        date: DATE,
        calculationMethod: fixture.id,
        school: 0,
      });
      const mine = minutes(inCityTime(got.timings.Asr, fixture.timeZone));
      const theirs = minutes(fixture.asr);
      // Early by 0–2 minutes, never late, and never further out — which is
      // what makes it a rounding difference rather than a wrong parameter.
      expect(theirs - mine).toBeGreaterThanOrEqual(0);
      expect(theirs - mine).toBeLessThanOrEqual(2);
    },
  );
});

describe('a Moroccan user has a method to pick', () => {
  it('offers Morocco', () => {
    const morocco = CALCULATION_METHODS.find(m => m.id === 21);
    expect(morocco).toBeDefined();
    expect(morocco!.name).toBe('Morocco');
    expect(morocco!.nameKey).toBe('methods.21');
  });

  it('names it in every language the app speaks', () => {
    const { readdirSync, readFileSync } = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
    const locales = readdirSync(dir).filter((f: string) => f.endsWith('.json'));
    expect(locales.length).toBeGreaterThanOrEqual(13);
    for (const file of locales) {
      const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      expect(`${file}: ${typeof json.methods?.['21']}`).toBe(`${file}: string`);
      expect(json.methods['21'].length).toBeGreaterThan(0);
    }
  });

  it('every method in the picker can actually be computed offline', () => {
    // The gap Morocco fell into: an id the picker offers but the local
    // fallback has no case for silently becomes Muslim World League.
    const mwl = computeLocalAdhanTimes({
      latitude: 34.0209,
      longitude: -6.8416,
      date: DATE,
      calculationMethod: 3,
      school: 0,
    });
    const distinct = CALCULATION_METHODS.filter(m => m.id !== 'auto' && m.id !== 3);
    const collisions = distinct.filter(m => {
      const got = computeLocalAdhanTimes({
        latitude: 34.0209,
        longitude: -6.8416,
        date: DATE,
        calculationMethod: m.id as number,
        school: 0,
      });
      return JSON.stringify(got.timings) === JSON.stringify(mwl.timings);
    });
    expect(collisions.map(m => `${m.id} ${m.name}`)).toEqual([]);
  });
});

/**
 * The six national conventions added with the Türkiye Takvimi work, so
 * that the picker names every country AlAdhan has a method for. Readings
 * from AlAdhan on 30 Aug 2026 for each method's own capital. Pinned to
 * within a minute rather than exactly: AlAdhan and adhan.js round a
 * fractional angle like Dubai's 18.2° a minute apart, and Asr is the
 * known one-to-two-minute shadow rounding as above.
 */
const ALADHAN_2026_10 = [
  { id: 16, city: 'Dubai', latitude: 25.2048, longitude: 55.2708, timeZone: 'Asia/Dubai',
    times: { Fajr: '04:39', Sunrise: '05:59', Dhuhr: '12:23', Asr: '15:49', Maghrib: '18:43', Isha: '20:00' } },
  { id: 18, city: 'Tunis', latitude: 36.8065, longitude: 10.1815, timeZone: 'Africa/Tunis',
    times: { Fajr: '04:18', Sunrise: '05:49', Dhuhr: '12:20', Asr: '16:00', Maghrib: '18:51', Isha: '20:22' } },
  { id: 22, city: 'Lisbon', latitude: 38.7223, longitude: -9.1393, timeZone: 'Europe/Lisbon',
    times: { Fajr: '05:30', Sunrise: '07:04', Dhuhr: '13:42', Asr: '17:18', Maghrib: '20:13', Isha: '21:30' } },
  { id: 23, city: 'Amman', latitude: 31.9461, longitude: 35.9238, timeZone: 'Asia/Amman',
    times: { Fajr: '04:45', Sunrise: '06:10', Dhuhr: '12:37', Asr: '16:13', Maghrib: '19:08', Isha: '20:28' } },
] as const;

describe('the national conventions added in 2.32 agree with AlAdhan (Malaysia and Indonesia are checked against their authorities below)', () => {
  it.each(ALADHAN_2026_10.map(c => [c.id, c.city, c] as const))('method %i (%s)', (_id, _city, fixture) => {
    const got = computeLocalAdhanTimes({
      latitude: fixture.latitude,
      longitude: fixture.longitude,
      date: DATE,
      calculationMethod: fixture.id,
      school: 0,
    });
    for (const [prayer, expected] of Object.entries(fixture.times)) {
      const mine = minutes(inCityTime(got.timings[prayer as keyof typeof got.timings]!, fixture.timeZone));
      const diff = minutes(expected) - mine;
      const slack = prayer === 'Asr' ? 2 : 1;
      expect(`${prayer} ${diff}`).toMatch(new RegExp(`^${prayer} (-1|0|1${slack === 2 ? '|2' : ''})$`));
    }
  });

  it('are offered in the picker and named in every language', () => {
    const { readdirSync, readFileSync } = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
    for (const id of [16, 17, 18, 20, 22, 23]) {
      expect(CALCULATION_METHODS.find(m => m.id === id)?.nameKey).toBe(`methods.${id}`);
      for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.json'))) {
        const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
        expect(`${file} ${id}: ${typeof json.methods?.[String(id)]}`).toBe(`${file} ${id}: string`);
      }
    }
  });
});

describe('Umm al-Qura holds Isha two hours after Maghrib in Ramadan', () => {
  // AlAdhan for Makkah, method 4: Ramadan 1447 ran 18 Feb – 19 Mar 2026.
  const MAKKAH = { latitude: 21.4225, longitude: 39.8262 };
  // `inCityTime` assumes 30 August; these dates are in March, on the other
  // side of the box zone's clock change, so the wall clock is re-derived here.
  const at = (date: Date, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
    return local.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const read = (date: Date) => {
    const t = computeLocalAdhanTimes({ ...MAKKAH, date, calculationMethod: 4, school: 0 }).timings;
    return `${at(date, t.Maghrib)} ${at(date, t.Isha)}`;
  };
  it('in Ramadan: 120 minutes, as AlAdhan serves it', () => {
    expect(read(new Date(2026, 2, 1))).toBe('18:25 20:25');
    expect(read(new Date(2026, 2, 15))).toBe('18:30 20:30');
  });
  it('the rest of the year: 90', () => {
    expect(read(new Date(2026, 2, 25))).toBe('18:33 20:03');
  });
});

describe('Malaysia is checked against JAKIM, not against AlAdhan', () => {
  /**
   * JAKIM's tables for every zone and the whole year are in the
   * repository (the 'jakim' dataset). AlAdhan's 20° Fajr is ten minutes
   * before them; the department's own is 18° with a margin.
   */
  const fs = require('fs');
  const path = require('path');
  const { JAKIM_ZONES } = require('../tools/national-tables/jakim-zones');
  const DIR = path.join(__dirname, '..', 'data', 'prayer-times', 'malaysia', 'v1', 'cities');
  const wall = (date: Date, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  it('lands within a minute of the zone’s table nine times in ten, and never more than a few off', () => {
    if (!fs.existsSync(DIR)) return; // not built in this checkout
    let total = 0;
    let close = 0;
    JAKIM_ZONES.forEach((z: { towns: [string, number, number][] }, i: number) => {
      const file = path.join(DIR, `${i + 1}.json`);
      if (!fs.existsSync(file)) return;
      const [, latitude, longitude] = z.towns[0];
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      for (const [date, row] of Object.entries(days)) {
        const [y, m, d] = date.split('-').map(Number);
        const day = new Date(y, m - 1, d);
        if (new Date(y, m - 1, d + 1).getTime() - day.getTime() !== 86_400_000) continue;
        const got = computeLocalAdhanTimes({ latitude, longitude, date: day, calculationMethod: 17, school: 0 }).timings;
        const mine = [got.Fajr, got.Sunrise, got.Dhuhr, got.Asr, got.Maghrib, got.Isha].map(t => minutes(wall(day, t)));
        row.slice(1).forEach((theirs, k) => {
          const diff = Math.abs(minutes(theirs) - mine[k]);
          expect(diff).toBeLessThanOrEqual(8);
          total++;
          if (diff <= 1) close++;
        });
      }
    });
    expect(total).toBeGreaterThan(20000);
    expect(close / total).toBeGreaterThan(0.88);
  });
});

describe('Indonesia is checked against the ministry, not against AlAdhan', () => {
  /**
   * Kemenag adds a safety margin (ihtiyat) to every time and rounds up;
   * AlAdhan's id 20 has the angles alone and runs two to three minutes
   * early. Four cities across the archipelago, four months of 2026, from
   * the ministry's own tables (bimasislam.kemenag.go.id, as mirrored by
   * api.myquran.com, which keeps its ids and names).
   */
  const TABLES = require('./fixtures/kemenag/four-cities-2026.json') as Record<string, Record<string, string[]>>;
  const CITIES: Record<string, [number, number, string]> = {
    'KOTA JAKARTA': [-6.2088, 106.8456, 'Asia/Jakarta'],
    'KOTA MEDAN': [3.5952, 98.6722, 'Asia/Jakarta'],
    'KOTA MAKASSAR': [-5.1477, 119.4327, 'Asia/Makassar'],
    'KOTA JAYAPURA': [-2.5337, 140.7181, 'Asia/Jayapura'],
  };
  const wall = (date: Date, hhmm: string, tz: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  };

  it('lands on the ministry’s minute nine times in ten, and never more than a minute off', () => {
    let total = 0;
    let exact = 0;
    for (const [city, days] of Object.entries(TABLES)) {
      const [latitude, longitude, tz] = CITIES[city];
      for (const [date, row] of Object.entries(days)) {
        const [y, m, d] = date.split('-').map(Number);
        const day = new Date(y, m - 1, d);
        // The box's own clock change makes its wall clock ambiguous for an
        // hour that day; the ministry's table is in Indonesia, which has none.
        if (new Date(y, m - 1, d + 1).getTime() - day.getTime() !== 86_400_000) continue;
        const got = computeLocalAdhanTimes({ latitude, longitude, date: day, calculationMethod: 20, school: 0 }).timings;
        const mine = [got.Fajr, got.Sunrise, got.Dhuhr, got.Asr, got.Maghrib, got.Isha].map(t => minutes(wall(day, t, tz)));
        row.forEach((theirs, i) => {
          const diff = Math.abs(minutes(theirs) - mine[i]);
          expect(`${city} ${date} #${i} off by ${diff}`).toMatch(/off by [01]$/);
          total++;
          if (diff === 0) exact++;
        });
      }
    }
    expect(total).toBeGreaterThan(2000);
    expect(exact / total).toBeGreaterThan(0.9);
  });
});

describe('Morocco is checked against the ministry, not against AlAdhan', () => {
  /**
   * AlAdhan's method 21 is a good secondary source and it is what the app
   * receives online. But it omits the Chourouq margin entirely and uses +5
   * for Maghrib where the ministry uses +4, so pinning Morocco to it would
   * pin two known errors. Where a secondary source and the authority a
   * method is named after disagree, the authority wins.
   *
   * The fixture is a whole month of habous.gov.ma's own table for Rabat.
   * Two readings could not separate a published margin from our city
   * coordinates being slightly off; thirty days can, and do.
   */
  const KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

  /** The ministry's month, re-dated: 14–31 August then 1–12 September 2026. */
  function walk(): Array<{ date: Date; want: Record<string, string> }> {
    const out = [];
    let month = 7;
    let previous = 0;
    for (const [day, ...times] of HABOUS_RABAT_RABI_AWWAL_1448) {
      if (day < previous) month = 8;
      previous = day;
      out.push({
        date: new Date(2026, month, day),
        want: Object.fromEntries(KEYS.map((k, i) => [k, times[i]])),
      });
    }
    return out;
  }

  function asRabatClock(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2026, 7, 30, h, m).toLocaleTimeString('en-GB', {
      timeZone: RABAT.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const days = walk().map(({ date, want }) => {
    const got = computeLocalAdhanTimes({
      latitude: RABAT.latitude,
      longitude: RABAT.longitude,
      date,
      calculationMethod: 21,
      school: 0,
    });
    const delta: Record<string, number> = {};
    for (const k of KEYS) {
      delta[k] = minutes(asRabatClock(got.timings[k])) - minutes(want[k]);
    }
    return { date, delta };
  });

  it('covers the whole published month', () => {
    expect(days).toHaveLength(30);
  });

  it('lands on the ministry’s Dhuhr every single day', () => {
    // Dhuhr is longitude and nothing else, so this is what proves the
    // sunrise and Maghrib gaps are the ministry's margins rather than our
    // coordinates being wrong.
    expect(days.filter(d => d.delta.Dhuhr !== 0)).toEqual([]);
  });

  it.each(['Fajr', 'Sunrise', 'Dhuhr', 'Maghrib', 'Isha'] as const)(
    'is within a minute of the ministry on %s, every day of the month',
    prayer => {
      const worst = days
        .map(d => ({ day: d.date.toDateString(), off: d.delta[prayer] }))
        .filter(d => Math.abs(d.off) > 1);
      expect(worst).toEqual([]);
    },
  );

  it('keeps Asr inside adhan.js’s known rounding', () => {
    // Same shadow-length rounding as every other method here: 0–1 minute
    // early, never late.
    for (const d of days) {
      expect(d.delta.Asr).toBeLessThanOrEqual(0);
      expect(d.delta.Asr).toBeGreaterThanOrEqual(-1);
    }
  });

  it('would fail without the ministry’s margins', () => {
    // The guard on the guard. Chourouq is sunrise −3 and Maghrib is
    // sunset +4; drop either and this fixture rejects it. Recorded as an
    // assertion so the numbers cannot be "tidied" back to AlAdhan's.
    const sunriseOffsets = days.map(d => d.delta.Sunrise);
    const maghribOffsets = days.map(d => d.delta.Maghrib);
    // Without sunrise −3 these would sit around +3, and without maghrib +4
    // rather than +5, around +1.
    expect(Math.max(...sunriseOffsets)).toBeLessThanOrEqual(0);
    expect(Math.max(...maghribOffsets)).toBeLessThanOrEqual(1);
  });
});
