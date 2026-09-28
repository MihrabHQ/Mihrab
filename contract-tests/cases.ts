/**
 * The cases every widget-contract reader is held to — TypeScript, Swift and
 * Kotlin alike (docs/rewrite-plan.md, step 1.3).
 *
 * `buildFixtures()` runs each case through the app's own reference code (the
 * generated TS readers and src/widget/wallClock.ts) and records the answers
 * in contract-tests/fixtures.json. The Swift and Kotlin harnesses read that
 * file and must give the same answers. So a change one platform reads
 * differently from the others fails a test, rather than a widget.
 *
 * The inputs are raw JSON text on purpose: some cases are about how a
 * number is WRITTEN (Swift's encoder writes an epoch as 1759000000000.0),
 * which a value built in JS and stringified could never show.
 */
import { execFileSync } from 'child_process';
import * as Contract from '../src/widget/contract.generated';
import {
  formatContractMinutes,
  minutesFromHHmm,
} from '../src/widget/wallClock';
import type { WidgetContractPayload } from '../src/widget/contract.generated';
import { widgetPayloadV1FromV2 } from '../src/widget/widgetPayloadV2';
import { widgetScenarios } from './scenarios';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ── Decode cases ────────────────────────────────────────────────────────

const ROW = (key: string, minutes: number | null, name = key) => ({
  key,
  name,
  abbr: key.slice(0, 3),
  ...(minutes == null ? {} : { minutes }),
});

const DAY_1 = {
  dateKey: '2026-09-28',
  utcOffsetMinutes: 120,
  label: 'Mon, Sep 28',
  prayers: [
    ROW('Fajr', 312),
    ROW('Dhuhr', 752),
    ROW('Asr', 950),
    ROW('Maghrib', 1115),
    ROW('Isha', 1215),
  ],
  sunrise: ROW('Sunrise', 425),
  extras: [ROW('Lastthird', 150, 'الثلث الأخير')],
  estimated: false,
};

const FULL_PAYLOAD = {
  schemaVersion: 2,
  language: 'ar',
  clock: { hour12: true, am: 'ص', pm: 'م', periodFirst: false },
  locationName: 'Malmö',
  days: [
    DAY_1,
    { ...DAY_1, dateKey: '2026-09-29', label: 'Tue, Sep 29', extras: [] },
  ],
  seasonal: { jumuah: false, ramadan: false, eid: 'adha' },
  today: {
    dateKey: '2026-09-28',
    logged: 2,
    loggable: 3,
    owed: 1,
    prayers: [
      {
        key: 'Fajr',
        name: 'الفجر',
        minutes: 312,
        status: 'on-time',
        due: true,
      },
      { key: 'Dhuhr', name: 'الظهر', minutes: 752, status: 'qadha', due: true },
      { key: 'Asr', name: 'العصر', minutes: 950, due: false },
    ],
  },
  practice: {
    streak: 12,
    bestStreak: 40,
    loggedToday: 2,
    owed: 3,
    sunnahRate: 0.25,
    fastsThisMonth: 1,
    days: [
      { d: '2026-09-27', kw: 470, l: 5, m: false, f: false, s: 4 },
      { d: '2026-09-28', kw: 200, l: 2, m: true, f: true, s: 0 },
    ],
    since: '2025-01-03',
  },
  reading: {
    surah: 18,
    surahName: 'الكهف',
    ayah: 10,
    page: 294,
    juz: 15,
    pagesRead: 293,
    totalPages: 604,
    bookmarks: 4,
    lastReadAt: 1758990000000,
    mode: 'mushaf',
    khatmah: {
      day: 12,
      targetDays: 30,
      pagesToday: 20,
      doneToday: 5,
      behindBy: 0,
      daysLeft: 18,
      skipped: 2,
    },
    started: true,
    downloaded: true,
  },
  hijri: {
    day: 6,
    month: 4,
    year: 1448,
    monthName: 'ربيع الآخر',
    label: '6 ربيع الآخر 1448',
    nextMonthName: 'جمادى الأولى',
    nextMonthInDays: 24,
  },
  tasbih: {
    presetId: 'subhanallah',
    label: 'Subḥān Allāh',
    arabic: 'سُبْحَانَ ٱللَّٰهِ',
    count: 12,
    target: 33,
    unbounded: false,
    index: 0,
    total: 3,
    counts: [12, 0, 33],
    labels: ['Subḥān Allāh', 'Al-ḥamdu lillāh', 'Allāhu akbar'],
    targets: [33, 33, 34],
    unboundedFlags: [false, false, false],
    todayTotal: 45,
    todayRounds: 1,
  },
};

