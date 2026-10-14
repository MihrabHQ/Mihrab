/**
 * Indonesia — Kemenag's own method (`indonesiaMethod.ts`), computed at each
 * regency's point and class (`kemenagMethodPoints.json`), held against the
 * ministry's published tables in `data/prayer-times/indonesia`.
 */
jest.unmock('adhan');

import fs from 'fs';
import path from 'path';
import { kemenagTimes } from '../src/providers/indonesiaMethod';
import { kemenagTable } from '../src/providers/nationalTables';
import points from '../src/providers/data/kemenagMethodPoints.json';
import places from '../src/providers/data/kemenagPlaces.json';
import { indonesiaZone } from '../tools/verify-methods/authorities';

const P = points as Record<string, number[]>;
const dir = path.join(__dirname, '..', 'data', 'prayer-times', 'indonesia', 'v1', 'cities');
const OFFSET: Record<string, number> = { 'Asia/Jakarta': 420, 'Asia/Makassar': 480, 'Asia/Jayapura': 540 };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

afterAll(() => kemenagTable.setServesCalculationForTests(true));

describe('Kemenag’s method', () => {
  it('gives the published minute for at least 99.4% of the tables, never a minute further', () => {
    let same = 0;
    let total = 0;
    let worst = 0;
    for (const c of places as { id: number; nameEn?: string }[]) {
      const file = path.join(dir, `${c.id}.json`);
      if (!fs.existsSync(file) || !P[String(c.id)]) continue;
      const province = /\(([^)]*)\)\s*$/.exec(c.nameEn ?? '')?.[1] ?? '';
      const off = OFFSET[indonesiaZone(province)];
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      const [lat, lon, flags] = P[String(c.id)];
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const at = kemenagTimes(lat, lon, y, m - 1, d, { highland: (flags & 1) !== 0, twilightDip: (flags & 2) !== 0 })!;
        [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].forEach((x, i) => {
          const local = ((Math.round(x.getTime() / 60000) + off) % 1440 + 1440) % 1440;
          const diff = Math.abs(((local - toMin(row[i + 1]) + 720) % 1440 + 1440) % 1440 - 720);
          total++;
          if (diff === 0) same++;
          worst = Math.max(worst, diff);
        });
      }
    }
    expect(total).toBeGreaterThan(200000);
    expect(same / total).toBeGreaterThanOrEqual(0.994);
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('the kemenag source serves the calculation', () => {
  it('at the nearest regency, offline, for any date', async () => {
    kemenagTable.setServesCalculationForTests(true);
    const r = await kemenagTable.getTimes({ latitude: -6.2, longitude: 106.85, date: new Date(2031, 2, 3) });
    expect(r.source).toBe('local');
    expect(r.timings.Fajr).toMatch(/^\d\d:\d\d$/);
  });

  it('places Gresik, Seruyan, Selayar and Pekajang where the ministry computes them', () => {
    expect(kemenagTable.nearest(-7.16, 112.62)!.id).toBe(242);
    expect(kemenagTable.nearest(-3.38, 112.55)!.id).toBe(355);
  });
});
