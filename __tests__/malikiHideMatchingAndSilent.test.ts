/**
 * Two choices about the Mālikī second times: leave one off the card where
 * it is the next prayer's own time, and have their notifications arrive
 * silently.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutMatchingDaruri } from '../src/prayer/daruriTimes';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

describe('a second time that is the next prayer\'s own time', () => {
  const day = {
    Fajr: '05:35',
    Sunrise: '08:01',
    Dhuhr: '11:40',
    Asr: '12:52',
    Maghrib: '15:09',
    Isha: '17:19',
    FajrDaruri: '07:19',
    DhuhrDaruri: '12:52',
    AsrDaruri: '13:49',
    MaghribDaruri: '17:19',
    IshaDaruri: '19:58',
  };

  it('is left out under Dhuhr and Maghrib, and the other three stay', () => {
    const out = withoutMatchingDaruri(day);
    expect(out.DhuhrDaruri).toBeUndefined();
    expect(out.MaghribDaruri).toBeUndefined();
    expect(out).toMatchObject({ FajrDaruri: '07:19', AsrDaruri: '13:49', IshaDaruri: '19:58' });
    // The prayers themselves are untouched, and so is the day handed in.
    expect(out).toMatchObject({ Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' });
    expect(day.DhuhrDaruri).toBe('12:52');
  });

  it('stays where it says something the card does not: Dhuhr\'s on Hanafi Asr', () => {
    // The 1:1 shadow, half an hour before the 2:1 Asr on the row below.
    const hanafi = { ...day, Asr: '13:24', DhuhrDaruri: '12:52' };
    const out = withoutMatchingDaruri(hanafi);
    expect(out.DhuhrDaruri).toBe('12:52');
    expect(out.MaghribDaruri).toBeUndefined();
  });

  it('is the same day back where nothing matches or nothing is there', () => {
    const none = { Fajr: '05:35', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' };
    expect(withoutMatchingDaruri(none)).toBe(none);
    const apart = { ...day, DhuhrDaruri: '12:40', MaghribDaruri: '17:00' };
    expect(withoutMatchingDaruri(apart)).toBe(apart);
  });

  it('is off until asked for, and only ever about what is drawn', () => {
    expect(DEFAULT_SETTINGS.malikiSecondTimeHideMatching).toBe(false);
    const home = src('src/screens/HomeScreen.tsx');
    expect(home).toContain('settings.malikiSecondTimeHideMatching ? days.map(withoutMatchingDaruri) : days;');
    // The alerts read the boundaries from the week this was not applied to.
    expect(home).toContain('alertWeek: tableWithDaruri ?? table.week,');
    // Offered where the lines are drawn at all.
    expect(src('src/screens/settings/CalculationCard.tsx')).toMatch(
      /\{settings\.malikiSecondTimeRows \? \(\s*<SettingsToggleRow\s*title=\{t\(\s*'settings\.malikiHideMatching'/,
    );
  });
});

describe('the second times\' notifications, silently', () => {
  const notif = src('src/notifications/prayerNotifications.ts');

  it('is off until asked for', () => {
    expect(DEFAULT_SETTINGS.malikiSecondTimeAlertsSilent).toBe(false);
  });

  it('is a low-importance channel on Android and a passive notification on iOS', () => {
    expect(notif).toContain("export const DARURI_SILENT_CHANNEL_ID = 'prayer-second-times-silent';");
    expect(notif).toContain('importance: AndroidImportance.LOW,');
    expect(notif).toContain("return { ios: { interruptionLevel: 'passive' }, androidChannelId: DARURI_SILENT_CHANNEL_ID };");
    // …and what it always was otherwise.
    expect(notif).toContain('if (!silent) return { ios: { sound: normal.iosSound }, androidChannelId: normal.androidChannelId };');
  });

  it('covers both of their notifications, and the one redrawn when a prayer is logged', () => {
    expect(notif.match(/channelId: daruriHow\.androidChannelId,/g)).toHaveLength(2);
    expect(notif.match(/ios: daruriHow\.ios,/g)).toHaveLength(2);
    expect(notif).toContain('channelId: delivery.androidChannelId,');
    expect(notif).toContain('.then(st => st.malikiSecondTimeAlertsSilent === true)');
  });

  it('reschedules when the choice changes, from the app and after an update', () => {
    const today = src('src/screens/home/writeTodayAlerts.ts');
    expect(today).toContain('daruriSilent: s.malikiSecondTimeAlertsSilent,');
    expect(today).toContain('String(s.malikiSecondTimeAlertsSilent),');
    expect(src('src/notifications/afterUpdate.ts')).toContain('daruriSilent: settings.malikiSecondTimeAlertsSilent,');
  });

  it('is offered once something is going to fire, and said in every language', () => {
    expect(src('src/screens/settings/MalikiAlertsCard.tsx')).toMatch(
      /\{alerts\.length > 0 \? \(\s*<SettingsToggleRow\s*title=\{t\('settings\.malikiAlertsSilent'/,
    );
    for (const l of LOCALES) {
      const s = JSON.parse(src(`src/i18n/locales/${l}.json`));
      for (const k of ['malikiHideMatching', 'malikiHideMatchingHelp', 'malikiAlertsSilent', 'malikiAlertsSilentHelp', 'malikiSilentChannel']) {
        expect(typeof s.settings[k]).toBe('string');
        expect(s.settings[k].length).toBeGreaterThan(0);
      }
      // The help names the four prayers as this language names them.
      for (const p of ['Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
        expect(s.settings.malikiHideMatchingHelp).toContain(s.prayer[p]);
      }
    }
  });
});

/**
 * A silent alert is read when the phone is next picked up. It used to take
 * itself away when its lead was up — Fajr's came at 07:05, left at 07:20 and
 * was looked for at 07:31 — so with "Silent notifications" on, none was ever
 * seen.
 */
