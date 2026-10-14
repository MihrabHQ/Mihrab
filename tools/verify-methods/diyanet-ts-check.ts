// The app's Congress method against Diyanet's own tables (2024-2027), every cached place.
// npx tsx tools/verify-methods/diyanet-ts-check.ts [--list]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { congressTimes } from '../../src/providers/congressMethod';

const CACHE = process.env.DIYANET_TABLES ?? path.join(os.homedir(), '.cache/mihrab/diyanet');
const snapped = JSON.parse(fs.readFileSync(path.join(__dirname, 'diyanet-sweden-points.json'), 'utf8')) as Record<
  string,
  { name: string; slug: string | null; lat: number; lon: number }
>;
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const toMinute = (d: Date) => new Date(Math.round(d.getTime() / 60_000) * 60_000);
let total = 0;
let misses = 0;
let ifisTotal = 0;
let ifisMisses = 0;
const per: Record<string, number> = {};
for (const [iid, place] of Object.entries(snapped)) {
  for (let y = 2024; y <= 2027; y++) {
    const file = path.join(CACHE, "raw", `${iid}_${y}.json`);
    if (!fs.existsSync(file)) continue;
    for (const r of JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>[]) {
      const [d, m, yy] = r.gregorianDateShort.split('.').map(Number);
      if (m === 2 && d === 29) continue;
      const t = congressTimes(place.lat, place.lon, yy, m - 1, d);
      for (const k of keys) {
        const ours = fmt.format(toMinute(t[k]));
        total++;
        if (place.slug) ifisTotal++;
        if (ours !== r[k]) {
          misses++;
          per[k] = (per[k] ?? 0) + 1;
          if (place.slug) ifisMisses++;
          if (process.argv.includes('--list')) console.log(place.name, r.gregorianDateShort, k, 'ours', ours, 'theirs', r[k]);
        }
      }
    }
  }
}
console.log(`all places: ${misses} of ${total} times off (${((100 * misses) / total).toFixed(4)} %)`, per);
console.log(`Islamiska Förbundet's cities: ${ifisMisses} of ${ifisTotal} (${((100 * ifisMisses) / ifisTotal).toFixed(4)} %)`);
