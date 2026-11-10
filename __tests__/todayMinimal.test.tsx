/**
 * Minimal's Today, by what it draws.
 *
 * The page is the hero and nothing under it; the countdown shows minutes
 * until the last five, then seconds, and its clock ticks to match
 * (useHeroClock, heroTick). These used to be held in place by reading
 * TodayCard.tsx for the lines that did them; here the card is rendered and
 * asked.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockFocused = { value: true };

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused.value,
}));

// The full-bleed hero reads the status-bar inset; there is no provider in
// a test tree, so hand it a flat one.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentBg: '#E7F0EB',
      accentSolid: '#0F5132',
      controlBg: '#EEEEEE',
    },
  }),
}));

// The card also reads (and writes) the per-prayer alert modes, which is
// a question for the settings provider. This test is about the
// countdown, so it answers with an empty map — nothing set, which is the
// state every install starts in.
jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: { prayerAlertModes: {}, notificationSound: 'default' },
    updateSettings: jest.fn(),
  }),
}));

// The card asks how this user reads a clock (issue #18), which is a
// question for the settings provider. This test is about the countdown,
// not about the provider, so it answers with the app's own 24-hour
// formatter directly.
jest.mock('../src/hooks/useClockFormatter', () => {
  const { makeClockFormatter } = require('../src/utils/clockFormat');
  const formatter = makeClockFormatter(false, 'en');
  return {
    useClockFormatter: () => formatter,
    useSystemIs24Hour: () => true,
  };
});

jest.mock('../src/components/GlassSurface', () => {
  const { View } = require('react-native');
  return { GlassSurface: View };
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars && typeof vars === 'object' && !Array.isArray(vars)
        ? `${key}:${Object.values(vars).filter(v => typeof v !== 'object').join(',')}`
        : key,
    i18n: { language: 'en' },
  }),
}));

// No launch run: the figures are the live ones from the first render.
jest.mock('../src/hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));

import { TodayCard } from '../src/screens/home/TodayCard';

const TIMINGS = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};
const ASR = new Date(2026, 7, 23, 15, 0, 0);
const at = (h: number, m: number, s = 0) => new Date(2026, 7, 23, h, m, s);

function renderCard(minimal: boolean): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TodayCard
        week={[TIMINGS, TIMINGS]}
        nextInfo={{ name: 'Asr', at: ASR }}
        resetKey="test"
        getDayLabel={() => 'Today'}
        getDayDate={() => '23 August'}
        getWeekday={() => 'Sunday'}
        fullBleed
        minimal={minimal}
        footer="Stockholm · 9 Safar"
      />,
    );
  });
  return tree;
}

/** Every string the card draws, in order. */
function texts(tree: ReactTestRenderer): string[] {
  type Node = string | { children?: Node[] | null } | Node[] | null;
  const walk = (n: Node): string[] =>
    n == null ? [] : typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(walk) : (n.children ?? []).flatMap(walk);
  return walk(tree.toJSON() as Node);
}
/** The countdown's figures, joined: "2h0m", "4m30s". */
function figures(tree: ReactTestRenderer): string {
  return texts(tree)
    .map(s => s.trim().replace('home.countdownUnitHour', 'h').replace('home.countdownUnitMinute', 'm').replace('home.countdownUnitSecond', 's'))
    .filter(Boolean)
    .join('|');
}
const rows = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.props.prayerKey === 'string');

describe('Minimal’s Today', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is the hero and nothing under it: no table, no eyebrow, the next prayer named once', () => {
    jest.setSystemTime(at(13, 0));
    const full = renderCard(false);
    const min = renderCard(true);
    expect(rows(full).length).toBeGreaterThanOrEqual(5);
    expect(rows(min)).toHaveLength(0);
    expect(texts(full).some(s => s.startsWith('home.nextPrayerIn'))).toBe(true);
    expect(texts(min).some(s => s.startsWith('home.nextPrayerIn'))).toBe(false);
    // The caption under the figures names the prayer and its time; the
    // footer is the page's last line.
    expect(texts(min)).toContain('prayer.Asr · 15:00');
    expect(texts(min).at(-1)).toBe('Stockholm · 9 Safar');
  });

  it('shows hours and minutes, and no seconds, until the last five minutes', () => {
    jest.setSystemTime(at(13, 0));
    expect(figures(renderCard(true))).toMatch(/^2\|h\|0\|m\|prayer\.Asr/);
    // Half an hour out the full page counts seconds; Minimal does not.
    jest.setSystemTime(at(14, 30, 10));
    expect(figures(renderCard(false))).toMatch(/29\|m\|50\|s/);
    expect(figures(renderCard(true))).toMatch(/^29\|m\|prayer\.Asr/);
    // Inside five minutes it does.
    jest.setSystemTime(at(14, 57, 30));
    expect(figures(renderCard(true))).toMatch(/^2\|m\|30\|s\|prayer\.Asr/);
  });

  it('ticks when its minute changes, not every second', () => {
    jest.setSystemTime(at(13, 0, 20));
    const tree = renderCard(true);
    const before = figures(tree);
    expect(before).toMatch(/^1\|h\|59\|m/);
    // Thirty-nine seconds on, still inside the minute: nothing to redraw.
    const timeouts = jest.spyOn(globalThis, 'setTimeout');
    act(() => {
      jest.advanceTimersByTime(39_000);
    });
    expect(figures(tree)).toBe(before);
    // And no clock was set second by second in the meantime (a tick every
    // second would have set thirty-nine).
    const short = timeouts.mock.calls.filter(c => typeof c[1] === 'number' && c[1] <= 1000);
    expect(short.length).toBeLessThan(5);
    timeouts.mockRestore();
    // Across the minute: the figure turns.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(figures(tree)).toMatch(/^1\|h\|58\|m/);
  });

  it('goes over to the seconds at the five minutes’ mark', () => {
    jest.setSystemTime(at(14, 54, 50));
    const tree = renderCard(true);
    expect(figures(tree)).toMatch(/^5\|m\|prayer\.Asr/);
    act(() => {
      jest.advanceTimersByTime(12_000);
    });
    // 14:55:02 — 4m 58s left, by the second now.
    expect(figures(tree)).toMatch(/^4\|m\|58\|s/);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(figures(tree)).toMatch(/^4\|m\|57\|s/);
  });
});
