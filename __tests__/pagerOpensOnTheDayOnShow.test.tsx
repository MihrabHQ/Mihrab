/**
 * The day pager opens on the day the card is on — also when that day
 * turned BEFORE the pager was mounted.
 *
 * The pager is mounted after the launch's first paint. On a start in
 * another town — the place kept from the last launch drawn first, then the
 * new one a few hundred milliseconds in — the card can turn to Tomorrow in
 * between: the night has already begun there. The offset the pager opens at
 * had been worked out once, for today's page, and was not worked out again;
 * the list was told to start at tomorrow's page and drew none before it. So
 * the pager opened on a gap: "Tomorrow" over an empty table, until the day
 * was turned by hand. Seen on an iPhone 13 (Nov 2026): São Paulo in the
 * afternoon, then London in the evening.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockFocused = { value: true };

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused.value,
}));

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

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: { prayerAlertModes: {}, notificationSound: 'default' },
    updateSettings: jest.fn(),
  }),
}));

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
    t: (key: string, second?: unknown) =>
      typeof second === 'string' ? second : key,
    i18n: { language: 'en' },
  }),
}));

import { FlatList } from 'react-native';
import { TodayCard } from '../src/screens/home/TodayCard';
import { _resetFirstPaintForTests, markFirstPaint } from '../src/boot/firstPaint';

const day = (fajr: string, isha: string) => ({
  Fajr: fajr, Sunrise: '06:10', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: isha,
});
/** The town left behind: its night has not begun at 19:00. */
const WEST = Array.from({ length: 7 }, (_, i) => day(`05:0${i}`, '20:00'));
/** The town arrived in: Ishāʾ was at 17:40. */
const EAST = Array.from({ length: 7 }, (_, i) => day(`06:1${i}`, '17:40'));
const PAST = Array.from({ length: 7 }, (_, i) => day(`04:5${i}`, '20:00'));
const WIDTH = 390;

function card(week: Record<string, string>[], resetKey: string) {
  return (
    <TodayCard
      week={week}
      past={PAST}
      nextInfo={{ name: 'Isha', at: new Date(2026, 10, 25, 20, 0) }}
      resetKey={resetKey}
      getDayLabel={(offset: number) => (offset === 1 ? 'Tomorrow' : offset === 0 ? 'Today' : 'Some day')}
      getDayDate={(offset: number) => `${25 + offset} November`}
      getWeekday={() => 'A day'}
    />
  );
}

/** The launch's first paint, and everything that waits on it let go. */
async function paint() {
  await act(async () => {
    markFirstPaint();
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    }
  });
}

describe('the pager, mounted after the day has turned', () => {
  beforeEach(() => {
    _resetFirstPaintForTests();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 19, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  it('opens on tomorrow\'s page, where the list starts — not on the gap before it', async () => {
    let tree!: ReactTestRenderer;
    // The launch's first frame: the place kept from last time, on today.
    act(() => {
      tree = create(card(WEST, 'west'));
    });
    act(() => {
      for (const n of tree.root.findAll(x => typeof x.props.onLayout === 'function')) {
        n.props.onLayout({ nativeEvent: { layout: { width: WIDTH, height: 300, x: 0, y: 0 } } });
      }
    });
    // No pager yet: the first paint has not happened.
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    // The new town, whose day is over: the card turns to tomorrow.
    act(() => {
      tree.update(card(EAST, 'east'));
    });
    expect(tree.root.findAllByProps({ prayerKey: 'Fajr' })[0]?.props?.rawTime).toBe('06:11');
    // The first paint, and the pager with it.
    await paint();
    const [pager] = tree.root.findAllByType(FlatList);
    expect(pager).toBeDefined();
    // Seven days behind, today, tomorrow: tomorrow is page 8.
    expect(pager.props.initialScrollIndex).toBe(8);
    expect(pager.props.contentOffset).toEqual({ x: 8 * WIDTH, y: 0 });
  });

  it('and once mounted, its opening offset no longer follows the day', async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(card(WEST, 'west'));
    });
    act(() => {
      for (const n of tree.root.findAll(x => typeof x.props.onLayout === 'function')) {
        n.props.onLayout({ nativeEvent: { layout: { width: WIDTH, height: 300, x: 0, y: 0 } } });
      }
    });
    await paint();
    const pager = () => tree.root.findAllByType(FlatList)[0];
    expect(pager().props.contentOffset).toEqual({ x: 7 * WIDTH, y: 0 });
    // The day turns under a mounted pager (a chevron, the night's last
    // time): a changed `contentOffset` is written onto the scroll view at
    // once, under the animated scroll — it must stay where it was.
    act(() => {
      tree.update(card(EAST, 'east'));
    });
    expect(pager().props.contentOffset).toEqual({ x: 7 * WIDTH, y: 0 });
  });
});
