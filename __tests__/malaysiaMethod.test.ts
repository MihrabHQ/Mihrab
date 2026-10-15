/**
 * Malaysia — JAKIM's zone times (`malaysiaMethod.ts`), held against the
 * e-Solat tables in `data/prayer-times/malaysia`, and used past the window.
 */
import fs from 'fs';
import path from 'path';
import { jakimTimes } from '../src/providers/malaysiaMethod';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';

const dir = path.join(__dirname, '..', 'data', 'prayer-times', 'malaysia', 'v1', 'cities');
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

describe('JAKIM’s zone times', () => {
  it('give the printed minute for at least 94% of the tables, all but a summit’s Maghrib within one', () => {
    let same = 0;
    let total = 0;
    let within1 = 0;
    for (let zone = 1; zone <= 59; zone++) {
      const file = path.join(dir, `${zone}.json`);
      if (!fs.existsSync(file)) continue;
      const days = JSON.parse(fs.readFileSync(file, 'utf8')).days as Record<string, string[]>;
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const t = jakimTimes(zone, y, m - 1, d)!;
        [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].forEach((x, i) => {
          const ours = (((Math.round(x.getTime() / 60_000) + 480) % 1440) + 1440) % 1440;
          let diff = Math.abs(ours - toMin(row[i + 1]));
          if (diff > 720) diff = 1440 - diff;
          total++;
          if (diff === 0) same++;
          if (diff <= 1) within1++;
        });
      }
    }
    expect(total).toBeGreaterThan(30000);
    expect(same / total).toBeGreaterThan(0.94);
    // Gunung Kinabalu's Maghrib is printed eight or nine minutes late on 31
    // days (tools/verify-methods/accepted.json); everything else within one.
    expect(within1 / total).toBeGreaterThan(0.998);
  });

  it('is what method 17 computes for a zone', () => {
    const at = computeLocalAdhanInstants({ latitude: 3.14, longitude: 101.69, date: new Date(2027, 0, 15), calculationMethod: 17, school: 0, jakimZone: 58 });
    const z = jakimTimes(58, 2027, 0, 15)!;
    expect(at.fajr.getTime()).toBe(z.fajr.getTime());
    expect(at.isha.getTime()).toBe(z.isha.getTime());
  });
});
