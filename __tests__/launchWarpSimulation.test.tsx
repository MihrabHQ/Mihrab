/**
 * The launch run, simulated on the real Today card: a kept picture taken at
 * one moment, a launch at another, and every frame of the hero in between.
 *
 * The cases are the ones a person produces by living with the app: back a
 * few minutes later, after one prayer, after several, after most of the
 * day, after days away, with the clock moved back, and a hero that is
 * mounted twice during the launch. In every one the hero must start on the
 * picture's numbers (or the fade shows a jump), move only towards the live
 * ones (or it reads as a glitch), get there inside the run, and then tick
 * as it always does.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockShown: { value: { at: number; targetAt: number; fromAt: number } | null } = { value: null };
const mockReduce = { value: false };

jest.mock('../src/native/LaunchSnapshot', () => ({
  ...jest.requireActual('../src/native/LaunchSnapshot'),
  heroStateShown: () => mockShown.value,
  hideRequestedAt: () => null,
  holdLaunchSnapshot: jest.fn(),
  setLaunchHeroState: jest.fn(),
}));
jest.mock('../src/hooks/useReduceMotion', () => ({ useReduceMotion: () => mockReduce.value }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false, bg: '#FFFFFF', card: '#F5F5F5', text: '#111111', muted: '#666666',
      border: '#DDDDDD', accent: '#0F5132', accentBg: '#E7F0EB', accentSolid: '#0F5132',
      controlBg: '#EEEEEE',
    },
  }),
}));
jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: { prayerAlertModes: {}, notificationSound: 'default' },
    updateSettings: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useClockFormatter', () => {
  const { makeClockFormatter } = require('../src/utils/clockFormat');
  const formatter = makeClockFormatter(false, 'en');
  return { useClockFormatter: () => formatter, useSystemIs24Hour: () => true };
});
jest.mock('../src/components/GlassSurface', () => {
  const { View } = require('react-native');
  return { GlassSurface: View };
});
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown> | string) =>
      typeof vars === 'string'
        ? vars
        : vars && typeof vars === 'object' && !Array.isArray(vars)
        ? `${key}:${Object.values(vars).filter(v => typeof v !== 'object').join(',')}`
        : key,
    i18n: { language: 'en' },
  }),
}));

// eslint-disable-next-line import/first
import { Text, View, StyleSheet } from 'react-native';
// eslint-disable-next-line import/first
import { TodayCard } from '../src/screens/home/TodayCard';
// eslint-disable-next-line import/first
import { _resetLaunchWarpForTests, WARP_AFTER_HIDE_MS, WARP_MAX_MS } from '../src/boot/launchWarp';

const TIMINGS = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};
const ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

const day = (base: Date, hhmm: string, shift = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + shift, h, m, 0, 0);
};

/** What the hero aims at, at `t`: the next prayer, from the last one. */
function heroAt(t: Date): { name: string; target: Date; from: Date } {
  const instants = [-1, 0, 1].flatMap(shift =>
    ORDER.map(name => ({ name, at: day(t, TIMINGS[name], shift) })),
  );
  const next = instants.find(i => i.at.getTime() > t.getTime())!;
  // The rail starts at the last row passed, Sunrise included (it is a row).
  const rows = [-1, 0, 1].flatMap(shift =>
    [...ORDER, 'Sunrise' as const].map(name => ({ name, at: day(t, TIMINGS[name], shift) })),
  );
  const prev = rows
    .filter(i => i.at.getTime() <= t.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .pop()!;
  return { name: next.name, target: next.at, from: prev.at };
}

function renderCard(now: Date, key = 'k'): ReactTestRenderer {
  const h = heroAt(now);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TodayCard
        key={key}
        week={[TIMINGS, TIMINGS]}
        nextInfo={{ name: h.name as never, at: h.target }}
        resetKey={key}
        getDayLabel={() => 'Today'}
        getDayDate={() => 'today'}
        getWeekday={() => 'Day'}
      />,
    );
  });
  return tree;
}

/** The hero's countdown, in seconds, as drawn. */
function shownSeconds(tree: ReactTestRenderer): number {
  const texts = tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .map(c => (Array.isArray(c) ? c.join('') : c));
  const piece = (re: RegExp) => {
    const hit = texts.find(c => typeof c === 'string' && re.test(c)) as string | undefined;
    return hit ? parseInt(hit, 10) : 0;
  };
  // The hero draws hours, minutes and seconds as pieces (#71).
  return (piece(/^\d+h$/) * 60 + piece(/^\d+m$/)) * 60 + piece(/^\d\ds$/);
}

/** The rail's fill, 0…1, as drawn (the only width written to 2 decimals). */
function shownRail(tree: ReactTestRenderer): number | null {
  for (const v of tree.root.findAllByType(View)) {
    const w = StyleSheet.flatten(v.props.style)?.width;
    if (typeof w === 'string' && /^\d+\.\d\d%$/.test(w)) return parseFloat(w) / 100;
  }
  return null;
}

const frame = 16;

