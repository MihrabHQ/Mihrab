/**
 * Build the Algerian prayer-times dataset from the Ministry's own app.
 *
 * Same output shape as `tools/habous-dataset/build.ts` — per-city JSON under
 * `data/prayer-times/algeria/v1`, an `index.json` the app polls, and a seed
 * bundled into the app — but a very different source.
 *
 * ── WHERE THE TIMES COME FROM ─────────────────────────────────────────
 *
 * The Ministry of Religious Affairs and Wakfs publishes its timetable two
 * ways: scanned PDFs on marw.dz, and a database inside its official app,
 * "أذان الجزائر الرسمي" (com.issolah.marwalarm). The database is the one to
 * use. It holds every listed city, every day, in plain minutes — no OCR —
 * and each city is worked out on its own each day, where the PDFs give a
 * regional centre and monthly offsets. The app has no data server; the
 * Ministry ships each Hijri year's table as an app update.
 *
 * So the input is the app's install file (.apk, or the .xapk bundle that
 * mirrors serve), and the build will not touch one it cannot trust:
 *
 *   1. the APK's signature must verify, and its signing certificate must be
 *      the pinned one below — the certificate only the publisher signs with.
 *      Where the file was downloaded from does not matter after this.
 *   2. the package must be com.issolah.marwalarm.
 *   3. every city, day and time must pass `buildCities` (dataset.ts).
 *
 * Any failure writes nothing and exits non-zero; the dataset already
 * committed stays as it is.
 *
 *   npx tsx tools/algeria-ministry/build.ts path/to/app.xapk
 *
 * Env: MARW_APK (instead of the argument), APKSIGNER / AAPT2 (tool paths;
 *      default: newest Android build-tools), MARW_FORCE=1 (rebuild even if
 *      the app version is the one already built), MARW_TODAY (YYYY-MM-DD,
 *      for tests), MARW_KEEP_PAST_DAYS (default 7), MARW_WARN_DAYS (30).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { DatasetDayTuple } from '../../src/providers/datasetTuple';
import {
  ALGERIA_TIMEZONE,
  BuildError,
  addDays,
  buildCities,
  changedDays,
  dayTuple,
  type MinistryCity,
  type MinistryRow,
} from './dataset';

export const MARW_PACKAGE = 'com.issolah.marwalarm';
/**
 * SHA-256 of the certificate the Ministry's app is signed with on Google
 * Play (app version 5.60, June 2026). If the publisher ever rotates its key
 * the build fails here, and a person checks the new certificate before
 * changing this line.
 */
export const MARW_CERT_SHA256 =
  '84ce695c9879c263be871f2c809f1673cc75381e214fbed23d494fbbe65b3f35';
/** Google Play's source-stamp certificate (the same for every Play app). */
export const PLAY_SOURCE_STAMP_SHA256 =
  '3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d';

const ROOT = path.join(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'data/prayer-times/algeria/v1');
const CITIES_DIR = path.join(OUT_DIR, 'cities');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');
const SEED_PATH = path.join(ROOT, 'src/providers/data/marwSeed.json');
const CITY_LIST_PATH = path.join(ROOT, 'src/providers/data/algeriaCities.json');

