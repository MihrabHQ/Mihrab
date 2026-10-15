/**
 * Calculate, then check against the authority.
 *
 * For every table the builders fetch, compute each place's days with the
 * method the phone uses for that authority and compare, minute by minute.
 * Writes data/prayer-times/verification/<id>.json and summary.md, prints
 * the summary, and exits 4 when an authority that is meant to match does
 * not — the workflow then opens (or updates) that authority's issue.
 *
 *   npx tsx tools/verify-methods/verify.ts            # all
 *   npx tsx tools/verify-methods/verify.ts jakim diyanet # some
 *
 * The clock: the app formats times in the phone's zone; here the same
 * instants are formatted in the authority's, whatever zone this runs in.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AUTHORITIES, cityFile, ROOT, type Authority } from './authorities';
import { computeLocalAdhanInstants } from '../../src/providers/localAdhan';
import { isPreviousYearsRow } from '../../src/prayer/swedenYearCheck';
import { zoneOffsetMinutes } from '../../src/prayer/tableDayCheck';

const OUT_DIR = path.join(ROOT, 'data/prayer-times/verification');
const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
type Prayer = (typeof PRAYERS)[number];

type CityDays = Record<string, string[]>; // [Imsak, Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha]

export type Mismatch = {
  place: string;
  date: string;
  prayer: Prayer;
  theirs: string;
  ours: string;
  /** ours − theirs, minutes. */
  diff: number;
};

export type PrayerStats = {
  times: number;
  within: number;
  /** diff → count, as "−2", "0", "+1". */
  histogram: Record<string, number>;
  maxAbs: number;
  meanDiff: number;
};

export type PlaceStats = {
  place: string;
  days: number;
  /** Median of ours − theirs per prayer, minutes. */
  median: Record<Prayer, number>;
  maxAbs: number;
  /**
   * The place disagrees by a constant, not by a method: Dhuhr (longitude)
   * or the day's length (latitude) is off at every date. Fix the
   * coordinate, not the angles.
   */
  misplaced: boolean;
};

/** A difference that is understood and not to be raised again. */
export type Accepted = {
  authority: string;
  place?: string;
  prayer?: Prayer;
  from?: string;
  to?: string;
  /** Still raise a row further off than this. */
  maxAbs?: number;
  note: string;
};

export type Report = {
  id: string;
  name: string;
  method: number | 'auto';
  toleranceMin: number;
  builtAt: string;
  tableBuiltAt: string | null;
  places: number;
  placesMissing: number;
  days: number;
  /** The first and last date compared. */
  from: string | null;
  to: string | null;
  /** Over the places whose coordinates agree with the authority's. */
  times: number;
  within: number;
  outsideShare: number;
  maxAbs: number;
  perPrayer: Record<Prayer, PrayerStats>;
  /** Places that disagree by a constant — ours is not where theirs is. */
  misplaced: PlaceStats[];
  /** Rows set aside by accepted.json. */
  accepted: number;
  /** Imsak as the table prints it, minutes before its Fajr (mode). */
  imsakBeforeFajr: number | null;
  /**
   * Rows that repeat the previous year's figures for the same date — the
   * site serving last year's table until the new one is out — compared as
   * that year, and the earliest such date.
   */
  copiedRows: number;
  copiedFrom: string | null;
  /** Rows set aside because the republished table differs from the authority's original. */
  sourceFaults: number;
  sourceFaultPlaces: string[];
  alarm: boolean;
  alarmReasons: string[];
  /** The worst rows, largest first — enough to see what kind of wrong. */
  worst: Mismatch[];
};

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** a − b on a 24-hour circle, in (−720, 720]. */
function circularDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 720) d -= 1440;
  while (d <= -720) d += 1440;
  return d;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A calendar day's length in `tz`, minutes — 23 h or 25 h on a clock change. */
function dayLengthMinutes(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  return 1440 + zoneOffsetMinutes(tz, new Date(noon + 86_400_000)) - zoneOffsetMinutes(tz, new Date(noon));
}

