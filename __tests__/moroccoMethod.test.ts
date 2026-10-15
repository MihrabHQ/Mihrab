/**
 * Morocco — the ministry's own method (`moroccoMethod.ts`), computed at
 * each listed city's point and horizon (`moroccoMethodPoints.json`), held
 * against the ministry's published tables (`fixtures/referenceTables.ts`;
 * in GMT+1 until 17 September 2026, GMT since).
 */
jest.unmock('adhan');

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moroccoTimes } from '../src/providers/moroccoMethod';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { getHabousDatasetTimes } from '../src/providers/habousDataset';
import { referenceCities, withReferenceTables } from './fixtures/referenceTables';
import points from '../src/providers/data/moroccoMethodPoints.json';
import { nearestMoroccoCity } from '../src/providers/moroccoNearest';

const P = points as Record<string, number[]>;
const gmtMin = (d: Date) => ((Math.round(d.getTime() / 60000) % 1440) + 1440) % 1440;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

withReferenceTables('morocco')('the ministry’s method, against its tables', () => {
  const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  const compare = (corrected: boolean) => {
    const dir = referenceCities('morocco')!;
    let same = 0;
    let total = 0;
    let worst = 0;
    for (const id of Object.keys(P)) {
      const file = path.join(dir, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      const [lat, lon, dip, dipMaghrib] = P[id];
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const at = corrected
          ? computeLocalAdhanInstants({ latitude: lat, longitude: lon, date: new Date(y, m - 1, d), calculationMethod: 21, school: 0, horizonDipDeg: dip, horizonDipMaghribDeg: dipMaghrib })
          : moroccoTimes(lat, lon, y, m - 1, d, dip, 1, dipMaghrib)!;
        const clock = key < '2026-09-17' ? 60 : 0; // the tables' own clock
        KEYS.forEach((k, i) => {
          const diff = Math.abs(((gmtMin(at[k]) + clock - toMin(row[i + 1]) + 720) % 1440 + 1440) % 1440 - 720);
          total++;
          if (diff === 0) same++;
          worst = Math.max(worst, diff);
        });
      }
    }
    return { same, total, worst };
  };

  it('gives the published minute for at least 99% of the tables, never a minute further', () => {
    const { same, total, worst } = compare(false);
    expect(total).toBeGreaterThan(70000);
    expect(same / total).toBeGreaterThanOrEqual(0.99);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('with the correction list, gives every published minute', () => {
    const { same, total } = compare(true);
    expect(same).toBe(total);
  });

});

describe('the ministry’s method', () => {
  it('is what method 21 computes, the horizon taken from the height where the ministry’s is not known', () => {
    const day = new Date(2026, 9, 20);
    const a = computeLocalAdhanInstants({ latitude: 34.02, longitude: -6.84, date: day, calculationMethod: 21, school: 0, heightM: 400 });
    const b = moroccoTimes(34.02, -6.84, 2026, 9, 20, 0.02 * Math.sqrt(400))!;
    expect(a.maghrib.getTime()).toBe(b.maghrib.getTime());
    expect(a.sunrise.getTime()).toBe(b.sunrise.getTime());
  });
});

describe('the habous source serves the calculation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('at the nearest city, offline, for any date', async () => {
    const r = await getHabousDatasetTimes({ latitude: 34.0209, longitude: -6.8416, date: new Date(2031, 2, 3) });
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Africa/Casablanca');
    expect(r.timings.Fajr).toMatch(/^\d\d:\d\d$/);
  });

  it('places Ikss in the Atlas and Assa at the town, as their tables do', () => {
    expect(nearestMoroccoCity(30.95, -7.85)!.id).toBe(317);
    expect(nearestMoroccoCity(28.61, -9.43)!.id).toBe(150);
    // Casablanca's outskirts are no longer matched to a village 300 km away.
    expect(nearestMoroccoCity(33.585, -7.8438)!.id).not.toBe(317);
  });
});
