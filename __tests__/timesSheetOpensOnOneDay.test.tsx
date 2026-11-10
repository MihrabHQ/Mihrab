/**
 * The minimal Today's sheet opens on the day on show alone; the other
 * days are built once it has risen (TodayTimesSheet, `DayPager`).
 *
 * Every day used to be rendered the moment the list had its width — two
 * weeks of rows, mid-rise, on the thread the rise is drawn on.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Animated, Text } from 'react-native';
import { DAYS_AFTER_RISE_MS, TodayTimesSheet, type TimesSheetDay } from '../src/screens/home/TodayTimesSheet';

// The sheet's own frame is not what is under test: its children, plainly.
jest.mock('../src/screens/home/MinimalSheet', () => ({
  MinimalSheet: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: { text: '#fff', muted: '#aaa', accentSolid: '#0f0', card: '#000', border: '#333', textSolid: '#fff', accent: '#0f0' },
    isDark: true,
  }),
}));

const DAYS = 14;
const days: TimesSheetDay[] = Array.from({ length: DAYS }, (_, i) => ({
  offset: i - 3,
  rows: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(name => ({
    key: name,
    name,
    // A time no other day has: which days are built can be read off the tree.
    time: `d${i - 3}-${name}`,
    secondary: false,
    lit: false,
  })),
}));

function daysBuilt(root: ReactTestRenderer): Set<string> {
  const seen = new Set<string>();
  for (const node of root.root.findAllByType(Text)) {
    const c = node.props.children;
    const m = typeof c === 'string' ? /^d(-?\d+)-/.exec(c) : null;
    if (m) seen.add(m[1]);
  }
  return seen;
}

describe('the sheet opens on one day', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('builds the day on show under the rise, and the rest after it', async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <TodayTimesSheet
          visible
          progress={new Animated.Value(1)}
          onClose={() => {}}
          title="Today"
          rows={days[3].rows}
          days={days}
          offset={0}
          onTurn={() => {}}
          isToday
          onBackToToday={() => {}}
        />,
      );
    });
    // The list has its width: the moment every day used to be built.
    const pager = root.root.findAll(n => typeof n.props.onLayout === 'function' && n.props.style && !n.props.data)[0];
    await act(async () => {
      pager.props.onLayout({ nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } } });
    });
    // And the list its own measurements, as a device gives them (the test
    // renderer lays nothing out, and a list with no size has no window).
    const scroller = root.root.findAll(n => typeof n.props.onContentSizeChange === 'function')[0];
    await act(async () => {
      scroller.props.onLayout({ nativeEvent: { layout: { width: 360, height: 300, x: 0, y: 0 } } });
      scroller.props.onContentSizeChange(360 * DAYS, 300);
      // …and where it stands: on the day on show (the fourth page).
      scroller.props.onScroll({
        timeStamp: 1,
        nativeEvent: {
          contentOffset: { x: 360 * 3, y: 0 },
          contentSize: { width: 360 * DAYS, height: 300 },
          layoutMeasurement: { width: 360, height: 300 },
        },
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(DAYS_AFTER_RISE_MS - 50);
    });
    const early = daysBuilt(root);
    expect(early.has('0')).toBe(true);
    // Not the two weeks: the day on show, and at most what the list lays
    // beside it.
    expect(early.size).toBeLessThanOrEqual(3);

    // The rise is over. The list takes its batches a timer apart, each
    // scheduled by the render before it: a round of the clock for each.
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }
    expect(daysBuilt(root).size).toBe(DAYS);
    await act(async () => root.unmount());
  });
});
