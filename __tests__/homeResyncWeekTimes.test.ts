/**
 * The end-of-day prompt, the adhkār reminders and the quiet windows are
 * written from a week of prayer times, and gated by a fingerprint so a burst
 * of foregrounds does not rewrite them each time. The fingerprint held the
 * day, the zone and the settings — not the times — so switching to a saved
 * place within the gap read as "nothing changed" and the old place's
 * reminders stayed scheduled. The week's times are now in it.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  dayTzFingerprint,
  forgetResyncGates,
  markResynced,
  shouldResync,
  weekTimesKey,
} from '../src/utils/resyncGate';

const stockholm = [
  {
    Fajr: '03:10',
    Dhuhr: '12:05',
    Asr: '15:40',
    Maghrib: '19:55',
    Isha: '21:50',
  },
  {
    Fajr: '03:13',
    Dhuhr: '12:05',
    Asr: '15:39',
    Maghrib: '19:52',
    Isha: '21:47',
  },
];
const malmo = [
  {
    Fajr: '03:40',
    Dhuhr: '12:20',
    Asr: '15:55',
    Maghrib: '20:00',
    Isha: '21:58',
  },
  {
    Fajr: '03:42',
    Dhuhr: '12:20',
    Asr: '15:54',
    Maghrib: '19:58',
    Isha: '21:56',
  },
];

describe('weekTimesKey', () => {
  it('differs between two places on the same day', () => {
    expect(weekTimesKey(stockholm)).not.toBe(weekTimesKey(malmo));
  });

  it('is the same for the same times, whatever the key order', () => {
    const reordered = stockholm.map(d => ({
      Isha: d.Isha,
      Maghrib: d.Maghrib,
      Asr: d.Asr,
      Dhuhr: d.Dhuhr,
      Fajr: d.Fajr,
    }));
    expect(weekTimesKey(reordered)).toBe(weekTimesKey(stockholm));
  });

  it('is empty for no week', () => {
    expect(weekTimesKey(undefined)).toBe('');
  });

  it('lets a location switch through the 60 s gate', () => {
    forgetResyncGates();
    const now = new Date(2026, 9, 17, 12, 0);
    const T0 = now.getTime();
    const before = dayTzFingerprint(now, 'true', T0, weekTimesKey(stockholm));
    markResynced('k', before, T0);
    // Same day, zone and setting, ten seconds later: unchanged times are
    // throttled, another place's are not.
    expect(shouldResync('k', before, T0 + 10_000)).toBe(false);
    const after = dayTzFingerprint(now, 'true', T0, weekTimesKey(malmo));
    expect(shouldResync('k', after, T0 + 10_000)).toBe(true);
  });
});

describe('HomeScreen puts the week in each reminder fingerprint', () => {
  const src = readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'),
    'utf-8',
  );

  it.each([
    ['eodPrint', 'phoneView.table.week'],
    ['duaPrint', 'phoneView.table.week'],
    ['silencePrint', 'phoneView.alertWeek'],
  ])('%s carries weekTimesKey(%s)', (name, week) => {
    const start = src.indexOf(`const ${name} = dayTzFingerprint(`);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf(');', start);
    expect(src.slice(start, end)).toContain(`weekTimesKey(${week})`);
  });
});
