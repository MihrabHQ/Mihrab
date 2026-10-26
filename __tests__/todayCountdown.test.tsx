/**
 * The hero countdown: seconds, and where it is pointed.
 *
 * Two behaviours worth pinning. The seconds are a formatting rule with an
 * awkward edge (under a minute is "0m 07s", not "07s" on its own), and the
 * aiming is the only place on Home where a tap changes what a number means
 * — including the part that is easy to get wrong, that tapping the same row
 * twice gives the hero back to whatever is next.
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

import { Text } from 'react-native';
import { TodayCard } from '../src/screens/home/TodayCard';
import { countdownParts } from '../src/utils/prayerTimes';

describe('countdownParts', () => {
  it('splits hours, minutes and seconds', () => {
    expect(countdownParts(2 * 3600 + 47 * 60 + 9)).toEqual({
      main: '2h 47m',
      seconds: '09',
    });
  });

  it('keeps the minutes visible under an hour, and under a minute', () => {
    expect(countdownParts(47 * 60 + 30)).toEqual({ main: '47m', seconds: '30' });
    // "07s" alone would read as seven seconds of something unspecified.
    expect(countdownParts(7)).toEqual({ main: '0m', seconds: '07' });
  });

  it('floors at zero rather than counting past it', () => {
    expect(countdownParts(-90)).toEqual({ main: '0m', seconds: '00' });
  });
});

// 13:00, so Asr/Maghrib/Isha are ahead and Fajr/Sunrise/Dhuhr are behind.
const AT_ONE = new Date(2026, 7, 23, 13, 0, 0);
const TIMINGS = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

function renderCard(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TodayCard
        week={[TIMINGS, TIMINGS]}
        nextInfo={{ name: 'Asr', at: new Date(2026, 7, 23, 15, 0, 0) }}
        resetKey="test"
        getDayLabel={() => 'Today'}
        getDayDate={() => '23 August'}
        getWeekday={() => 'Sunday'}
      />,
    );
  });
  return tree;
}

/** The eyebrow carries the name the hero is counting to. */
function heroPrayer(tree: ReactTestRenderer): string {
  // The label alone, or — aimed by a tap — the label and the word after it.
  const line = tree.root
    .findAllByType(Text)
    .map(n => (Array.isArray(n.props.children) ? n.props.children[0] : n.props.children))
    .find(c => typeof c === 'string' && c.startsWith('home.nextPrayerIn:'));
  const parts = String(line).split(',');
  return parts[parts.length - 1];
}

/** The eyebrow's own control while the hero is aimed: the word, and the tap that hands back. */
function chosenEyebrow(tree: ReactTestRenderer) {
  // By props, not by type: the Pressable is a forwardRef (see `rowFor`).
  const p = tree.root.findAll(
    n => n.props.accessibilityLabel === 'a11y.countdownHere' && typeof n.props.onPress === 'function',
  )[0];
  if (!p) return null;
  const word = p
    .findAllByType(Text)
    .flatMap(n => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .find(c => typeof c === 'string' && c.includes('home.chosenTarget'));
  return { press: () => p.props.onPress(), word };
}

/**
 * Read the row through its props rather than its markup: PrayerRow is
 * memo-wrapped and its Pressable is a forwardRef, neither of which
 * findAllByType matches, and what the test is about is whether the row was
 * given something to do.
 */
function rowFor(tree: ReactTestRenderer, prayer: string) {
  return tree.root.findAllByProps({ prayerKey: prayer })[0]?.props as
    | { onSelect?: () => void; isNext: boolean; isChosen?: boolean }
    | undefined;
}

describe('aiming the countdown', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AT_ONE);
  });
  afterAll(() => jest.useRealTimers());

  it('counts down to the next prayer until told otherwise', () => {
    expect(heroPrayer(renderCard())).toBe('prayer.Asr');
  });

  it('offers only the prayers still ahead', () => {
    const tree = renderCard();
    expect(rowFor(tree, 'Isha')?.onSelect).toBeDefined();
    expect(rowFor(tree, 'Maghrib')?.onSelect).toBeDefined();
    // Behind us: a countdown to it would be a negative number.
    expect(rowFor(tree, 'Dhuhr')?.onSelect).toBeUndefined();
    expect(rowFor(tree, 'Fajr')?.onSelect).toBeUndefined();
  });

  it('points the hero at a tapped prayer, and back again on a second tap', () => {
    const tree = renderCard();
    act(() => {
      rowFor(tree, 'Isha')?.onSelect?.();
    });
    expect(heroPrayer(tree)).toBe('prayer.Isha');
    // The emphasis follows the hero, so Asr gives it up.
    expect(rowFor(tree, 'Isha')?.isNext).toBe(true);
    expect(rowFor(tree, 'Isha')?.isChosen).toBe(true);
    expect(rowFor(tree, 'Asr')?.isNext).toBe(false);

    act(() => {
      rowFor(tree, 'Isha')?.onSelect?.();
    });
    expect(heroPrayer(tree)).toBe('prayer.Asr');
    expect(rowFor(tree, 'Isha')?.isChosen).toBe(false);
  });

  it('says so in the eyebrow while aimed, and a tap there hands the hero back (2.33)', () => {
    const tree = renderCard();
    expect(chosenEyebrow(tree)).toBeNull();
    act(() => {
      rowFor(tree, 'Isha')?.onSelect?.();
    });
    const aimed = chosenEyebrow(tree);
    expect(aimed?.word).toBe(' · home.chosenTarget');
    act(() => {
      aimed?.press();
    });
    expect(heroPrayer(tree)).toBe('prayer.Asr');
    expect(rowFor(tree, 'Isha')?.isChosen).toBe(false);
    expect(chosenEyebrow(tree)).toBeNull();
  });
});