beforeAll(() => {
  // A frame every 16 ms, as on a phone (the preset's runs them all at once).
  (global as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (t: number) => void) =>
    setTimeout(() => cb(Date.now()), frame) as unknown as number;
  (global as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (id: number) => clearTimeout(id);
});

beforeEach(() => {
  jest.useFakeTimers();
  _resetLaunchWarpForTests();
  mockReduce.value = false;
});
afterEach(() => jest.useRealTimers());

/** Run a launch: picture at `pictureAt`, now `now`. Every frame's numbers. */
function simulate(pictureAt: Date, now: Date) {
  const h = heroAt(pictureAt);
  mockShown.value = { at: pictureAt.getTime(), targetAt: h.target.getTime(), fromAt: h.from.getTime() };
  jest.setSystemTime(now);
  const tree = renderCard(now);
  const seconds: number[] = [shownSeconds(tree)];
  const rails: (number | null)[] = [shownRail(tree)];
  const total = WARP_AFTER_HIDE_MS + WARP_MAX_MS + 200;
  for (let t = 0; t < total; t += frame) {
    act(() => {
      jest.advanceTimersByTime(frame);
    });
    seconds.push(shownSeconds(tree));
    rails.push(shownRail(tree));
  }
  // What the picture showed: the hero ticks a moment past each second.
  const cached = Math.floor((h.target.getTime() - pictureAt.getTime() - 1) / 1000);
  const liveTarget = heroAt(new Date(Date.now())).target;
  const live = Math.floor((liveTarget.getTime() - Date.now()) / 1000);
  const span = h.target.getTime() - h.from.getTime();
  const cachedRail = (pictureAt.getTime() - h.from.getTime()) / span;
  const lh = heroAt(new Date(Date.now()));
  const liveRail = (Date.now() - lh.from.getTime()) / (lh.target.getTime() - lh.from.getTime());
  return { tree, seconds, rails, cached, live, cachedRail, liveRail };
}

function expectRun(r: ReturnType<typeof simulate>) {
  // Starts on the picture's number — or the fade would show a jump.
  expect(r.seconds[0]).toBe(r.cached);
  // Moves only towards the live one, through many values, not in a step.
  const dir = Math.sign(r.live - r.cached);
  for (let i = 1; i < r.seconds.length; i++) {
    // The live clock ticks a second during the run: allow it.
    expect((r.seconds[i] - r.seconds[i - 1]) * dir).toBeGreaterThanOrEqual(-1);
  }
  expect(new Set(r.seconds).size).toBeGreaterThan(8);
  // Ends on the live number, within the second it ticked meanwhile.
  expect(Math.abs(r.seconds[r.seconds.length - 1] - r.live)).toBeLessThanOrEqual(2);
  // The rail too, from the picture's fill to the live one, only towards it.
  expect(r.rails[0]).toBeCloseTo(r.cachedRail, 2);
  const lastRail = r.rails[r.rails.length - 1] as number;
  expect(lastRail).toBeCloseTo(r.liveRail, 2);
  const rdir = Math.sign(r.liveRail - r.cachedRail);
  for (let i = 1; i < r.rails.length; i++) {
    expect(((r.rails[i] as number) - (r.rails[i - 1] as number)) * rdir).toBeGreaterThanOrEqual(-0.001);
  }
}

describe('the hero runs from the kept picture to now', () => {
  const D = new Date(2026, 9, 8);

  it('a few minutes later, same prayer ahead', () => {
    expectRun(simulate(day(D, '13:00'), day(D, '13:07')));
  });

  it('after one prayer has passed', () => {
    const r = simulate(day(D, '14:30'), day(D, '15:40'));
    expectRun(r);
    // 30 min to Asr then; 2h20 to Maghrib now: it counts up.
    expect(r.seconds[r.seconds.length - 1]).toBeGreaterThan(r.seconds[0]);
  });

  it('after several prayers', () => {
    expectRun(simulate(day(D, '06:30'), day(D, '19:00')));
  });

  it('after most of the day, into the night', () => {
    expectRun(simulate(day(D, '05:10'), day(D, '23:30')));
  });

  it('across midnight', () => {
    expectRun(simulate(day(D, '21:00'), day(D, '01:15', 1)));
  });

  it('after days away', () => {
    expectRun(simulate(day(D, '13:00', -3), day(D, '09:20')));
  });

  it('when the clock has gone back', () => {
    expectRun(simulate(day(D, '13:40'), day(D, '12:50')));
  });

  it('keeps ticking as usual once there', () => {
    const r = simulate(day(D, '13:00'), day(D, '13:07'));
    const before = shownSeconds(r.tree);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(shownSeconds(r.tree)).toBe(before - 1);
  });

  it('carries on, not over, when the hero is mounted again mid-run', () => {
    const pictureAt = day(D, '06:30');
    const now = day(D, '19:00');
    const h = heroAt(pictureAt);
    mockShown.value = { at: pictureAt.getTime(), targetAt: h.target.getTime(), fromAt: h.from.getTime() };
    jest.setSystemTime(now);
    const first = renderCard(now, 'provisional');
    act(() => {
      jest.advanceTimersByTime(WARP_AFTER_HIDE_MS + 200);
    });
    const mid = shownSeconds(first);
    act(() => first.unmount());
    const second = renderCard(now, 'stored');
    const after = shownSeconds(second);
    const cached = Math.floor((h.target.getTime() - pictureAt.getTime() - 1) / 1000);
    // Not back to the picture's number, and not jumped to the end.
    expect(after).not.toBe(cached);
    expect(Math.abs(after - mid)).toBeLessThan(Math.abs(cached - mid) + 120);
  });

  it('does not run at all with Reduce Motion', () => {
    mockReduce.value = true;
    const pictureAt = day(D, '06:30');
    const now = day(D, '19:00');
    const h = heroAt(pictureAt);
    mockShown.value = { at: pictureAt.getTime(), targetAt: h.target.getTime(), fromAt: h.from.getTime() };
    jest.setSystemTime(now);
    const tree = renderCard(now);
    expect(shownSeconds(tree)).toBe(Math.floor((heroAt(now).target.getTime() - now.getTime()) / 1000));
  });

  it('draws the live hero at once when the launch had no picture', () => {
    mockShown.value = null;
    const now = day(D, '13:07');
    jest.setSystemTime(now);
    const tree = renderCard(now);
    expect(shownSeconds(tree)).toBe(Math.floor((heroAt(now).target.getTime() - now.getTime()) / 1000));
  });
});