/** The instant on the authority's clock, "HH:MM" (whole minutes, as the app prints them). */
function clockIn(tz: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`;
}

function emptyStats(): PrayerStats {
  return { times: 0, within: 0, histogram: {}, maxAbs: 0, meanDiff: 0 };
}

const ACCEPTED_PATH = path.join(__dirname, 'accepted.json');
function loadAccepted(): Accepted[] {
  if (!fs.existsSync(ACCEPTED_PATH)) return [];
  return JSON.parse(fs.readFileSync(ACCEPTED_PATH, 'utf8')) as Accepted[];
}
/** An entry naming the place and nothing narrower: the whole place is understood. */
function placeAccepted(list: Accepted[], a: Authority, place: string): Accepted | undefined {
  return list.find(x => x.authority === a.id && x.place === place && !x.prayer && !x.from && !x.to && x.maxAbs == null);
}

function isAccepted(list: Accepted[], a: Authority, m: Mismatch): boolean {
  return list.some(
    x =>
      x.authority === a.id &&
      (!x.place || x.place === m.place) &&
      (!x.prayer || x.prayer === m.prayer) &&
      (!x.from || m.date >= x.from) &&
      (!x.to || m.date <= x.to) &&
      (x.maxAbs == null || Math.abs(m.diff) <= x.maxAbs),
  );
}

/** Dhuhr off by this at every date: the longitude is not theirs. */
const MISPLACED_DHUHR_MIN = 3;
/** Sunrise and Maghrib off in opposite directions by this: the latitude is not theirs. */
const MISPLACED_DAYLENGTH_MIN = 4;

export function verifyAuthority(a: Authority, accepted: Accepted[]): Report {
  const places = a.places();
  const imsakOffsets: Record<string, number> = {};
  let placesMissing = 0;
  let days = 0;
  let from: string | null = null;
  let to: string | null = null;
  let tableBuiltAt: string | null = null;

  const indexPath = path.join(a.root ?? path.join(ROOT, 'data/prayer-times', a.folder), 'v1', 'index.json');
  if (fs.existsSync(indexPath)) {
    tableBuiltAt = (JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { builtAt?: string }).builtAt ?? null;
  }

  // Every row's difference, by place — the method's statistics are drawn
  // only from places whose coordinates agree with the authority's.
  type Row = { date: string; prayer: Prayer; theirs: string; ours: string; diff: number };
  const byPlace = new Map<string, Row[]>();
  let copiedRows = 0;
  let copiedFrom: string | null = null;
  let sourceFaults = 0;
  const sourceFaultPlaces = new Set<string>();

  for (const place of places) {
    const file = cityFile(a, place);
    if (!fs.existsSync(file)) {
      placesMissing++;
      continue;
    }
    const table = (JSON.parse(fs.readFileSync(file, 'utf8')) as { days: CityDays }).days ?? {};
    const original = a.original ? a.original(place) : null;
    const rows: Row[] = [];
    for (const [date, row] of Object.entries(table)) {
      if (!row || row.length < 7) continue;
      // The republisher's fault, not the method's: its row differs from the original's.
      const confirmed = !!(original && original[date]);
      if (confirmed && original![date].slice(1).some((t, i) => t !== row[i + 1])) {
        sourceFaults++;
        sourceFaultPlaces.add(place.name);
        continue;
      }
      if (dayLengthMinutes(date, place.tz) !== 1440) continue; // a clock change: the table's own convention, not the method's
      let [y, m, d] = date.split('-').map(Number);
      // The previous year's figures served for the date: the site has not
      // published this year yet. Compared as that year — the method
      // computes the year asked for, and the tables will move when the
      // authority's do. (The builder drops such rows from now on; the
      // check here is for what was stored before it did.)
      // (A row the original confirms is that year's, whatever it resembles.)
      if (a.copiedYears && !confirmed && isPreviousYearsRow(date, row[1], row[6], place.lat, place.lon, place.tz)) {
        copiedRows++;
        if (!copiedFrom || date < copiedFrom) copiedFrom = date;
        y -= 1;
      }
      const at = computeLocalAdhanInstants({
        latitude: place.lat,
        longitude: place.lon,
        heightM: place.heightM,
        horizonMin: place.horizonMin,
        horizonDipDeg: place.horizonDipDeg,
        twilightDip: place.twilightDip,
        jakimZone: place.jakimZone,
        date: new Date(y, m - 1, d),
        calculationMethod: a.method,
        school: a.school,
      });
      if ([at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].some(t => !Number.isFinite(t.getTime()))) continue;
      const ours: Record<Prayer, string> = {
        Fajr: clockIn(place.tz, at.fajr),
        Sunrise: clockIn(place.tz, at.sunrise),
        Dhuhr: clockIn(place.tz, at.dhuhr),
        Asr: clockIn(place.tz, at.asr),
        Maghrib: clockIn(place.tz, at.maghrib),
        Isha: clockIn(place.tz, at.isha),
      };
      days++;
      if (!from || date < from) from = date;
      if (!to || date > to) to = date;
      const imsakGap = minutes(row[1]) - minutes(row[0]);
      if (Number.isFinite(imsakGap)) imsakOffsets[imsakGap] = (imsakOffsets[imsakGap] ?? 0) + 1;
      PRAYERS.forEach((prayer, k) => {
        const theirs = row[k + 1];
        const mine = ours[prayer];
        if (!theirs || !mine) return;
        rows.push({ date, prayer, theirs, ours: mine, diff: circularDiff(minutes(mine), minutes(theirs)) });
      });
    }
    if (rows.length) byPlace.set(place.name, rows);
  }

  const perPrayer = Object.fromEntries(PRAYERS.map(p => [p, emptyStats()])) as Record<Prayer, PrayerStats>;
  const sums = Object.fromEntries(PRAYERS.map(p => [p, 0])) as Record<Prayer, number>;
  const mismatches: Mismatch[] = [];
  const misplaced: PlaceStats[] = [];
  let acceptedCount = 0;

  for (const [name, rows] of byPlace) {
    const med = Object.fromEntries(
      PRAYERS.map(p => [p, median(rows.filter(r => r.prayer === p).map(r => r.diff))]),
    ) as Record<Prayer, number>;
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.diff)));
    const stats: PlaceStats = {
      place: name,
      days: rows.length / PRAYERS.length,
      median: med,
      maxAbs,
      // Only a fitted method can tell a place from a method: against the
      // automatic fallback every place is off by the authority's own margins.
      misplaced:
        a.method !== 'auto' &&
        (Math.abs(med.Dhuhr) >= MISPLACED_DHUHR_MIN ||
          Math.abs(med.Sunrise - med.Maghrib) >= MISPLACED_DAYLENGTH_MIN),
    };
    if (stats.misplaced) {
      if (placeAccepted(accepted, a, name)) {
        acceptedCount += rows.length;
        continue;
      }
      misplaced.push(stats);
      continue;
    }
    for (const r of rows) {
      const s = perPrayer[r.prayer];
      s.times++;
      sums[r.prayer] += r.diff;
      const key = r.diff > 0 ? `+${r.diff}` : String(r.diff);
      s.histogram[key] = (s.histogram[key] ?? 0) + 1;
      if (Math.abs(r.diff) > s.maxAbs) s.maxAbs = Math.abs(r.diff);
      if (Math.abs(r.diff) <= a.toleranceMin) {
        s.within++;
      } else {
        const m: Mismatch = { place: name, ...r };
        if (isAccepted(accepted, a, m)) {
          acceptedCount++;
          s.within++; // understood: counts as agreed
        } else {
          mismatches.push(m);
        }
      }
    }
  }
  misplaced.sort((x, y) => Math.abs(y.median.Dhuhr) - Math.abs(x.median.Dhuhr));

  let times = 0;
  let within = 0;
  let maxAbs = 0;
  for (const p of PRAYERS) {
    const s = perPrayer[p];
    s.meanDiff = s.times ? Math.round((sums[p] / s.times) * 100) / 100 : 0;
    times += s.times;
    within += s.within;
  }
  for (const m of mismatches) if (Math.abs(m.diff) > maxAbs) maxAbs = Math.abs(m.diff);
  const outsideShare = times ? (times - within) / times : 0;
  mismatches.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.date.localeCompare(y.date));

  const reasons: string[] = [];
  if (a.alarm) {
    if (times === 0 && misplaced.length === 0) reasons.push('no table to compare against');
    if (outsideShare > a.maxOutsideShare) {
      reasons.push(
        `${(outsideShare * 100).toFixed(1)}% of times are more than ${a.toleranceMin} min from the table ` +
          `(allowed ${(a.maxOutsideShare * 100).toFixed(0)}%) — the method`,
      );
    }
    if (maxAbs > a.hardMaxMin) reasons.push(`a time is ${maxAbs} min off (allowed ${a.hardMaxMin})`);
    if (misplaced.length) {
      reasons.push(
        `${misplaced.length} place(s) disagree by a constant at every date — coordinates or a per-place margin, not the angles`,
      );
    }
    if (placesMissing > 0 && placesMissing * 2 > places.length) {
      reasons.push(`${placesMissing} of ${places.length} places have no table file`);
    }
  }

  const imsakMode = Object.entries(imsakOffsets).sort((x, y) => y[1] - x[1])[0];
  return {
    id: a.id,
    name: a.name,
    method: a.method,
    toleranceMin: a.toleranceMin,
    builtAt: new Date().toISOString(),
    tableBuiltAt,
    places: places.length,
    placesMissing,
    days,
    from,
    to,
    times,
    within,
    outsideShare: Math.round(outsideShare * 10000) / 10000,
    maxAbs,
    perPrayer,
    misplaced,
    accepted: acceptedCount,
    imsakBeforeFajr: imsakMode ? Number(imsakMode[0]) : null,
    copiedRows,
    copiedFrom,
    sourceFaults,
    sourceFaultPlaces: [...sourceFaultPlaces].sort(),
    alarm: reasons.length > 0,
    alarmReasons: reasons,
    worst: mismatches.slice(0, 60),
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** One authority's lines of the summary (Markdown; also the issue body). */
export function describe(r: Report): string {
  const lines: string[] = [];
  const status = r.alarm ? '❌' : r.method === 'auto' ? '➖' : '✅';
  lines.push(`### ${status} ${r.name}`);
  lines.push('');
  lines.push(
    `Method ${r.method === 'auto' ? '— none fitted yet (the automatic fallback is shown)' : r.method} · ` +
      `${r.places - r.placesMissing} of ${r.places} places · ${r.days} place-days` +
      (r.from ? ` (${r.from} → ${r.to})` : '') +
      ` · table built ${r.tableBuiltAt ? r.tableBuiltAt.slice(0, 10) : '?'}`,
  );
  lines.push('');
  lines.push(
    `**${pct(r.times ? r.within / r.times : 0)} within ${r.toleranceMin} min** over the well-placed places, ` +
      `${r.times - r.within} of ${r.times} outside, worst ${r.maxAbs} min` +
      (r.imsakBeforeFajr != null ? ` · Imsak printed ${r.imsakBeforeFajr} min before Fajr` : ''),
  );
  if (r.sourceFaults) {
    lines.push('');
    lines.push(
      `${r.sourceFaults} rows set aside where the site's table differs from the original authority's ` +
        `(${r.sourceFaultPlaces.length} places: ${r.sourceFaultPlaces.slice(0, 8).join(', ')}` +
        `${r.sourceFaultPlaces.length > 8 ? ', …' : ''}) — the site's fault, not the method's.`,
    );
  }
  if (r.copiedRows) {
    lines.push('');
    lines.push(
      `${r.copiedRows} rows from ${r.copiedFrom} on repeat the previous year's figures for the date — the site has not ` +
        `published that year yet — and are compared as the previous year.`,
    );
  }
  lines.push('');
  lines.push('| | within | mean | worst | distribution (minutes, ours − theirs) |');
  lines.push('|---|---|---|---|---|');
  for (const p of PRAYERS) {
    const s = r.perPrayer[p];
    const dist = Object.entries(s.histogram)
      .sort((x, y) => Number(x[0]) - Number(y[0]))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(`| ${p} | ${pct(s.times ? s.within / s.times : 0)} | ${s.meanDiff > 0 ? '+' : ''}${s.meanDiff} | ${s.maxAbs} | ${dist} |`);
  }
  if (r.accepted) {
    lines.push('');
    lines.push(`${r.accepted} row(s) set aside as understood (tools/verify-methods/accepted.json).`);
  }
  if (r.misplaced.length) {
    lines.push('');
    lines.push(
      `**${r.misplaced.length} place(s) off by a constant at every date** — not the angles: our coordinates are not ` +
        "the authority's, or the authority gives that place its own margin (a horizon above or below the plain). " +
        'Dhuhr says the longitude (4 min per degree); sunrise against Maghrib, the latitude or the height:',
    );
    lines.push('');
    lines.push('| place | days | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const m of r.misplaced.slice(0, 40)) {
      const f = (n: number) => (n > 0 ? `+${n}` : String(n));
      lines.push(
        `| ${m.place} | ${m.days} | ${f(m.median.Fajr)} | ${f(m.median.Sunrise)} | ${f(m.median.Dhuhr)} | ` +
          `${f(m.median.Asr)} | ${f(m.median.Maghrib)} | ${f(m.median.Isha)} |`,
      );
    }
    if (r.misplaced.length > 40) lines.push(`| … and ${r.misplaced.length - 40} more | | | | | | | |`);
  }
  if (r.alarmReasons.length) {
    lines.push('');
    lines.push('**Why this is raised:** ' + r.alarmReasons.join('; ') + '.');
  }
  if (r.worst.length) {
    lines.push('');
    lines.push('<details><summary>The rows furthest off</summary>');
    lines.push('');
    lines.push('| place | date | prayer | table | ours | diff |');
    lines.push('|---|---|---|---|---|---|');
    for (const w of r.worst.slice(0, 25)) {
      lines.push(`| ${w.place} | ${w.date} | ${w.prayer} | ${w.theirs} | ${w.ours} | ${w.diff > 0 ? '+' : ''}${w.diff} |`);
    }
    lines.push('');
    lines.push('</details>');
  }
  return lines.join('\n');
}

