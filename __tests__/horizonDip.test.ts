/**
 * A town on a hill sees the sun earlier and later; the authorities allow
 * for it, each in its own way, and so must the stand-in that computes
 * their methods on the phone (October 2026, read off the tables by
 * tools/verify-methods).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.unmock('adhan');

import { horizonDipDegrees, horizonDipMinutes, solarDeclinationDegrees } from '../src/prayer/horizonDip';
import { computeLocalAdhanInstants, HORIZON_DIP_DEGREES_PER_SQRT_M } from '../src/providers/localAdhan';

const clockIn = (tz: string, at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

const table = (folder: string, id: number) => {
  const f = join(__dirname, '..', 'data', 'prayer-times', folder, 'v1', 'cities', `${id}.json`);
  try {
    return JSON.parse(readFileSync(f, 'utf8')).days as Record<string, string[]>;
  } catch {
    return null;
  }
};

describe('the dip of the horizon', () => {
  it('is k·√h, and nothing at sea level', () => {
    expect(horizonDipDegrees(0, 0.0293)).toBe(0);
    expect(horizonDipDegrees(1600, 0.0293)).toBeCloseTo(1.172, 3);
  });

  it('knows the solstices', () => {
    expect(solarDeclinationDegrees(new Date(2026, 5, 21))).toBeCloseTo(23.44, 1);
    expect(solarDeclinationDegrees(new Date(2026, 11, 21))).toBeCloseTo(-23.44, 1);
    expect(Math.abs(solarDeclinationDegrees(new Date(2026, 2, 20)))).toBeLessThan(0.3);
  });

  it('is about four minutes at the equator for a textbook 1,000 m', () => {
    // 0.0293·√1000 = 0.93°, over 15° an hour.
    expect(horizonDipMinutes(5, new Date(2026, 9, 10), 1000, 0.0293)).toBeCloseTo(3.7, 0);
    // Further north the sun rises at a slant, so the same dip takes longer.
    expect(horizonDipMinutes(60, new Date(2026, 9, 10), 1000, 0.0293)).toBeGreaterThan(6);
  });
});

describe('the Moroccan ministry’s hill towns (method 21)', () => {
  it('computes Midelt at 1,478 m on the ministry’s minute', () => {
    const days = table('morocco', 136);
    if (!days) return;
    const file = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'prayer-times', 'morocco', 'v1', 'cities', '136.json'), 'utf8'));
    expect(file.city).toBe('ميدلت');
    let within = 0;
    let total = 0;
    for (const [date, row] of Object.entries(days)) {
      const [y, m, d] = date.split('-').map(Number);
      const at = computeLocalAdhanInstants({
        latitude: 32.680347,
        longitude: -4.75,
        heightM: 1478,
        date: new Date(y, m - 1, d),
        calculationMethod: 21,
        school: 0,
      });
      for (const [k, t] of [[2, at.sunrise], [5, at.maghrib]] as const) {
        const theirs = row[k];
        const ours = clockIn('Etc/GMT', t);
        const diff = Math.abs(Number(ours.slice(0, 2)) * 60 + Number(ours.slice(3)) - (Number(theirs.slice(0, 2)) * 60 + Number(theirs.slice(3))));
        total++;
        if (diff <= 1) within++;
      }
    }
    expect(within / total).toBeGreaterThan(0.9);
  });

  it('would be four minutes out at sea level', () => {
    const day = new Date(2026, 10, 1);
    const plain = computeLocalAdhanInstants({ latitude: 32.680347, longitude: -4.75, date: day, calculationMethod: 21, school: 0 });
    const hill = computeLocalAdhanInstants({ latitude: 32.680347, longitude: -4.75, heightM: 1478, date: day, calculationMethod: 21, school: 0 });
    const minutes = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000);
    expect(minutes(plain.sunrise, hill.sunrise)).toBeGreaterThanOrEqual(3);
    expect(minutes(hill.maghrib, plain.maghrib)).toBeGreaterThanOrEqual(3);
    expect(minutes(hill.dhuhr, plain.dhuhr)).toBe(0);
    expect(minutes(hill.fajr, plain.fajr)).toBe(0);
  });

  it('uses the ministry’s gentler figure, JAKIM the textbook one', () => {
    expect(HORIZON_DIP_DEGREES_PER_SQRT_M[21]).toBe(0.02);
    expect(HORIZON_DIP_DEGREES_PER_SQRT_M[17]).toBe(0.0293);
  });
});

describe('JAKIM’s summit zones (method 17)', () => {
  it('computes Gunung Kinabalu at its height, on the department’s minute at sunrise', () => {
    const days = table('malaysia', 39);
    if (!days) return;
    let within = 0;
    let total = 0;
    for (const [date, row] of Object.entries(days)) {
      const [y, m, d] = date.split('-').map(Number);
      const at = computeLocalAdhanInstants({
        latitude: 6.075,
        longitude: 116.558,
        heightM: 4046,
        date: new Date(y, m - 1, d),
        calculationMethod: 17,
        school: 0,
      });
      const ours = clockIn('Asia/Kuala_Lumpur', at.sunrise);
      const theirs = row[2];
      const diff = Math.abs(Number(ours.slice(0, 2)) * 60 + Number(ours.slice(3)) - (Number(theirs.slice(0, 2)) * 60 + Number(theirs.slice(3))));
      total++;
      if (diff <= 1) within++;
    }
    expect(within / total).toBeGreaterThan(0.9);
  });
});

describe('Kemenag’s highland class (method 20)', () => {
  it('takes the ministry’s four and a half minutes, not the height', () => {
    const day = new Date(2026, 10, 1);
    const base = { latitude: -7.061, longitude: 107.5, date: day, calculationMethod: 20 as const, school: 0 };
    const plain = computeLocalAdhanInstants(base);
    const byHeight = computeLocalAdhanInstants({ ...base, heightM: 927 });
    const highland = computeLocalAdhanInstants({ ...base, heightM: 927, horizonMin: 4.5 });
    expect(byHeight.sunrise.getTime()).toBe(plain.sunrise.getTime()); // k = 0 for Kemenag
    const earlier = Math.round((plain.sunrise.getTime() - highland.sunrise.getTime()) / 60_000);
    expect([4, 5]).toContain(earlier);
  });
});

describe('the Algerian ministry’s Asr (method 19)', () => {
  it('takes the signed noon shadow when the sun passes north of the zenith', () => {
    // In Guezzam, 19.57°N, at the point the ministry computes it (algeriaMethodPoints.json):
    // its table says Asr 15:42 on 5 June 2027 and 15:45 on 20 May.
    const asr = (y: number, m: number, d: number) =>
      clockIn(
        'Africa/Algiers',
        computeLocalAdhanInstants({ latitude: 19.5617, longitude: 5.7732, date: new Date(y, m - 1, d), calculationMethod: 19, school: 0 }).asr,
      );
    expect(asr(2027, 6, 5)).toBe('15:42');
    expect(asr(2027, 5, 20)).toBe('15:45');
    // In April the sun is still south of the zenith there, and the shadow is the usual one.
    expect(['15:56', '15:57']).toContain(asr(2027, 4, 20));
  });

  it('leaves Algiers alone', () => {
    const day = new Date(2027, 5, 21);
    const theirs = computeLocalAdhanInstants({ latitude: 36.75, longitude: 3.06, date: day, calculationMethod: 19, school: 0 });
    const mwl = computeLocalAdhanInstants({ latitude: 36.75, longitude: 3.06, date: day, calculationMethod: 3, school: 0 });
    expect(Math.abs(theirs.asr.getTime() - mwl.asr.getTime())).toBeLessThanOrEqual(60_000);
  });
});