type DecodeCase = { name: string; type: string; input: string };

const J = (v: unknown) => JSON.stringify(v);

export const DECODE_CASES: DecodeCase[] = [
  {
    name: 'a full payload reads back whole',
    type: 'Payload',
    input: J(FULL_PAYLOAD),
  },
  {
    name: 'the smallest payload: defaults filled in',
    type: 'Payload',
    input: '{"schemaVersion":2,"days":[]}',
  },
  {
    name: 'mistyped optional scalars fall back, not the payload',
    type: 'Payload',
    input: J({
      ...FULL_PAYLOAD,
      language: 5,
      clock: '12h',
      locationName: null,
    }),
  },
  {
    name: 'no schemaVersion: unreadable',
    type: 'Payload',
    input: J({ days: [] }),
  },
  {
    name: 'days not a list: unreadable',
    type: 'Payload',
    input: J({ schemaVersion: 2, days: { dateKey: '2026-09-28' } }),
  },
  {
    name: 'a broken day or row costs only itself',
    type: 'Payload',
    input: J({
      schemaVersion: 2,
      days: [
        { label: 'no dateKey', prayers: [] },
        { dateKey: '2026-09-27', prayers: null },
        {
          dateKey: '2026-09-28',
          prayers: [
            { key: 'Fajr', minutes: 312 },
            { name: 'no key', minutes: 400 },
            { key: 'Dhuhr', minutes: '12:32' },
            { key: 'Asr', minutes: 950.5 },
            { key: 'Maghrib', minutes: 3000000000 },
            'Isha',
            null,
          ],
          sunrise: 'at dawn',
          extras: null,
        },
      ],
    }),
  },
  {
    name: 'whole numbers written with a fraction of zero still read',
    type: 'Payload',
    input:
      '{"schemaVersion":2.0,"days":[{"dateKey":"2026-09-28","utcOffsetMinutes":120.0,"prayers":[{"key":"Fajr","minutes":312.0}]}]}',
  },
  {
    name: 'unknown enum values fall back; unknown keys are ignored',
    type: 'Payload',
    input: J({
      schemaVersion: 2,
      days: [],
      future: { anything: [1, 2, 3] },
      seasonal: { eid: 'christmas', jumuah: 'yes', ramadan: 1 },
      today: {
        dateKey: '2026-09-28',
        prayers: [{ key: 'Fajr', status: 'prayed', due: 'true' }],
      },
      reading: { mode: 'audio', surah: '18', lastReadAt: 'never' },
    }),
  },
  {
    name: 'a block missing a required field is absent, the rest stands',
    type: 'Payload',
    input: J({
      schemaVersion: 2,
      days: [],
      hijri: { day: 6, month: 4 },
      today: { logged: 3 },
      practice: {
        days: [{ kw: 100 }, { d: '2026-09-28', kw: 90.5, m: 'yes' }],
      },
    }),
  },
  {
    name: 'lists of scalars drop what they cannot read',
    type: 'Tasbih',
    input: J({
      counts: [1, 2.0, 'x', null, 4, 2.5, 3000000000],
      labels: ['a', null, 3, 'c'],
      targets: 'many',
      unboundedFlags: [true, 0, false],
    }),
  },
  {
    name: 'a practice rate may be any number, never text',
    type: 'Practice',
    input: J({ sunnahRate: 1, days: [] }),
  },
  {
    name: 'a practice rate as text is absent',
    type: 'Practice',
    input: J({ sunnahRate: '0.5' }),
  },
  { name: 'top level a list: unreadable', type: 'Payload', input: '[]' },
  { name: 'top level a number: unreadable', type: 'Payload', input: '5' },
  { name: 'top level null: unreadable', type: 'Payload', input: 'null' },
  {
    name: 'not JSON at all: unreadable',
    type: 'Payload',
    input: '{"schemaVersion":',
  },
  {
    name: 'a log tap as the app writes it',
    type: 'LogQueueEntry',
    input: J({ d: '2026-09-28', p: 'Fajr', t: 1759000000000 }),
  },
  {
    name: 'a log tap as Swift writes it (the epoch a Double)',
    type: 'LogQueueEntry',
    input: '{"d":"2026-09-28","p":"Asr","t":1759000000000.0}',
  },
  {
    name: 'a log tap with no time: unreadable',
    type: 'LogQueueEntry',
    input: J({ d: '2026-09-28', p: 'Fajr' }),
  },
  {
    name: 'a log tap with a numeric day: unreadable',
    type: 'LogQueueEntry',
    input: J({ d: 20260928, p: 'Fajr', t: 1 }),
  },
  {
    name: 'a coalesced tasbih run',
    type: 'TasbihQueueEntry',
    input: J({ a: 'inc', t: 1759000000000, n: 7 }),
  },
  {
    name: 'an unknown tasbih action: unreadable',
    type: 'TasbihQueueEntry',
    input: J({ a: 'dec', t: 1 }),
  },
  {
    name: 'a run length as text is ignored, the tap kept',
    type: 'TasbihQueueEntry',
    input: J({ a: 'next', t: 5, n: '3' }),
  },
];