const int = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== '' && process.env[name] != null ? n : fallback;
};

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** The newest Android build-tools binary of this name, or the env override. */
function buildTool(name: 'apksigner' | 'aapt2', envName: string): string {
  if (process.env[envName]) return process.env[envName] as string;
  const homes = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk'),
  ].filter(Boolean) as string[];
  for (const home of homes) {
    const dir = path.join(home, 'build-tools');
    if (!fs.existsSync(dir)) continue;
    const versions = fs
      .readdirSync(dir)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .reverse();
    for (const v of versions) {
      const p = path.join(dir, v, name);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new BuildError(`${name} not found — install Android build-tools or set ${envName}`);
}

/** The base APK: the file itself, or the one inside an .xapk/.apks bundle. */
function baseApk(input: string, work: string): string {
  const entries = execFileSync('unzip', ['-Z1', input], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (entries.includes('AndroidManifest.xml')) return input;
  const apks = entries.filter(e => e.endsWith('.apk') && !e.includes('/'));
  const preferred =
    apks.find(e => e === `${MARW_PACKAGE}.apk`) ?? apks.find(e => e === 'base.apk');
  if (!preferred) {
    throw new BuildError(`no base APK in ${path.basename(input)} (found: ${apks.join(', ')})`);
  }
  execFileSync('unzip', ['-o', '-q', input, preferred, '-d', work]);
  return path.join(work, preferred);
}

function verifySignature(apk: string): string {
  let out: string;
  try {
    out = execFileSync(buildTool('apksigner', 'APKSIGNER'), ['verify', '--print-certs', apk], {
      encoding: 'utf8',
    });
  } catch (e) {
    throw new BuildError(`APK signature does not verify: ${(e as Error).message}`);
  }
  // Signer lines only ("Signer #1: …" or "V3.0 Signer: …"). A Google Play
  // "Source Stamp Signer" may follow; it says how the file was distributed,
  // and when present it must be Play's.
  const lines = out.split('\n');
  const digests = lines
    .filter(l => /Signer/.test(l) && !/Source Stamp/.test(l))
    .map(l => /certificate SHA-256 digest:\s*([0-9a-f]+)/i.exec(l)?.[1]?.toLowerCase())
    .filter((d): d is string => !!d);
  const stamp = lines
    .map(l => /Source Stamp Signer: certificate SHA-256 digest:\s*([0-9a-f]+)/i.exec(l)?.[1])
    .find(Boolean);
  if (stamp && stamp.toLowerCase() !== PLAY_SOURCE_STAMP_SHA256) {
    throw new BuildError(`source stamp ${stamp} is not Google Play's`);
  }
  if (digests.length !== 1 || digests[0] !== MARW_CERT_SHA256) {
    throw new BuildError(
      `signing certificate ${digests.join(', ') || '(none)'} is not the Ministry app's ` +
        `pinned ${MARW_CERT_SHA256}`,
    );
  }
  return digests[0];
}

function readBadging(apk: string): { pkg: string; versionCode: number; versionName: string } {
  const out = execFileSync(buildTool('aapt2', 'AAPT2'), ['dump', 'badging', apk], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const m = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/.exec(out);
  if (!m) throw new BuildError('could not read the package name and version from the APK');
  return { pkg: m[1], versionCode: Number(m[2]), versionName: m[3] };
}

type SqliteDb = {
  prepare(sql: string): { all(...args: unknown[]): Record<string, unknown>[] };
  close(): void;
};

function readDatabase(apk: string, work: string): { cities: MinistryCity[]; rows: MinistryRow[] } {
  const dbPath = path.join(work, 'mindb.db');
  fs.writeFileSync(dbPath, execFileSync('unzip', ['-p', apk, 'assets/mindb.db'], {
    maxBuffer: 256 * 1024 * 1024,
  }));
  if (fs.statSync(dbPath).size < 1024) throw new BuildError('assets/mindb.db missing from the APK');
  // node:sqlite (Node 22.13+). Required, not imported: the app's TypeScript
  // types predate it, and this file is type-checked with the app.
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => SqliteDb;
  };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const cities = db
      .prepare('SELECT _id, ParentId, MADINA_NAME FROM itc_tab_madina')
      .all()
      .map(r => ({
        id: Number(r._id),
        parentId: r.ParentId == null ? null : Number(r.ParentId),
        name: String(r.MADINA_NAME),
      }));
    const rows = db
      .prepare(
        'SELECT MADINA_ID, GeoDate, Fajr, Shurooq, Dhuhr, Asr, Maghrib, Isha FROM itc_tab_mawakit_salat',
      )
      .all()
      .map(r => ({
        cityId: Number(r.MADINA_ID),
        date: String(r.GeoDate),
        fajr: String(r.Fajr),
        sunrise: String(r.Shurooq),
        dhuhr: String(r.Dhuhr),
        asr: String(r.Asr),
        maghrib: String(r.Maghrib),
        isha: String(r.Isha),
      }));
    return { cities, rows };
  } finally {
    db.close();
  }
}

type IndexFile = {
  version: 1;
  builtAt: string;
  timezone: string;
  serverStatus: 'ok' | 'warning';
  firstDate: string;
  lastDate: string;
  minCoverageDays: number;
  deadCities: number[];
  source: { package: string; versionCode: number; versionName: string; certSha256: string };
  cities: { id: number; city: string; cityEn: string }[];
};

type CityFile = {
  id: number;
  city: string;
  timezone: string;
  builtAt: string;
  days: Record<string, DatasetDayTuple>;
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function reportCoverage(today: string, lastDate: string | undefined): void {
  const left = lastDate ? daysBetween(today, lastDate) : -1;
  console.log(`coverage: ${lastDate ?? 'none'} (${left} days ahead)`);
  if (left < int('MARW_WARN_DAYS', 30)) {
    emitOutput('coverage_warning', 'true');
    emitOutput('days_left', String(left));
  }
}

async function main(): Promise<number> {
  const input = process.argv[2] ?? process.env.MARW_APK;
  if (!input || !fs.existsSync(input)) {
    console.error('usage: build.ts <app.apk|app.xapk>   (or MARW_APK)');
    return 2;
  }
  const today = process.env.MARW_TODAY ?? new Date().toISOString().slice(0, 10);
  const previousIndex = readJson<IndexFile | null>(INDEX_PATH, null);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'marw-'));
  try {
    const apk = baseApk(input, work);
    const certSha256 = verifySignature(apk);
    const badging = readBadging(apk);
    if (badging.pkg !== MARW_PACKAGE) {
      throw new BuildError(`package is ${badging.pkg}, expected ${MARW_PACKAGE}`);
    }
    console.log(`verified ${badging.pkg} ${badging.versionName} (${badging.versionCode})`);
    emitOutput('version_name', badging.versionName);

    if (
      previousIndex?.source?.versionCode === badging.versionCode &&
      process.env.MARW_FORCE !== '1'
    ) {
      console.log('same app version as the committed dataset; nothing to do');
      reportCoverage(today, previousIndex.lastDate);
      emitOutput('changed', 'false');
      return 0;
    }

    const { cities, rows } = readDatabase(apk, work);
    const lastDate = rows.reduce((max, r) => (r.date > max ? r.date : max), '');
    const firstDate = addDays(today, -int('MARW_KEEP_PAST_DAYS', 7));
    if (!lastDate || lastDate < today) {
      throw new BuildError(`the app's table ends ${lastDate || '(empty)'}, before today (${today})`);
    }
    if (previousIndex?.lastDate && lastDate < previousIndex.lastDate) {
      throw new BuildError(
        `the app's table ends ${lastDate}, earlier than the committed ${previousIndex.lastDate}`,
      );
    }
    const built = buildCities(cities, rows, firstDate, lastDate);
    if (built.length < 60) throw new BuildError(`only ${built.length} cities`);

    const builtAt = new Date().toISOString();
    const changes: string[] = [];
    fs.mkdirSync(CITIES_DIR, { recursive: true });
    for (const c of built) {
      const file = path.join(CITIES_DIR, `${c.id}.json`);
      const prev = readJson<CityFile | null>(file, null);
      const changed = changedDays(prev?.days, c.minutes);
      if (changed.length) {
        changes.push(`${c.nameEn}: ${changed.length} day(s), first ${changed[0]}`);
      }
      const days: Record<string, DatasetDayTuple> = {};
      for (const d of Object.keys(c.minutes).sort()) days[d] = dayTuple(c.minutes[d]);
      const out: CityFile = { id: c.id, city: c.name, timezone: ALGERIA_TIMEZONE, builtAt, days };
      fs.writeFileSync(file, `${JSON.stringify(out)}\n`, 'utf8');
    }
    // A city the Ministry stopped listing must not keep serving last year's file.
    const keep = new Set(built.map(c => `${c.id}.json`));
    for (const f of fs.readdirSync(CITIES_DIR)) {
      if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(CITIES_DIR, f));
    }

    fs.writeFileSync(
      CITY_LIST_PATH,
      `${JSON.stringify(
        built.map(c => ({ id: c.id, name: c.name, nameEn: c.nameEn, lat: c.lat, lon: c.lon })),
        null,
        1,
      )}\n`,
      'utf8',
    );

    // The seed: the whole window, compact (minutes, six per day, from
    // `start`). Unlike Morocco's thirty days, this is the year — the
    // Ministry publishes once a year, so the copy in the app IS the data
    // and the CDN only carries next year's ahead of an app release.
    const seedCities: Record<string, number[]> = {};
    for (const c of built) {
      const flat: number[] = [];
      for (let d = firstDate; d <= lastDate; d = addDays(d, 1)) flat.push(...c.minutes[d]);
      seedCities[String(c.id)] = flat;
    }
    fs.writeFileSync(
      SEED_PATH,
      `${JSON.stringify({
        version: 1,
        builtAt,
        timezone: ALGERIA_TIMEZONE,
        start: firstDate,
        days: daysBetween(firstDate, lastDate) + 1,
        cities: seedCities,
      })}\n`,
      'utf8',
    );

    const left = daysBetween(today, lastDate);
    const index: IndexFile = {
      version: 1,
      builtAt,
      timezone: ALGERIA_TIMEZONE,
      serverStatus: left < int('MARW_WARN_DAYS', 30) ? 'warning' : 'ok',
      firstDate,
      lastDate,
      minCoverageDays: left,
      deadCities: [],
      source: {
        package: badging.pkg,
        versionCode: badging.versionCode,
        versionName: badging.versionName,
        certSha256,
      },
      cities: built.map(c => ({ id: c.id, city: c.name, cityEn: c.nameEn })),
    };
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

    console.log(`${built.length} cities, ${firstDate} .. ${lastDate}`);
    if (changes.length) {
      console.log(`changed against the previous build:\n  ${changes.join('\n  ')}`);
    }
    const summary = path.join(work, 'summary.md');
    fs.writeFileSync(
      summary,
      [
        `Rebuilt from the Ministry app **${badging.versionName}** (${badging.versionCode}), ` +
          `signature verified against the pinned certificate.`,
        '',
        `- ${built.length} cities, ${firstDate} to ${lastDate}`,
        `- every time within ±5 min of the Ministry method at its city`,
        changes.length
          ? `- **${changes.length} cities changed on days already published** — please look:\n` +
            changes.map(c => `  - ${c}`).join('\n')
          : '- no already-published day changed',
      ].join('\n'),
    );
    emitOutput('summary_file', summary);
    emitOutput('changed', 'true');
    reportCoverage(today, lastDate);
    return 0;
  } catch (e) {
    if (e instanceof BuildError) {
      console.error(`refused: ${e.message}`);
      return 3;
    }
    throw e;
  }
}

if (require.main === module) {
  main().then(c => process.exit(c));
}
