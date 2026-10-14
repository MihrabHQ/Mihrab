/**
 * Which horizon dip, degrees per √metre, makes an authority's sunrise
 * and Maghrib agree with the app's across its hill towns? Scans k and
 * prints, for each, the share of sunrise+Maghrib rows within a minute
 * and the mean of the residual — pick the k with the best share and a
 * mean near zero, and set it in HORIZON_DIP_DEGREES_PER_SQRT_M.
 *
 *   npx tsx tools/verify-methods/fit-dip.ts habous
 */
import * as fs from 'node:fs';
import { AUTHORITIES, cityFile } from './authorities';
import { HORIZON_DIP_DEGREES_PER_SQRT_M } from '../../src/providers/localAdhan';
import { diffsAt } from './place-medians';

const a = AUTHORITIES.find(x => x.id === process.argv[2]);
if (!a || a.method === 'auto') {
  console.error('which fitted authority?');
  process.exit(2);
}
const method = a.method as number;
const tables = a
  .places()
  .filter(p => p.heightM && p.heightM > 0 && fs.existsSync(cityFile(a, p)))
  .map(p => ({ p, table: (JSON.parse(fs.readFileSync(cityFile(a, p), 'utf8')) as { days: Record<string, string[]> }).days }));
console.log(`${tables.length} places with a height`);
const dict = HORIZON_DIP_DEGREES_PER_SQRT_M as Record<number, number>;
const saved = dict[method];
console.log('k\twithin 1 min\tmean sunrise\tmean maghrib');
for (const k of [0, 0.01, 0.015, 0.018, 0.02, 0.022, 0.025, 0.0293, 0.0347, 0.04]) {
  dict[method] = k;
  let n = 0;
  let within = 0;
  let sumS = 0;
  let sumM = 0;
  for (const { p, table } of tables) {
    const d = diffsAt(p.tz, table, p.lat, p.lon, method, a.school, p.heightM);
    for (const x of d.Sunrise) {
      n++;
      if (Math.abs(x) <= 1) within++;
      sumS += x;
    }
    for (const x of d.Maghrib) {
      n++;
      if (Math.abs(x) <= 1) within++;
      sumM += x;
    }
  }
  console.log(`${k}\t${((within / n) * 100).toFixed(1)}%\t${(sumS / (n / 2)).toFixed(2)}\t${(sumM / (n / 2)).toFixed(2)}`);
}
dict[method] = saved;
