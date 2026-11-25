/**
 * The strip never goes blank on the weeks it is showing.
 *
 * Seen on a phone (2026-11-25, the first launch after an update): the Log's
 * strip drew its seven row labels and not one square, and stayed that way
 * until the app was restarted. The record was whole — the figures above it
 * were right.
 *
 * THE CAUSE. The strip draws only the weeks on show (stripWindow.ts) and
 * learns which those are from scroll events. Android does not promise the
 * last one: with `scrollEventThrottle` an event that follows another within
 * the throttle is dropped, and nothing is sent afterwards for where the view
 * came to rest. So one event from BEFORE the view was parked on today —
 * the offset still at the oldest edge — followed by the parking scroll's
 * event being dropped left the strip sure it was showing weeks from months
 * ago, drawing those and blanks under the reader's eyes.
 *
 * THE RULE. Until a finger has moved the strip it is on today
 * (useHistoryScroll holds it there), so that is where the window is,
 * whatever an event says. After a finger has, the end of the drag and of
 * the glide are read as well as the scroll events between — those two are
 * always sent.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView } from 'react-native';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      accent: '#2E7D5B',
      accentSolid: '#2E7D5B',
      text: '#111111',
      textSolid: '#111111',
      muted: '#777777',
      danger: '#B3261E',
      border: '#DDDDDD',
      card: '#FFFFFF',
      bg: '#FFFFFF',
      isDark: false,
    },
    isDark: false,
  }),
}));
let mockRtl = false;
jest.mock('../src/i18n/useLayoutRtl', () => ({ useLayoutRtl: () => mockRtl }));

import { PracticeStrip } from '../src/practice/PracticeStrip';
import type { StripDay } from '../src/practice/stripRecord';

const WEEKS = 30;
/** One week's width in the strip: seven days of 9 + 3, and the week's gap. */
const WEEK = 7 * 12 + 6;
const VIEW = 4 * WEEK;
const CONTENT = WEEKS * WEEK;

function days(): StripDay[] {
  const out: StripDay[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    out.push({
      key: `d${String(i).padStart(3, '0')}`,
      weekday: i % 7,
      prayers: ['on-time', 'on-time', 'on-time', 'on-time', 'on-time'],
      fasted: false,
      sunnah: 0,
      qiyam: false,
      unaccounted: false,
      beforeRecord: false,
      future: false,
      monthStart: false,
    });
  }
  return out;
}
const NEWEST = `d${String(WEEKS * 7 - 1).padStart(3, '0')}`;
const OLDEST = 'd000';

/** A day's column is the one element whose label starts with its key. */
function drawn(tree: ReactTestRenderer, key: string): boolean {
  return (
    tree.root.findAll(
      n => typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(key),
    ).length > 0
  );
}

function scrollEvent(x: number, content = CONTENT) {
  return {
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: content, height: 100 },
      layoutMeasurement: { width: VIEW, height: 100 },
    },
  };
}

async function mount(): Promise<{ tree: ReactTestRenderer; scroll: () => any }> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<PracticeStrip days={days()} onReachOldest={() => {}} />);
  });
  const scroll = () => tree.root.findByType(ScrollView).props;
  await act(async () => {
    scroll().onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: VIEW, height: 100 } } });
    scroll().onContentSizeChange(CONTENT, 100);
  });
  return { tree, scroll };
}

describe.each([
  ['left to right', false, 0, CONTENT - VIEW],
  ['right to left', true, CONTENT - VIEW, 0],
])('the strip, %s', (_name, rtl, oldestOffset, todayOffset) => {
  beforeEach(() => {
    mockRtl = rtl;
  });

  it('opens with the newest weeks drawn', async () => {
    const { tree } = await mount();
    expect(drawn(tree, NEWEST)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('an event from before it was parked, and the parking event lost: today is still drawn', async () => {
    const { tree, scroll } = await mount();
    // The one event Android did send: the view still at the oldest edge.
    await act(async () => {
      scroll().onScroll(scrollEvent(oldestOffset));
    });
    // The event for the scroll to today never comes (throttled away).
    expect(drawn(tree, NEWEST)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('an event that describes the row before it grew: today is still drawn', async () => {
    const { tree, scroll } = await mount();
    // Parked on a row ten weeks shorter; the row has since grown and the
    // event carries the new width with the old offset.
    const stale = rtl ? 10 * WEEK : CONTENT - VIEW - 10 * WEEK;
    await act(async () => {
      scroll().onScroll(scrollEvent(stale));
    });
    expect(drawn(tree, NEWEST)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('a finger moves it: the weeks under it are drawn, and today is let go', async () => {
    const { tree, scroll } = await mount();
    await act(async () => {
      scroll().onScrollBeginDrag();
      scroll().onScroll(scrollEvent(oldestOffset));
    });
    expect(drawn(tree, OLDEST)).toBe(true);
    expect(drawn(tree, NEWEST)).toBe(false);
    await act(async () => tree.unmount());
  });

  it('the glide ends somewhere no scroll event reported: the end is read', async () => {
    const { tree, scroll } = await mount();
    await act(async () => {
      scroll().onScrollBeginDrag();
      scroll().onScroll(scrollEvent(todayOffset));
    });
    expect(drawn(tree, OLDEST)).toBe(false);
    // Every scroll event of the glide was throttled away; its end is sent.
    await act(async () => {
      scroll().onMomentumScrollEnd(scrollEvent(oldestOffset));
    });
    expect(drawn(tree, OLDEST)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('a drag let go without a glide: its end is read too', async () => {
    const { tree, scroll } = await mount();
    await act(async () => {
      scroll().onScrollBeginDrag();
      scroll().onScrollEndDrag(scrollEvent(oldestOffset));
    });
    expect(drawn(tree, OLDEST)).toBe(true);
    await act(async () => tree.unmount());
  });
});
