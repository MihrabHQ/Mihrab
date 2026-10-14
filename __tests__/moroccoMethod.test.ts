/**
 * Morocco — the ministry's own method (`moroccoMethod.ts`), computed at
 * each listed city's point and horizon (`moroccoMethodPoints.json`), held
 * against the ministry's published tables in `data/prayer-times/morocco`
 * (in GMT, which Morocco keeps since 20 September 2026).
 */
jest.unmock('adhan');

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moroccoTimes } from '../src/providers/moroccoMethod';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import {
  getHabousDatasetTimes,
  setMoroccoServesCalculationForTests,
} from '../src/providers/habousDataset';
import points from '../src/providers/data/moroccoMethodPoints.json';
import { nearestMoroccoCity } from '../src/providers/moroccoNearest';

const P = points as Record<string, number[]>;
const dir = path.join(__dirname, '..', 'data', 'prayer-times', 'morocco', 'v1', 'cities');
const gmtMin = (d: Date) => ((Math.round(d.getTime() / 60000) % 1440) + 1440) % 1440;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

afterAll(() => setMoroccoServesCalculationForTests(true));

describe('the ministry’s method', () => {
  it('gives the published minute for at least 98% of the tables, never a minute further', () => {
    let same = 0;
    let total = 0;
    let worst = 0;
    for (const id of Object.keys(P)) {
      const file = path.join(dir, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      const [lat, lon, dip] = P[id];
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const at = moroccoTimes(lat, lon, y, m - 1, d, dip)!;
        [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].forEach((x, i) => {
          const diff = Math.abs(((gmtMin(x) - toMin(row[i + 1]) + 720) % 1440 + 1440) % 1440 - 720);
          total++;
          if (diff === 0) same++;
          worst = Math.max(worst, diff);
        });
      }
    }
    expect(total).toBeGreaterThan(20000);
    expect(same / total).toBeGreaterThanOrEqual(0.98);
    expect(worst).toBeLessThanOrEqual(1);
  });

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
    setMoroccoServesCalculationForTests(true);
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
