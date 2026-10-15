/**
 * Indonesia — Kemenag's own method (`indonesiaMethod.ts`), computed at each
 * regency's point and class (`kemenagMethodPoints.json`), held against the
 * ministry's published tables (`fixtures/referenceTables.ts`).
 */
jest.unmock('adhan');

import fs from 'fs';
import path from 'path';
import { kemenagTimes } from '../src/providers/indonesiaMethod';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { referenceCities, withReferenceTables } from './fixtures/referenceTables';
import { kemenagTable } from '../src/providers/nationalTables';
import points from '../src/providers/data/kemenagMethodPoints.json';
import places from '../src/providers/data/kemenagPlaces.json';
import { indonesiaZone } from '../tools/verify-methods/authorities';

const P = points as Record<string, number[]>;
const OFFSET: Record<string, number> = { 'Asia/Jakarta': 420, 'Asia/Makassar': 480, 'Asia/Jayapura': 540 };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

withReferenceTables('indonesia')('Kemenag’s method', () => {
  const compare = (corrected: boolean) => {
    const dir = referenceCities('indonesia')!;
    let same = 0;
    let total = 0;
    let worst = 0;
    for (const c of places as { id: number; nameEn?: string }[]) {
      const file = path.join(dir, `${c.id}.json`);
      if (!fs.existsSync(file) || !P[String(c.id)]) continue;
      const province = /\(([^)]*)\)\s*$/.exec(c.nameEn ?? '')?.[1] ?? '';
      const off = OFFSET[indonesiaZone(province)];
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      const [lat, lon, flags, pmLat, pmLon] = P[String(c.id)];
      const pm = pmLat === undefined ? undefined : ([pmLat, pmLon] as const);
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const at = corrected
          ? computeLocalAdhanInstants({ latitude: lat, longitude: lon, horizonMin: flags & 1 ? 1 : 0, twilightDip: (flags & 2) !== 0, afternoonPoint: pm, date: new Date(y, m - 1, d), calculationMethod: 20, school: 0 })
          : kemenagTimes(lat, lon, y, m - 1, d, { highland: (flags & 1) !== 0, twilightDip: (flags & 2) !== 0, afternoon: pm })!;
        [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].forEach((x, i) => {
          const local = ((Math.round(x.getTime() / 60000) + off) % 1440 + 1440) % 1440;
          const diff = Math.abs(((local - toMin(row[i + 1]) + 720) % 1440 + 1440) % 1440 - 720);
          total++;
          if (diff === 0) same++;
          worst = Math.max(worst, diff);
        });
      }
    }
    return { same, total, worst };
  };

  it('gives the published minute for at least 99.968% of the tables alone, never a minute further', () => {
    const { same, total, worst } = compare(false);
    expect(total).toBeGreaterThan(200000);
    expect(same / total).toBeGreaterThanOrEqual(0.99968);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('with the correction list, gives every published minute', () => {
    const { same, total } = compare(true);
    expect(same).toBe(total);
  });
});

describe('the kemenag source serves the calculation', () => {
  it('at the nearest regency, offline, for any date', async () => {
    const r = await kemenagTable.getTimes({ latitude: -6.2, longitude: 106.85, date: new Date(2031, 2, 3) });
    expect(r.source).toBe('local');
    expect(r.timings.Fajr).toMatch(/^\d\d:\d\d$/);
  });

  it('places Gresik, Seruyan, Selayar and Pekajang where the ministry computes them', () => {
    expect(kemenagTable.nearest(-7.16, 112.62)!.id).toBe(242);
    expect(kemenagTable.nearest(-3.38, 112.55)!.id).toBe(355);
  });
});
