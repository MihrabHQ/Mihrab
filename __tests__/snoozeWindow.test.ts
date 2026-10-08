import {
  LAST_CHANCE_MINUTES,
  hasSnooze,
  prayerEndsAt,
  resolveSnooze,
  snoozeMenu,
  windowEdges,
} from '../src/notifications/snoozeWindow';
import { SNOOZE_PRESETS } from '../src/notifications/prayerAlertActions';
import { fullScreenAlarmData } from '../src/notifications/fullScreenAlarm';
import { lastChanceLabel, prayerAlertActions } from '../src/notifications/prayerAlertActions';

const MIN = 60_000;
const D = 1_000_000_000_000; // the deadline
const at = (minsBefore: number) => D - minsBefore * MIN;

describe('which snooze lengths are offered', () => {
  it('offers everything when there is no deadline', () => {
    expect(snoozeMenu(0, null, SNOOZE_PRESETS).minutes).toEqual([5, 10, 15, 30, 60]);
  });

  it('keeps 15 minutes before the end: a length that would leave less is gone', () => {
    // 100 min left: 60 leaves 40 — fine. 
    expect(snoozeMenu(at(100), D, SNOOZE_PRESETS).minutes).toEqual([5, 10, 15, 30, 60]);
    // 70 min left: 60 would leave 10 → gone; 30 leaves 40 → stays.
    expect(snoozeMenu(at(70), D, SNOOZE_PRESETS).minutes).toEqual([5, 10, 15, 30]);
    // 45 min left: 30 leaves exactly 15 → still offered; 60 gone.
    expect(snoozeMenu(at(45), D, SNOOZE_PRESETS).minutes).toEqual([5, 10, 15, 30]);
    // 44 min left: 30 leaves 14 → gone.
    expect(snoozeMenu(at(44), D, SNOOZE_PRESETS).minutes).toEqual([5, 10, 15]);
    // 21 min left: only 5 leaves 16.
    expect(snoozeMenu(at(21), D, SNOOZE_PRESETS).minutes).toEqual([5]);
  });

  it('turns into "last chance" once even 5 minutes no longer fits', () => {
    const m = snoozeMenu(at(19), D, SNOOZE_PRESETS); // 5 would leave 14
    expect(m.minutes).toEqual([]);
    expect(m.lastChanceAt).toBe(at(15));
  });

  it('falls back to 5 minutes before the end when 15 is already behind us', () => {
    const m = snoozeMenu(at(12), D, SNOOZE_PRESETS);
    expect(m.lastChanceAt).toBe(at(5));
  });

  it('offers no snooze at all in the final minutes', () => {
    const m = snoozeMenu(at(5.5), D, SNOOZE_PRESETS);
    expect(m.lastChanceAt).toBeNull();
    expect(hasSnooze(m)).toBe(false);
  });
});

describe('a press is judged at the moment it is made', () => {
  it('honours a length that still fits', () => {
    expect(resolveSnooze(at(100), D, 30, false, SNOOZE_PRESETS)).toEqual({
      at: at(100) + 30 * MIN,
      lastChance: false,
    });
  });

  it('turns a stale 60-minute chip into what the clock allows', () => {
    const r = resolveSnooze(at(50), D, 60, false, SNOOZE_PRESETS);
    expect(r?.lastChance).toBe(false);
    expect(r!.at).toBeLessThanOrEqual(D - 15 * MIN);
  });

  it('a stale chip near the end becomes the last chance', () => {
    expect(resolveSnooze(at(18), D, 30, false, SNOOZE_PRESETS)).toEqual({
      at: at(15),
      lastChance: true,
    });
  });

  it('refuses when nothing honest is left', () => {
    expect(resolveSnooze(at(4), D, 5, false, SNOOZE_PRESETS)).toBeNull();
  });
});

describe('where a prayer ends', () => {
  const day = (h: Record<string, string>) => h as never;
  const base = new Date(2026, 9, 6, 0, 0, 0);
  const edges = windowEdges(
    [
      day({ Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '19:30' }),
      day({ Fajr: '05:02', Sunrise: '06:32', Dhuhr: '12:00', Asr: '15:00', Maghrib: '17:58', Isha: '19:28' }),
    ],
    base,
  );
  const t = (d: number, h: number, m: number) => new Date(2026, 9, 6 + d, h, m).getTime();

  it('Fajr ends at sunrise, the day prayers at the next prayer, Isha at the next Fajr', () => {
    expect(prayerEndsAt(edges, t(0, 5, 0))).toBe(t(0, 6, 30));
    expect(prayerEndsAt(edges, t(0, 12, 0))).toBe(t(0, 15, 0));
    expect(prayerEndsAt(edges, t(0, 15, 0))).toBe(t(0, 18, 0));
    expect(prayerEndsAt(edges, t(0, 18, 0))).toBe(t(0, 19, 30));
    expect(prayerEndsAt(edges, t(0, 19, 30))).toBe(t(1, 5, 2));
  });

  it('has no end for Isha on the last cached day (no limit, not a guess)', () => {
    expect(prayerEndsAt(edges, t(1, 19, 28))).toBeNull();
  });
});

