/**
 * Issue #74 — a log made from outside the app takes the clock's answer when
 * the reader has asked for it, and only then.
 */
import { EventType } from '@notifee/react-native';

const mockStore = new Map<string, string>();
jest.mock('../src/storage/durableWrite', () => ({
  onDurableWrite: jest.fn(() => () => {}),
  durableEncryptedGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelNotification: async () => {},
    cancelTriggerNotification: async () => {},
    getTriggerNotificationIds: async () => [],
    createChannel: async () => 'ch',
    createTriggerNotification: async () => {},
    getNotificationCategories: async () => [],
    setNotificationCategories: async () => {},
  },
  EventType: { ACTION_PRESS: 2, PRESS: 1, DISMISSED: 0, DELIVERED: 3 },
  AndroidImportance: { DEFAULT: 3 },
  TriggerType: { TIMESTAMP: 0 },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { JOURNAL_KEY } from '../src/practice/practiceStore';
import {
  handlePrayerLogEvent,
  logPrayerOnTime,
  windowForPress,
} from '../src/notifications/prayerLogAction';
import { coerceJournalEntries, getEntryStatus } from '../src/journal/journal';
import {
  rememberLogTiming,
  statusByClock,
  statusForExternalLog,
  windowsFromEdges,
  withPreferredEnds,
} from '../src/journal/logTiming';

const H = 60 * 60 * 1000;
// 9 Aug 2026, local: Dhuhr 13:00, Asr 17:00, Maghrib 21:00.
const at = (h: number, m = 0) => new Date(2026, 7, 9, h, m).getTime();
const EDGES = [
  { name: 'Fajr', at: at(3) },
  { name: 'Sunrise', at: at(5) },
  { name: 'Dhuhr', at: at(13) },
  { name: 'Asr', at: at(17) },
  { name: 'Maghrib', at: at(21) },
  { name: 'Isha', at: at(22, 30) },
];

function journal() {
  const raw = mockStore.get(JOURNAL_KEY);
  return raw ? coerceJournalEntries(JSON.parse(raw)) : [];
}

beforeEach(async () => {
  mockStore.clear();
  await AsyncStorage.clear();
});

describe('the window and the clock', () => {
  it('runs each prayer to the next edge, and leaves the last one without a window', () => {
    const w = windowsFromEdges(EDGES);
    expect(w.map(x => [x.p, x.e - x.s])).toEqual([
      ['Fajr', 2 * H],
      ['Dhuhr', 4 * H],
      ['Asr', 4 * H],
      ['Maghrib', 1.5 * H],
    ]);
    expect(w[0].d).toBe('2026-08-09');
  });

  it('is on time in the first half and late from the half on', () => {
    const win = { s: at(13), e: at(17) };
    expect(statusByClock(win, at(13))).toBe('on-time');
    expect(statusByClock(win, at(14, 59))).toBe('on-time');
    expect(statusByClock(win, at(15))).toBe('late');
    expect(statusByClock(win, at(18))).toBe('late');
    // Before the window opens, or with no usable window, the clock says nothing.
    expect(statusByClock(win, at(12))).toBe('on-time');
    expect(statusByClock(null, at(18))).toBe('on-time');
    expect(statusByClock({ s: at(17), e: at(13) }, at(18))).toBe('on-time');
  });
});

describe('statusForExternalLog', () => {
  it('is on time with the switch off, whatever the clock says', async () => {
    await rememberLogTiming(false, windowsFromEdges(EDGES), at(12));
    expect(await statusForExternalLog('2026-08-09', 'Dhuhr', at(16), null)).toBe('on-time');
  });

  it('uses the stored window with the switch on', async () => {
    await rememberLogTiming(true, windowsFromEdges(EDGES), at(12));
    expect(await statusForExternalLog('2026-08-09', 'Dhuhr', at(14), null)).toBe('on-time');
    expect(await statusForExternalLog('2026-08-09', 'Dhuhr', at(16), null)).toBe('late');
    // A prayer with no stored window is not guessed at.
    expect(await statusForExternalLog('2026-08-09', 'Isha', at(23, 59), null)).toBe('on-time');
  });

  it('prefers the window the caller already has', async () => {
    await rememberLogTiming(true, windowsFromEdges(EDGES), at(12));
    expect(
      await statusForExternalLog('2026-08-09', 'Isha', at(23, 59), { s: at(22, 30), e: at(23) }),
    ).toBe('late');
  });

  it('keeps old windows for two weeks after they close', async () => {
    await rememberLogTiming(true, windowsFromEdges(EDGES), at(12));
    await rememberLogTiming(true, [], at(12) + 15 * 24 * H);
    expect(await statusForExternalLog('2026-08-09', 'Dhuhr', at(16), null)).toBe('on-time');
  });
});

describe('the writers', () => {
  it('records a widget tap in the second half as late with the switch on', async () => {
    await rememberLogTiming(true, windowsFromEdges(EDGES), at(12));
    await logPrayerOnTime('2026-08-09', 'Asr', new Date(at(20)));
    expect(getEntryStatus(journal(), '2026-08-09', 'Asr')).toBe('late');
    await logPrayerOnTime('2026-08-09', 'Dhuhr', new Date(at(13, 30)));
    expect(getEntryStatus(journal(), '2026-08-09', 'Dhuhr')).toBe('on-time');
  });

  it('reads the notification its own window', () => {
    expect(windowForPress({ deadline: String(at(17)) }, `pt-${at(13)}-Dhuhr`)).toEqual({
      s: at(13),
      e: at(17),
    });
    expect(windowForPress({}, `pt-${at(13)}-Dhuhr`)).toBeNull();
    expect(windowForPress({ deadline: String(at(17)) }, 'snooze-1')).toBeNull();
  });

  it('records a notification press as on time with the switch off', async () => {
    await press(`pt-${at(21)}-Maghrib`, String(at(22, 30)));
    expect(getEntryStatus(journal(), '2026-08-09', 'Maghrib')).toBe('on-time');
  });
});

function press(id: string, deadline: string) {
  return handlePrayerLogEvent({
    type: EventType.ACTION_PRESS,
    detail: {
      pressAction: { id: 'journal-log-prayer:Maghrib' },
      notification: { id, data: { targetDate: '2026-08-09', prayer: 'Maghrib', deadline } },
    },
  } as never);
}

describe('the Mālikī line', () => {
  it('is the end of the preferred time when it falls inside the window', () => {
    const win = { s: at(13), e: at(17), f: at(14) };
    expect(statusByClock(win, at(13, 59))).toBe('on-time');
    expect(statusByClock(win, at(14))).toBe('late');
  });

  it('falls back to the half when the boundary is outside the window', () => {
    expect(statusByClock({ s: at(13), e: at(17), f: at(18) }, at(14))).toBe('on-time');
    expect(statusByClock({ s: at(13), e: at(17), f: at(18) }, at(15))).toBe('late');
  });

  it('is read from the day that carries the boundaries', () => {
    const base = new Date(2026, 7, 9);
    const w = withPreferredEnds(windowsFromEdges(EDGES), [{ DhuhrDaruri: '14:30' }], base, (p, t, b) =>
      t[`${p}Daruri` as 'DhuhrDaruri'] ? new Date(b.getFullYear(), b.getMonth(), b.getDate(), 14, 30).getTime() : null,
    );
    expect(w.find(x => x.p === 'Dhuhr')?.f).toBe(at(14, 30));
    expect(w.find(x => x.p === 'Asr')?.f).toBeUndefined();
  });

  it('applies to a notification press through the stored window', async () => {
    const wins = windowsFromEdges(EDGES).map(x => (x.p === 'Dhuhr' ? { ...x, f: at(14) } : x));
    await rememberLogTiming(true, wins, at(12));
    expect(
      await statusForExternalLog('2026-08-09', 'Dhuhr', at(14, 10), { s: at(13), e: at(17) }),
    ).toBe('late');
  });
});
