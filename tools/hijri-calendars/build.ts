/**
 * Writes src/hijri/data/monthStarts.json: the first day of every Hijri month
 * by the Indonesian government's rule (MABIMS) and by Muhammadiyah's (KHGT).
 *
 * Usage:
 *   (cd tools/hijri-calendars && npm install --ignore-scripts)
 *   npx tsx tools/hijri-calendars/build.ts
 *
 * KHGT is Muhammadiyah's OWN published calendar (khgt.muhammadiyah.or.id)
 * for every year it has published — 1447–1492 AH when written — and the
 * computed rule only after that. Every month the two disagree on is printed,
 * so a drift in the rule's reading shows up here rather than in the app.
 *
 * MABIMS has no published table to read (Kemenag announces month by month),
 * so it is computed; announced corrections go in the server overrides file
 * (data/hijri/v1/overrides.json), not here.
 *
 * Format, per calendar: the Hijri year and month of the first entry, the
 * Gregorian date it begins on, and every month's length after it as one
 * character — '9' for 29 days, '0' for 30.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabularGregorianToHijri } from '../../src/hijri/convert';
import { addDaysYmd, conjunctions, khgtStart, mabimsStart, type Ymd } from './criteria';
import { fetchOfficialKhgt, KHGT_SITE, type OfficialStart } from './khgtOfficial';

const LAST_YEAR = 1500;

type Start = { year: number; month: number; start: Ymd };
type Table = { year: number; month: number; start: Ymd; lengths: string };

/** The tabular calendar's name for the month around `start` — used only to
 *  NUMBER the months; the rule decides on which day each begins. */
function tabularMonth(start: Ymd): { year: number; month: number } {
  const d = new Date(Date.parse(`${addDaysYmd(start, 14)}T12:00:00Z`));
  const h = tabularGregorianToHijri(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return { year: h.year, month: h.month };
}

const next = (s: { year: number; month: number }) =>
  s.month === 12 ? { year: s.year + 1, month: 1 } : { year: s.year, month: s.month + 1 };

function compute(name: string, firstYear: number, fromIso: string, startOf: (conj: number) => Ymd): Start[] {
  const conj = conjunctions(Date.parse(fromIso), (LAST_YEAR - firstYear + 2) * 13);
  const starts: Start[] = [];
  for (const c of conj) {
    const s = startOf(c);
    const { year, month } = tabularMonth(s);
    if (year < firstYear) continue;
    const prev = starts[starts.length - 1];
    if (prev) {
      const want = next(prev);
      if (year !== want.year || month !== want.month) {
        throw new Error(`${name}: ${s} numbered ${year}-${month}, expected ${want.year}-${want.month}`);
      }
    }
    starts.push({ year, month, start: s });
    // One past the last month, so its length is known.
    if (year > LAST_YEAR) break;
    process.stderr.write(`\r${name} ${year}-${String(month).padStart(2, '0')} ${s}   `);
  }
  process.stderr.write('\n');
  return starts;
}

function toTable(name: string, starts: Start[]): Table {
  let lengths = '';
  for (let i = 1; i < starts.length; i++) {
    const want = next(starts[i - 1]);
    if (starts[i].year !== want.year || starts[i].month !== want.month) {
      throw new Error(`${name}: ${starts[i].year}-${starts[i].month} follows ${starts[i - 1].year}-${starts[i - 1].month}`);
    }
    const days = (Date.parse(starts[i].start) - Date.parse(starts[i - 1].start)) / 86_400_000;
    if (days !== 29 && days !== 30) throw new Error(`${name}: ${starts[i - 1].start} is ${days} days long`);
    lengths += days === 29 ? '9' : '0';
  }
  return { year: starts[0].year, month: starts[0].month, start: starts[0].start, lengths };
}

async function main() {
  // Kemenag and NU: MABIMS 3° / 6.4°, adopted from 1444 AH (2022).
  const mabims = compute('mabims', 1444, '2022-06-15T00:00:00Z', c => mabimsStart(c, 'geo'));
  // Too close to call: a quarter of a degree either way, or the other
  // reading of the altitude, gives another day. The sidang isbat decides
  // these by sighting, and the reminder says so.
  const mabimsUncertain: string[] = [];
  {
    const conj = conjunctions(Date.parse('2022-06-15T00:00:00Z'), (LAST_YEAR - 1444 + 2) * 13);
    const at = new Map(mabims.map(m => [m.start, m]));
    for (const c of conj) {
      const s = mabimsStart(c, 'geo');
      const m = at.get(s);
      if (!m) continue;
      const alt = [mabimsStart(c, 'geo', 0.25), mabimsStart(c, 'geo', -0.25), mabimsStart(c, 'topo')];
      if (alt.some(x => x !== s)) mabimsUncertain.push(`${m.year}-${String(m.month).padStart(2, '0')}`);
    }
  }
  console.log(`MABIMS: ${mabimsUncertain.length} of ${mabims.length} months too close to call`);

  // Muhammadiyah: its own calendar, then the rule past its last year.
  const official: OfficialStart[] = await fetchOfficialKhgt(s => process.stderr.write(`${s}\n`));
  const computed = compute('khgt', 1447, '2025-06-01T00:00:00Z', c => khgtStart(c, 'geo'));
  const key = (s: { year: number; month: number }) => s.year * 100 + s.month;
  const byKey = new Map(computed.map(s => [key(s), s.start]));
  const disagreements = official
    .filter(o => byKey.has(key(o)) && byKey.get(key(o)) !== o.start)
    .map(o => `${o.year}-${String(o.month).padStart(2, '0')}: official ${o.start}, rule ${byKey.get(key(o))}`);
  console.log(`KHGT: ${official.length} official months, rule disagrees on ${disagreements.length}`);
  disagreements.forEach(d => console.log(`  ${d}`));
  const last = official[official.length - 1];
  const khgt: Start[] = [...official, ...computed.filter(c => key(c) > key(last))];
  // The seam: the official last month must still be 29 or 30 days long
  // against the rule's next start. If not, end at the official calendar.
  const seam = khgt[official.length];
  const seamDays = seam ? (Date.parse(seam.start) - Date.parse(last.start)) / 86_400_000 : 0;
  const khgtStarts = seamDays === 29 || seamDays === 30 ? khgt : official;

  const out = {
    generatedBy: 'tools/hijri-calendars/build.ts',
    mabims: toTable('mabims', mabims),
    mabimsUncertain,
    khgt: toTable('khgt', khgtStarts),
    khgtOfficialThrough: `${last.year}-${String(last.month).padStart(2, '0')}`,
    khgtSource: KHGT_SITE,
  };
  const path = join(__dirname, '../../src/hijri/data/monthStarts.json');
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${path}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