describe('the buttons follow the menu', () => {
  it('drops lengths that no longer fit from the notification buttons', () => {
    const menu = snoozeMenu(at(44), D, SNOOZE_PRESETS);
    const snooze = prayerAlertActions('Asr', undefined, menu)[0];
    expect(snooze.input?.choices).toEqual([
      'Snooze 5 min',
      'Snooze 10 min',
      'Snooze 15 min',
    ]);
  });

  it('the one remaining button says how long it snoozes, not "last chance"', () => {
    const menu = snoozeMenu(at(19), D, SNOOZE_PRESETS);
    const snooze = prayerAlertActions('Asr', undefined, menu)[0];
    // Last chance fires 15 min before the end; drawn 19 min before it: 4 min.
    expect(snooze.input?.choices).toEqual(['Snooze 4 min']);
    expect(lastChanceLabel('Asr')).toBe('Last chance to pray Asr');
  });

  it('there is no snooze button when nothing honest is left, but Log stays', () => {
    const menu = snoozeMenu(at(4), D, SNOOZE_PRESETS);
    const actions = prayerAlertActions('Asr', undefined, menu);
    expect(actions.find(a => a.pressAction.id === 'adhan_snooze')).toBeUndefined();
    expect(actions.length).toBeGreaterThan(0);
  });

  it('the alarm screen shrinks the same way', () => {
    const full = fullScreenAlarmData('Asr', '', snoozeMenu(at(300), D, SNOOZE_PRESETS));
    expect(full.fsSnoozeMinutes).toBe('10');
    expect(JSON.parse(full.fsSnoozeAlt).map((c: { m: number }) => c.m)).toEqual([5, 15, 30, 60]);
    const near = fullScreenAlarmData('Asr', '', snoozeMenu(at(19), D, SNOOZE_PRESETS));
    expect(near.fsSnooze).toBe('Snooze 4 min');
    expect(near.fsSnoozeMinutes).toBe(String(LAST_CHANCE_MINUTES));
    expect(JSON.parse(near.fsSnoozeAlt)).toEqual([]);
    const late = fullScreenAlarmData('Asr', '', snoozeMenu(at(4), D, SNOOZE_PRESETS));
    expect(late.fsSnooze).toBeUndefined();
  });
});

describe('Fajr ends at sunrise even when the Sunrise row is hidden', () => {
  const base = new Date(2026, 9, 6, 0, 0, 0);
  const full = { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '19:30' } as never;
  const hidden = { Fajr: '05:00', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '19:30' } as never;
  const fajr = new Date(2026, 9, 6, 5, 0).getTime();
  const sunrise = new Date(2026, 9, 6, 6, 30).getTime();

  it('uses the unfiltered day', () => {
    expect(prayerEndsAt(windowEdges([full], base), fajr)).toBe(sunrise);
  });

  it('shows why the filtered day must not be used: it would end Fajr at Dhuhr', () => {
    expect(prayerEndsAt(windowEdges([hidden], base), fajr)).toBe(
      new Date(2026, 9, 6, 12, 0).getTime(),
    );
  });

  it('wires the unfiltered week from the home screen into the scheduler', () => {
    const fs = require('fs');
    const path = require('path');
    const home = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');
    expect((home.match(/windowWeek: state\.week/g) ?? []).length).toBe(2);
    const sync = fs.readFileSync(path.join(__dirname, '../src/notifications/prayerNotifications.ts'), 'utf8');
    expect(sync).toMatch(/params\.windowWeek/);
  });
});

describe('the last-chance fallbacks', () => {
  it('a stale last-chance press with time to spare takes a real length', () => {
    const r = resolveSnooze(at(100), D, 10, true, SNOOZE_PRESETS);
    expect(r?.lastChance).toBe(false);
  });
});

describe('the alarm screen keeps deciding while it is open', () => {
  const fs = require('fs');
  const path = require('path');

  it('ships what the native screen re-decides with', () => {
    const d = fullScreenAlarmData('Asr', '', snoozeMenu(at(300), D, SNOOZE_PRESETS), D);
    expect(d.fsDeadline).toBe(String(D));
    expect(JSON.parse(d.fsMainOpts).map((o: { m: number }) => o.m)).toEqual([10, 5]);
    expect(JSON.parse(d.fsChipOpts).map((o: { m: number }) => o.m)).toEqual([5, 15, 30, 60]);
    expect(d.fsLastChance).toBe('Snooze {minutes} min');
  });

  it('sends nothing extra when the end is unknown (the static screen)', () => {
    const d = fullScreenAlarmData('Asr', '', undefined, null);
    expect(d.fsDeadline).toBeUndefined();
  });

  it('the native screen reads exactly those keys and uses the same 15-minute rule', () => {
    const kt = fs.readFileSync(
      path.join(__dirname, '../android/app/src/main/java/com/prayer_times/PrayerAlarmActivity.kt'),
      'utf8',
    );
    for (const key of ['fsDeadline', 'fsMainOpts', 'fsChipOpts', 'fsLastChance']) {
      expect(kt).toContain(`"${key}"`);
    }
    expect(kt).toMatch(/SNOOZE_KEEP_MS = 15 \* 60_000L/);
    expect(kt).toMatch(/LAST_CHANCE_MINUTES = -1/);
    expect(LAST_CHANCE_MINUTES).toBe(-1);
    expect(kt).toMatch(/listOf\(15, 5\)/);
  });

  it('the scheduler and the re-fire both pass the deadline', () => {
    const a = fs.readFileSync(path.join(__dirname, '../src/notifications/prayerNotifications.ts'), 'utf8');
    const b = fs.readFileSync(path.join(__dirname, '../src/notifications/notificationActions.ts'), 'utf8');
    expect(a).toMatch(/fullScreenAlarmData\(e\.name, nextLine, snoozeOptions, endsAt\)/);
    expect(b).toMatch(/fullScreenAlarmData\(prayer, data\.fsNext \?\? '', menu, deadline\)/);
  });
});
