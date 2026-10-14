/**
 * Singapore — the Majlis Ugama Islam Singapura (MUIS) timetable, from the
 * government's open-data portal: one table for the whole country, under
 * the Singapore Open Data Licence (free for personal and commercial use).
 *
 *   https://data.gov.sg/datasets/d_a6a206cba471fe04b62dd886ef5eaf22/view
 *
 * The CSV runs from 2024 and is extended a year at a time. Older years
 * print the afternoon times on a 12-hour clock ("01:10" for Zohor) and
 * 2026 on a 24-hour one; both are read.
 *
 *   npx tsx tools/national-tables/muis.ts
 */
import { BuildError, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';

const DATASET = 'd_a6a206cba471fe04b62dd886ef5eaf22';
const API = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/poll-download`;
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
/** The site lists no Imsak; the mosques take ten minutes before Subuh. */
const IMSAK_BEFORE_FAJR = 10;

export const SINGAPORE = { id: 1, name: 'Singapore', nameEn: 'Singapore', lat: 1.3521, lon: 103.8198 };

/** "01:10" in a column that is always afternoon means 13:10. */
function pm(hhmm: string): number {
  const m = minutesOf(hhmm);
  return m < 12 * 60 ? m + 12 * 60 : m;
}

export function parseMuisCsv(csv: string): Record<string, DayMinutes> {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',').map(s => s.trim());
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new BuildError(`column ${name} missing (${head.join(', ')})`);
    return i;
  };
  const c = { date: col('Date'), subuh: col('Subuh'), syuruk: col('Syuruk'), zohor: col('Zohor'), asar: col('Asar'), maghrib: col('Maghrib'), isyak: col('Isyak') };
  const days: Record<string, DayMinutes> = {};
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const date = f[c.date]?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    const fajr = minutesOf(f[c.subuh]);
    days[date] = [fajr - IMSAK_BEFORE_FAJR, fajr, minutesOf(f[c.syuruk]), pm(f[c.zohor]), pm(f[c.asar]), pm(f[c.maghrib]), pm(f[c.isyak])];
  }
  return days;
}

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const poll = (await (await fetch(API, { headers: { 'User-Agent': UA } })).json()) as { data?: { url?: string; status?: string } };
  const url = poll.data?.url;
  if (!url) throw new BuildError(`no download url (${JSON.stringify(poll).slice(0, 200)})`);
  const csv = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const days = parseMuisCsv(csv);
  if (Object.keys(days).length < 300) throw new BuildError(`only ${Object.keys(days).length} days in the CSV`);
  const places: PlaceTable[] = [{ ...SINGAPORE, days }];
  const changes = changedPlaces(places, 'singapore');
  writeTable(places, {
    id: 'muis',
    folder: 'singapore',
    seedFile: 'src/providers/data/muisSeed.json',
    placesFile: 'src/providers/data/muisPlaces.json',
    timezone: 'Asia/Singapore',
    source: `https://data.gov.sg/datasets/${DATASET}/view`,
    warnDays: 45,
    keepPastDays: 7,
    today,
  });
  if (changes.length) console.log(`changed against the previous build:\n  ${changes.join('\n  ')}`);
  emitOutput('changed_places', String(changes.length));
  return 0;
}

if (require.main === module) {
  main()
    .then(c => process.exit(c))
    .catch(e => {
      console.error(e instanceof BuildError ? `refused: ${e.message}` : e);
      process.exit(3);
    });
}
