/**
 * The golden fixtures every widget-contract reader is held to.
 *
 * contract-tests/fixtures.json is what the app's own reference code answers
 * for each case in contract-tests/cases.ts. The Swift harness
 * (scripts/contract-test-swift.sh) and the Kotlin tests
 * (contract-tests/kotlin) read the same file and must answer the same. This
 * suite keeps the file honest: regenerated in memory and compared, so a
 * case or a reader changed without `npm run contract-fixtures` fails here.
 *
 * It also pins the answers that matter most by hand, so the golden file
 * cannot quietly adopt a wrong one.
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildFixtures } from '../contract-tests/cases';

const FILE = 'contract-tests/fixtures.json';

describe('the widget contract fixtures', () => {
  const fixtures = buildFixtures();

  it('are current — run `npm run contract-fixtures`', () => {
    const text = `${JSON.stringify(fixtures, null, 2)}\n`;
    if (process.env.UPDATE_CONTRACT_FIXTURES === '1') writeFileSync(FILE, text);
    const current = readFileSync(FILE, 'utf8');
    expect(current === text).toBe(true);
  });

  const decoded = (name: string) => {
    const c = fixtures.decode.find(d => d.name === name);
    if (!c) throw new Error(`no case "${name}"`);
    return c.expected as Record<string, any> | null;
  };

  it('read a whole payload back as it was written', () => {
    const c = fixtures.decode[0];
    expect(c.expected).toEqual(JSON.parse(c.input));
  });

  it('cost a broken part only itself', () => {
    const p = decoded('a broken day or row costs only itself')!;
    expect(p.days).toHaveLength(1);
    expect(p.days[0].prayers).toEqual([
      { key: 'Fajr', name: '', abbr: '', minutes: 312 },
      { key: 'Dhuhr', name: '', abbr: '' },
      { key: 'Asr', name: '', abbr: '' },
      { key: 'Maghrib', name: '', abbr: '' },
    ]);
    expect(p.days[0].sunrise).toBeUndefined();
    expect(p.days[0].extras).toEqual([]);
  });

  it('refuse only what is required', () => {
    expect(decoded('no schemaVersion: unreadable')).toBeNull();
    expect(decoded('days not a list: unreadable')).toBeNull();
    expect(decoded('not JSON at all: unreadable')).toBeNull();
    const p = decoded(
      'a block missing a required field is absent, the rest stands',
    )!;
    expect(p.hijri).toBeUndefined();
    expect(p.today).toBeUndefined();
    expect(p.practice.days).toEqual([
      { d: '2026-09-28', kw: 0, l: 0, m: false, f: false, s: 0 },
    ]);
  });

  it('take the earlier instant when the clock shows a time twice, and step over a gap', () => {
    const at = (zone: string, dateKey: string, minutes: number) =>
      fixtures.instants.find(
        i => i.zone === zone && i.dateKey === dateKey && i.minutes === minutes,
      )!.epochMs;
    // Stockholm, clocks back at 03:00 CEST → 02:00 CET: 02:30 CEST is 00:30Z.
    expect(at('Europe/Stockholm', '2026-10-25', 150)).toBe(
      Date.UTC(2026, 9, 25, 0, 30),
    );
    // Clocks forward at 02:00 CET → 03:00 CEST: "02:30" is 03:30 CEST, 01:30Z.
    expect(at('Europe/Stockholm', '2026-03-29', 150)).toBe(
      Date.UTC(2026, 2, 29, 1, 30),
    );
    // New York, clocks back at 02:00 EDT: 01:30 EDT is 05:30Z.
    expect(at('America/New_York', '2026-11-01', 90)).toBe(
      Date.UTC(2026, 10, 1, 5, 30),
    );
    // Lord Howe goes back half an hour at 02:00 (+11 → +10:30): 01:40 at +11.
    expect(at('Australia/Lord_Howe', '2026-04-05', 100)).toBe(
      Date.UTC(2026, 3, 4, 14, 40),
    );
    expect(at('Asia/Kolkata', '2026-09-28', 312)).toBe(
      Date.UTC(2026, 8, 27, 23, 42),
    );
  });

  it('record offsets east of UTC, including the odd ones', () => {
    const off = (zone: string, dateKey: string) =>
      fixtures.offsets.find(o => o.zone === zone && o.dateKey === dateKey)!
        .utcOffsetMinutes;
    expect(off('Asia/Kolkata', '2026-09-28')).toBe(330);
    expect(off('Pacific/Chatham', '2026-07-15')).toBe(765);
    expect(off('Pacific/Chatham', '2026-12-15')).toBe(825);
    expect(off('America/New_York', '2026-12-01')).toBe(-300);
    expect(off('Australia/Lord_Howe', '2026-01-15')).toBe(660);
    expect(off('Australia/Lord_Howe', '2026-07-15')).toBe(630);
  });

  it('write times the way the app does', () => {
    const t = (minutes: number | null, clock: Record<string, unknown>) =>
      fixtures.text.find(
        x =>
          x.minutes === minutes &&
          JSON.stringify(x.clock) === JSON.stringify(clock),
      )!.text;
    expect(t(0, { hour12: false })).toBe('00:00');
    expect(t(0, { hour12: true, am: 'AM', pm: 'PM' })).toBe('12:00 AM');
    expect(t(720, { hour12: true, am: 'ص', pm: 'م' })).toBe('12:00 م');
    expect(
      t(1215, { hour12: true, am: '上午', pm: '下午', periodFirst: true }),
    ).toBe('下午8:15');
    expect(t(780, { hour12: true, am: '', pm: '' })).toBe('1:00');
    expect(t(null, { hour12: false })).toBe('—');
  });
});
