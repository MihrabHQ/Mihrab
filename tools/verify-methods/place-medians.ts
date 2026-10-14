/**
 * Every place's median difference per prayer (ours − theirs, minutes), as
 * a TSV — the raw material for re-placing a town or reading an
 * authority's per-place margin. `verify.ts` keeps only the misplaced
 * ones in its report; this prints them all.
 *
 *   npx tsx tools/verify-methods/place-medians.ts habous > /tmp/habous.tsv
 */
import * as fs from 'node:fs';
import { AUTHORITIES, cityFile } from './authorities';
import { computeLocalAdhanInstants, HORIZON_DIP_DEGREES_PER_SQRT_M } from '../../src/providers/localAdhan';
import { zoneOffsetMinutes } from '../../src/prayer/tableDayCheck';

const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function circ(a: number, b: number): number {
  let d = a - b;
  while (d > 720) d -= 1440;
  while (d <= -720) d += 1440;
  return d;
}
function median(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
export function clockIn(tz: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`;
}
function dayLength(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  return 1440 + zoneOffsetMinutes(tz, new Date(noon + 86_400_000)) - zoneOffsetMinutes(tz, new Date(noon));
}

/** ours − theirs for every row of a place, at the given coordinates. */
export function diffsAt(
  tz: string,
  table: Record<string, string[]>,
  lat: number,
  lon: number,
  method: number | 'auto',
  school: 0 | 1,
  heightM?: number,
  horizonMin?: number,
): Record<(typeof PRAYERS)[number], number[]> {
  const out = Object.fromEntries(PRAYERS.map(p => [p, [] as number[]])) as Record<(typeof PRAYERS)[number], number[]>;
  for (const [date, row] of Object.entries(table)) {
    if (!row || row.length < 7 || dayLength(date, tz) !== 1440) continue;
    const [y, m, d] = date.split('-').map(Number);
    const at = computeLocalAdhanInstants({ latitude: lat, longitude: lon, heightM, horizonMin, date: new Date(y, m - 1, d), calculationMethod: method, school });
    const ours = [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha];
    PRAYERS.forEach((p, k) => {
      if (row[k + 1]) out[p].push(circ(minutes(clockIn(tz, ours[k])), minutes(row[k + 1])));
    });
  }
  return out;
}

if (require.main === module) {
  const a = AUTHORITIES.find(x => x.id === process.argv[2]);
  // DIP_K=0 to see the raw asymmetry a height would have to explain.
  if (process.env.DIP_K !== undefined && a && a.method !== 'auto') {
    (HORIZON_DIP_DEGREES_PER_SQRT_M as Record<number, number>)[a.method] = Number(process.env.DIP_K);
  }
  if (!a) {
    console.error(`which authority? ${AUTHORITIES.map(x => x.id).join(', ')}`);
    process.exit(2);
  }
  console.log(['file', 'place', 'lat', 'lon', 'heightM', 'days', ...PRAYERS].join('\t'));
  for (const p of a.places()) {
    const f = cityFile(a, p);
    if (!fs.existsSync(f)) continue;
    const table = (JSON.parse(fs.readFileSync(f, 'utf8')) as { days: Record<string, string[]> }).days ?? {};
    const d = diffsAt(p.tz, table, p.lat, p.lon, a.method, a.school, p.heightM, p.horizonMin);
    if (!d.Dhuhr.length) continue;
    console.log([p.file, p.name, p.lat, p.lon, p.heightM ?? '', d.Dhuhr.length, ...PRAYERS.map(q => median(d[q]))].join('\t'));
  }
}