function emitOutput(key: string, value: string): void {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, `${key}=${value}\n`);
}

export function main(argv: string[]): number {
  const wanted = new Set(argv);
  const list = wanted.size ? AUTHORITIES.filter(a => wanted.has(a.id)) : AUTHORITIES;
  const unknown = [...wanted].filter(id => !AUTHORITIES.some(a => a.id === id));
  if (unknown.length) {
    console.error(`unknown authority: ${unknown.join(', ')} (know ${AUTHORITIES.map(a => a.id).join(', ')})`);
    return 2;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reports: Report[] = [];
  const accepted = loadAccepted();
  for (const a of list) {
    // A table the check downloads rather than commits (Diyanet's) and has not: nothing to say.
    if (a.root && !fs.existsSync(path.join(a.root, 'v1', 'cities'))) {
      console.warn(`${a.id}: no tables at ${a.root} — skipped (tools/verify-methods/diyanet-fetch.py)`);
      continue;
    }
    const r = verifyAuthority(a, accepted);
    reports.push(r);
    fs.writeFileSync(path.join(OUT_DIR, `${a.id}.json`), JSON.stringify(r, null, 1) + '\n');
    // The issue body for this authority alone, for the workflow to post.
    fs.writeFileSync(path.join(OUT_DIR, `${a.id}.md`), describe(r) + '\n');
  }
  const summary = [
    '# The app’s methods against the authorities’ tables',
    '',
    `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by tools/verify-methods. ` +
      'Each table the builders fetch, compared day by day with what the phone computes for that authority ' +
      '— the tables are the check on the calculation, not the thing distributed.',
    '',
    ...reports.map(describe),
    '',
  ].join('\n\n');
  fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), summary);
  console.log(summary);

  const raised = reports.filter(r => r.alarm);
  emitOutput('raised', raised.map(r => r.id).join(' '));
  emitOutput('all', reports.map(r => r.id).join(' '));
  if (raised.length) {
    console.error(`\n${raised.length} authority/ies off: ${raised.map(r => r.id).join(', ')}`);
    return 4;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
