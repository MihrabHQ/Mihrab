/**
 * One place's mean difference per prayer, by month (ours − theirs,
 * minutes): where in the year a method goes wrong.
 *
 *   npx tsx tools/verify-methods/by-month.ts ifis stockholm.json
 */
import * as fs from 'node:fs';
import { AUTHORITIES, cityFile } from './authorities';
import { computeLocalAdhanInstants } from '../../src/providers/localAdhan';
import { clockIn } from './place-medians';

const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const a = AUTHORITIES.find(x => x.id === process.argv[2])!;
const place = a.places().find(p => p.file === process.argv[3])!;
const table = (JSON.parse(fs.readFileSync(cityFile(a, place), 'utf8')) as { days: Record<string, string[]> }).days;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const months = new Map<string, number[][]>();
for (const [date, row] of Object.entries(table)) {
  const [y, m, d] = date.split('-').map(Number);
  const at = computeLocalAdhanInstants({ latitude: place.lat, longitude: place.lon, heightM: place.heightM, horizonMin: place.horizonMin, date: new Date(y, m - 1, d), calculationMethod: a.method, school: a.school });
  const ours = [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha];
  if (ours.some(t => !Number.isFinite(t.getTime()))) continue;
  // BY_DAY=2027-08-20:2027-09-20 prints days in the range instead of months.
  const range = process.env.BY_DAY?.split(':');
  if (range && (date < range[0] || date > range[1])) continue;
  const key = range ? date : date.slice(0, 7);
  if (!months.has(key)) months.set(key, PRAYERS.map(() => []));
  PRAYERS.forEach((p, k) => {
    let diff = minutes(clockIn(place.tz, ours[k])) - minutes(row[k + 1]);
    if (diff > 720) diff -= 1440;
    if (diff <= -720) diff += 1440;
    months.get(key)![k].push(diff);
  });
}
const mean = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
console.log(`${place.name}  ${place.lat}, ${place.lon}`);
console.log(['month', ...PRAYERS].join('\t'));
for (const [k, v] of [...months].sort()) console.log([k, ...v.map(mean)].join('\t'));