// ── Time cases ──────────────────────────────────────────────────────────

export const HHMM_CASES = [
  '00:00',
  '05:12',
  '5:12',
  '23:59',
  '24:00',
  '12:60',
  '5:12 PM',
  '+5:12',
  '05:1',
  ' 05:12',
  '—',
  '',
  '٠٥:١٢',
  '5:12:00',
  ':12',
];

export const TEXT_MINUTES: (number | null)[] = [
  0,
  1,
  59,
  60,
  312,
  719,
  720,
  721,
  779,
  780,
  1215,
  1439,
  1445,
  -1,
  null,
];

// Written out rather than taken from `contractClock`, which asks Intl: the
// markers are the app's business (and tested against it in
// widgetContract.test.ts); these cases are about placing them, and must not
// change with the ICU data of whichever Node regenerates the file.
export const TEXT_CLOCKS: Record<string, unknown>[] = [
  { hour12: false },
  { hour12: true, am: 'AM', pm: 'PM' },
  { hour12: true, am: 'ص', pm: 'م' },
  { hour12: true, am: '上午', pm: '下午', periodFirst: true },
  { hour12: true },
  { hour12: true, am: '', pm: '' },
  { hour12: true, am: 'vorm.', pm: 'nachm.', periodFirst: true },
];

/** Zones whose 2026 rules are settled in every tz database we meet. */
export const INSTANT_CASES: {
  zone: string;
  dateKey: string;
  minutes: number;
}[] = [
  { zone: 'UTC', dateKey: '2026-09-28', minutes: 312 },
  { zone: 'Europe/Stockholm', dateKey: '2026-09-28', minutes: 312 },
  // The clock goes back: 02:30 happens twice. The earlier one.
  { zone: 'Europe/Stockholm', dateKey: '2026-10-25', minutes: 150 },
  // The clock goes forward: 02:30 never happens. Moved past the gap.
  { zone: 'Europe/Stockholm', dateKey: '2026-03-29', minutes: 150 },
  { zone: 'Europe/Stockholm', dateKey: '2026-10-25', minutes: 1445 },
  { zone: 'Europe/Stockholm', dateKey: '2026-09-28', minutes: -5 },
  { zone: 'America/New_York', dateKey: '2026-11-01', minutes: 90 },
  { zone: 'America/New_York', dateKey: '2026-03-08', minutes: 150 },
  { zone: 'Asia/Kolkata', dateKey: '2026-09-28', minutes: 312 },
  // Half-hour daylight saving.
  { zone: 'Australia/Lord_Howe', dateKey: '2026-04-05', minutes: 100 },
  { zone: 'Australia/Lord_Howe', dateKey: '2026-10-04', minutes: 135 },
  // +12:45, and a gap at 02:45.
  { zone: 'Pacific/Chatham', dateKey: '2026-09-27', minutes: 170 },
  { zone: 'Pacific/Chatham', dateKey: '2026-09-28', minutes: 312 },
];