describe('coming back to the hero (2.33)', () => {
  const w = require('../src/boot/launchWarp') as typeof import('../src/boot/launchWarp');
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AT_ONE);
  });
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    mockFocused.value = true;
    w._resetLaunchWarpForTests();
  });

  /** The hours-and-minutes span of the countdown, as text. */
  const countdown = (tree: ReactTestRenderer) =>
    tree.root
      .findAllByType(Text)
      .map(n => n.props.children)
      .find(c => typeof c === 'string' && /^\d+ \d+$|^\d+$/.test(c)) as string | undefined;

  const settle = (tree: ReactTestRenderer) => {
    // The launch's own run (no picture here: from the interval's start)
    // runs out: the fade's cap, the sky's, the run, the stall allowance.
    act(() => {
      jest.advanceTimersByTime(w.WARP_HIDE_WAIT_MAX_MS + w.WARP_READY_MAX_MS + w.WARP_MAX_MS + w.WARP_STALL_MAX_MS + 100);
    });
    act(() => {
      tree.update(card());
    });
  };
  const card = () => (
    <TodayCard
      week={[TIMINGS, TIMINGS]}
      nextInfo={{ name: 'Asr', at: new Date(2026, 7, 23, 15, 0, 0) }}
      resetKey="test"
      getDayLabel={() => 'Today'}
      getDayDate={() => '23 August'}
      getWeekday={() => 'Sunday'}
    />
  );

  it('runs to now from the numbers it was left at, after a while away', () => {
    const tree = renderCard();
    settle(tree);
    expect(w.warpProgress()).toBeNull();
    const before = countdown(tree);
    // Away on another tab for a minute: the clock stops.
    act(() => {
      mockFocused.value = false;
      tree.update(card());
    });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    // Back: a run is decided from what was shown, and until it begins the
    // hero still shows those numbers rather than jumping.
    act(() => {
      mockFocused.value = true;
      tree.update(card());
    });
    const progress = w.warpProgress();
    expect(progress).not.toBeNull();
    expect(progress?.e).toBe(0);
    // From the numbers shown when it was left (a few seconds past one),
    // not from now: a minute less.
    const start = progress?.start;
    expect(start?.remaining).toBeGreaterThan(2 * 3600 - 10);
    expect(start?.remaining).toBeLessThan(2 * 3600);
    expect(Date.now() - (start?.at ?? 0)).toBeGreaterThanOrEqual(60_000);
    expect(countdown(tree)).toBe(before);
  });

  it('simply picks up after a few seconds away', () => {
    const tree = renderCard();
    settle(tree);
    act(() => {
      mockFocused.value = false;
      tree.update(card());
    });
    act(() => {
      jest.advanceTimersByTime(w.RESUME_RUN_MIN_MS - 2000);
    });
    act(() => {
      mockFocused.value = true;
      tree.update(card());
    });
    expect(w.warpProgress()).toBeNull();
  });
});
