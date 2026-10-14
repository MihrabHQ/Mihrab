// Compare the TypeScript Congress method with a city's table, day by day.
// npx tsx tools/verify-methods/congress-ts-check.ts stockholm 59.3333 18.0333
import fs from 'node:fs';
import path from 'node:path';
import { congressTimes, congressYearInfo } from '../../src/providers/congressMethod';

const [slug, latS, lonS] = process.argv.slice(2);
const lat = Number(latS);
const lon = Number(lonS);
const table = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/prayer-times/v1/cities', `${slug}.json`), 'utf8'),
).days as Record<string, string[]>;
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const toMinute = (d: Date) => new Date(Math.round(d.getTime() / 60_000) * 60_000);
const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const exact = [0, 0, 0, 0, 0, 0];
const within = [0, 0, 0, 0, 0, 0];
let n = 0;
for (const date of Object.keys(table).sort()) {
  const [y, m, d] = date.split('-').map(Number);
  if (m === 2 && d === 29) continue;
  // the 2027 rows are the site's copies of 2026: compute them as 2026
  const year = 2026;
  const t = congressTimes(lat, lon, year, m - 1, d);
  const theirs = table[date].slice(1);
  n += 1;
  keys.forEach((k, i) => {
    const ours = fmt.format(toMinute(t[k]));
    const [oh, om] = ours.split(':').map(Number);
    const [th, tm] = theirs[i].split(':').map(Number);
    let diff = oh * 60 + om - (th * 60 + tm);
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    if (diff === 0) exact[i] += 1;
    if (Math.abs(diff) <= 1) within[i] += 1;
    else if (process.argv.includes('--misses')) console.log(date, k, ours, theirs[i], diff);
  });
}
console.log(slug, 'exact', keys.map((k, i) => `${k} ${((100 * exact[i]) / n).toFixed(1)}%`).join(' '), '| within 1:', within.map((w) => `${((100 * w) / n).toFixed(1)}%`).join(' '));
console.log(congressYearInfo(lat, lon, 2026));