export const OFFSET_CASES: { zone: string; dateKey: string }[] = [
  { zone: 'UTC', dateKey: '2026-09-28' },
  { zone: 'Europe/Stockholm', dateKey: '2026-09-28' },
  { zone: 'Europe/Stockholm', dateKey: '2026-12-01' },
  { zone: 'Europe/Stockholm', dateKey: '2026-10-25' },
  { zone: 'America/New_York', dateKey: '2026-07-01' },
  { zone: 'America/New_York', dateKey: '2026-12-01' },
  { zone: 'Asia/Kolkata', dateKey: '2026-09-28' },
  { zone: 'Australia/Lord_Howe', dateKey: '2026-01-15' },
  { zone: 'Australia/Lord_Howe', dateKey: '2026-07-15' },
  { zone: 'Pacific/Chatham', dateKey: '2026-07-15' },
  { zone: 'Pacific/Chatham', dateKey: '2026-12-15' },
];

export const LOCAL_CASES: { zone: string; epochMs: number }[] = [
  { zone: 'Europe/Stockholm', epochMs: Date.UTC(2026, 9, 25, 0, 30) },
  { zone: 'Europe/Stockholm', epochMs: Date.UTC(2026, 9, 25, 1, 30) },
  { zone: 'Europe/Stockholm', epochMs: Date.UTC(2026, 8, 28, 22, 30) },
  { zone: 'Asia/Kolkata', epochMs: Date.UTC(2026, 8, 28, 18, 45) },
  { zone: 'Pacific/Chatham', epochMs: Date.UTC(2026, 8, 28, 11, 0) },
  { zone: 'America/New_York', epochMs: Date.UTC(2026, 10, 1, 5, 30) },
];

export const STALE_CASES: { zone: string; day: Json }[] = [
  {
    zone: 'Europe/Stockholm',
    day: { dateKey: '2026-09-28', utcOffsetMinutes: 120, prayers: [] },
  },
  {
    zone: 'Europe/Stockholm',
    day: { dateKey: '2026-09-28', utcOffsetMinutes: 60, prayers: [] },
  },
  { zone: 'Europe/Stockholm', day: { dateKey: '2026-09-28', prayers: [] } },
  {
    zone: 'Asia/Kolkata',
    day: { dateKey: '2026-09-28', utcOffsetMinutes: 120, prayers: [] },
  },
];

// ── The answers ─────────────────────────────────────────────────────────

type Reader = (input: unknown) => unknown;

function readerFor(type: string): Reader {
  const fn = (Contract as Record<string, unknown>)[`readWidgetContract${type}`];
  if (typeof fn !== 'function') throw new Error(`no reader for ${type}`);
  return fn as Reader;
}

function decode(type: string, input: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  return readerFor(type)(parsed);
}

/**
 * The engine's own answers in another time zone.
 *
 * Jest hands each test file its own copy of `process.env`, so setting `TZ`
 * here never reaches V8 — the first version of this file recorded every
 * zone as the runner's. A separate Node, started in the zone, is the
 * engine answering for real. The program below is the same arithmetic as
 * src/widget/wallClock.ts (`utcOffsetMinutesAtNoon`, `contractDateKey`)
 * and as the Date constructor the app builds times with.
 */
const ZONE_PROGRAM = `
const jobs = JSON.parse(process.argv[1]);
const pad = n => String(n).padStart(2, '0');
const ymd = k => k.split('-').map(Number);
process.stdout.write(JSON.stringify(jobs.map(j => {
  if (j.kind === 'epoch') {
    const [y, m, d] = ymd(j.dateKey);
    return new Date(y, m - 1, d, 0, j.minutes, 0, 0).getTime();
  }
  if (j.kind === 'offset') {
    const [y, m, d] = ymd(j.dateKey);
    const west = new Date(y, m - 1, d, 12, 0, 0, 0).getTimezoneOffset();
    return west === 0 ? 0 : -west;
  }
  const at = new Date(j.epochMs);
  return {
    dateKey: at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()),
    minutes: at.getHours() * 60 + at.getMinutes(),
  };
})));
`;

