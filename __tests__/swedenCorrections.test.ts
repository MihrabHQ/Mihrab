/**
 * Sweden's correction list (src/providers/swedenCorrections.ts, from
 * MihrabHQ/mihrab-methods): a minute either way, at Diyanet's points, on the
 * dates the timetables cover — and the app's Sweden times apply it.
 */
jest.unmock('adhan');

import list from '../src/providers/data/swedenCorrections.json';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { SWEDEN_METHOD_ID } from '../src/providers/swedenMethodId';
import { congressTimes } from '../src/providers/congressMethod';
import { swedenCorrection, swedenCorrectionsCoverage } from '../src/providers/swedenCorrections';

const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const points = (list as { points: Record<string, string[]> }).points;

describe('Sweden correction list', () => {
  it('is a minute either way, on one prayer, on dates inside its span', () => {
    const re = /^(\d{4}-\d{2}-\d{2}) (fajr|sunrise|dhuhr|asr|maghrib|isha) ([+-]1)$/;
    let n = 0;
    for (const entries of Object.values(points)) {
      for (const e of entries) {
        const m = re.exec(e);
        expect(m).not.toBeNull();
        expect(m![1] >= swedenCorrectionsCoverage.from && m![1] <= swedenCorrectionsCoverage.to).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(600);
  });

  it("moves exactly the corrected time of the app's Sweden times by its minute", () => {
    const [point, entries] = Object.entries(points)[0];
    const [date, key, step] = entries[0].split(' ');
    const [lat, lon] = point.split(',').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    const at = computeLocalAdhanInstants({ latitude: lat, longitude: lon, date: new Date(y, m - 1, d), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    const raw = congressTimes(lat, lon, y, m - 1, d, 1);
    for (const k of KEYS) {
      const delta = (at[k].getTime() - Math.round(raw[k].getTime() / 60_000) * 60_000) / 60_000;
      expect([k, delta]).toEqual([k, k === key ? Number(step) : 0]);
    }
    expect(swedenCorrection(lat, lon, y, m - 1, d)).toEqual({ [key]: Number(step) });
  });

  it('leaves a point that is not on the list alone', () => {
    expect(swedenCorrection(59.3333, 18.0333, 2026, 9, 15)).toBeUndefined();
  });
});