describe('a silent second-time alert stays until it stops being true', () => {
  const { daruriAlertRelevantUntil } = require('../src/prayer/daruriTimes');
  const notif = src('src/notifications/prayerNotifications.ts');
  const day = { Fajr: '05:40', Sunrise: '08:08', Dhuhr: '11:41', Asr: '12:51', Maghrib: '14:53', Isha: '16:58' };
  const base = new Date(2026, 10, 28);
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

  it("Fajr's until sunrise, ʿAṣr's until Maghrib, Ishāʾ's until the next Fajr", () => {
    const week = [day, day];
    expect(daruriAlertRelevantUntil(week, base, 'FajrDaruri', at(28, 7, 20))?.getTime()).toBe(at(28, 8, 8));
    expect(daruriAlertRelevantUntil(week, base, 'AsrDaruri', at(28, 13, 46))?.getTime()).toBe(at(28, 14, 53));
    expect(daruriAlertRelevantUntil(week, base, 'IshaDaruri', at(28, 21, 10))?.getTime()).toBe(at(29, 5, 40));
  });

  it('is the end AFTER the boundary: a boundary past midnight belongs to the day before', () => {
    // Yesterday's Ishāʾ third at 00:30 today: the Fajr it runs to is today's, not tomorrow's.
    expect(daruriAlertRelevantUntil([day, day, day], new Date(2026, 10, 27), 'IshaDaruri', at(28, 0, 30))?.getTime()).toBe(at(28, 5, 40));
  });

  it('says nothing where the week cannot (the last day held, for the night prayers)', () => {
    expect(daruriAlertRelevantUntil([day], base, 'IshaDaruri', at(28, 21, 10))).toBeNull();
  });

  it('is what the delivered notification is given, for the silent ones and the zero-lead ones only', () => {
    expect(notif).toContain('const stays = daruriHow.androidChannelId === DARURI_SILENT_CHANNEL_ID || daruriMinutes === 0;');
    expect(notif).toContain('const until = stays ? daruriAlertRelevantUntil(leadDays, leadBase, e.name, boundaryMs) : null;');
    expect(notif).toContain('timeoutAfter: lingerMs,');
    // With a sound and a lead it leaves when the lead is up, as before.
    expect(notif).toMatch(/const lingerMs = !stays\s*\? Math\.max\(60_000, daruriMinutes \* 60_000\)/);
    // And it says the clock time alone: "in 15 min" is not true an hour on.
    expect(notif).toMatch(/stays && daruriMinutes > 0\s*\? i18n\.t\('prayer\.firstTimeUntil'/);
  });

  it('has the words in every language', () => {
    for (const l of LOCALES) {
      const s = JSON.parse(src(`src/i18n/locales/${l}.json`));
      expect(s.prayer.firstTimeUntil).toContain('{{time}}');
    }
  });
});