type ZoneJob =
  | { kind: 'epoch'; dateKey: string; minutes: number }
  | { kind: 'offset'; dateKey: string }
  | { kind: 'local'; epochMs: number };

/** Answer each job in its zone: one Node per zone, results in input order. */
function inZones<R>(jobs: { zone: string; job: ZoneJob }[]): R[] {
  const out: R[] = new Array(jobs.length);
  const zones = [...new Set(jobs.map(j => j.zone))];
  for (const zone of zones) {
    const idx = jobs
      .map((j, i) => (j.zone === zone ? i : -1))
      .filter(i => i >= 0);
    const answers = JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', ZONE_PROGRAM, JSON.stringify(idx.map(i => jobs[i].job))],
        { env: { ...process.env, TZ: zone }, encoding: 'utf8' },
      ),
    ) as R[];
    idx.forEach((i, k) => (out[i] = answers[k]));
  }
  return out;
}

/**
 * v2 → v1 at a moment, the way the native adapters must do it. English
 * scenarios only, and each day's offset pinned: the adapter ignores both,
 * and neither may make the recorded file differ between machines.
 */
async function adaptCases() {
  const scenarios = (await widgetScenarios()).filter(s => s.fixture);
  return scenarios.map(s => {
    const v2 = JSON.parse(JSON.stringify(s.v2)) as WidgetContractPayload;
    for (const d of v2.days) d.utcOffsetMinutes = 120;
    const read = Contract.readWidgetContractPayload(v2);
    if (!read) throw new Error(`scenario "${s.name}" did not read`);
    return {
      name: s.name,
      now: s.now,
      input: JSON.stringify(v2),
      expected: JSON.parse(
        JSON.stringify(widgetPayloadV1FromV2(read, s.now) ?? null),
      ),
    };
  });
}

export async function buildFixtures() {
  const epochs = inZones<number>(
    INSTANT_CASES.map(c => ({
      zone: c.zone,
      job: { kind: 'epoch', dateKey: c.dateKey, minutes: c.minutes },
    })),
  );
  const offsets = inZones<number>(
    OFFSET_CASES.map(c => ({
      zone: c.zone,
      job: { kind: 'offset', dateKey: c.dateKey },
    })),
  );
  const locals = inZones<{ dateKey: string; minutes: number }>(
    LOCAL_CASES.map(c => ({
      zone: c.zone,
      job: { kind: 'local', epochMs: c.epochMs },
    })),
  );
  const staleDays = STALE_CASES.map(
    c =>
      readerFor('Day')(c.day) as { dateKey: string; utcOffsetMinutes?: number },
  );
  const staleNow = inZones<number>(
    STALE_CASES.map((c, i) => ({
      zone: c.zone,
      job: { kind: 'offset', dateKey: staleDays[i].dateKey },
    })),
  );
  return {
    about:
      'GENERATED from contract-tests/cases.ts by `npm run contract-fixtures` — do not edit. The answers the app gives; Swift and Kotlin must give the same.',
    adapt: await adaptCases(),
    decode: DECODE_CASES.map(c => ({
      ...c,
      expected: decode(c.type, c.input),
    })),
    hhmm: HHMM_CASES.map(text => ({ text, minutes: minutesFromHHmm(text) })),
    text: TEXT_CLOCKS.flatMap(clock =>
      TEXT_MINUTES.map(minutes => ({
        minutes,
        clock,
        text: formatContractMinutes(
          minutes,
          readerFor('Clock')(clock) as never,
        ),
      })),
    ),
    instants: INSTANT_CASES.map((c, i) => ({ ...c, epochMs: epochs[i] })),
    offsets: OFFSET_CASES.map((c, i) => ({
      ...c,
      utcOffsetMinutes: offsets[i],
    })),
    local: LOCAL_CASES.map((c, i) => ({ ...c, ...locals[i] })),
    stale: STALE_CASES.map((c, i) => {
      const written = staleDays[i].utcOffsetMinutes;
      return { ...c, stale: written != null && written !== staleNow[i] };
    }),
  };
}
