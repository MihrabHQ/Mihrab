/**
 * The tour: every screen the app has, rendered once.
 *
 * It asserts little — that a screen renders, and that the list of screens
 * that do does not shrink. What it is FOR is `tools/compiler-differential.js`:
 * under its recorder each of these trees is drawn compiled and as written,
 * then shaken (the clock a day on, the language, the text size, a render
 * from the top) and drawn again, and the two must agree
 * (jest/differential.js). A screen on this tour is a screen whose
 * components are held to "compiled draws what the code as written draws"
 * without anyone writing a test about the compiler.
 *
 * A NEW SCREEN: add it to SCREENS. `the tour covers every route` fails
 * until it is here or named in NOT_TOURED with the reason.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import path from 'path';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => () => {}),
  removeListener: jest.fn(),
  canGoBack: () => true,
  isFocused: () => true,
  dispatch: jest.fn(),
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [{ key: 'k', name: 'Home' }] }),
  popToTop: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  pop: jest.fn(),
  reset: jest.fn(),
};
let mockParams: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => {
  const R = require('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => mockNavigation,
    useRoute: () => ({ key: 'tour', name: 'Tour', params: mockParams }),
    useIsFocused: () => true,
    // A focus is a mount, here: the screen is the only one there is.
    useFocusEffect: (effect: () => void | (() => void)) => R.useEffect(effect, [effect]),
    useScrollToTop: () => {},
  };
});
jest.mock('@react-navigation/elements', () => ({
  ...jest.requireActual('@react-navigation/elements'),
  useHeaderHeight: () => 56,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  ...jest.requireActual('@react-navigation/bottom-tabs'),
  useBottomTabBarHeight: () => 0,
}));
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children),
    SafeAreaInsetsContext: R.createContext(insets),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

// A LIVED-IN APP, not a first launch: a place, a day's times, prayers
// logged, a page being read. An empty screen has little that could go
// stale; what the differential is for is the screen with something on it.
jest.mock('../src/context/PrayerSettingsContext', () => {
  const actual = jest.requireActual('../src/context/PrayerSettingsContext');
  const { DEFAULT_SETTINGS } = jest.requireActual('../src/settings/types');
  const settings = {
    ...DEFAULT_SETTINGS,
    locationOnboardingComplete: true,
    locationMode: 'manual',
    manualLatitude: 59.3293,
    manualLongitude: 18.0686,
    dataProviderAuto: false,
  };
  return {
    ...actual,
    usePrayerSettings: () => ({ settings, hydrated: true, updateSettings: jest.fn() }),
    usePrayerSettingsOrDefaults: () => ({ settings, hydrated: true, updateSettings: jest.fn() }),
  };
});
jest.mock('../src/hooks/usePrayerDay', () => {
  const day = { Fajr: '05:00', Sunrise: '06:15', Dhuhr: '12:05', Asr: '15:20', Maghrib: '18:10', Isha: '19:30' };
  const state = {
    phase: 'ready',
    latitude: 59.3293,
    longitude: 18.0686,
    today: day,
    tomorrow: day,
    week: [day, day, day, day, day, day, day],
  };
  return { ...jest.requireActual('../src/hooks/usePrayerDay'), usePrayerDay: () => ({ state, retry: jest.fn() }) };
});

import '../src/i18n';
import { loadPractice, primePractice } from '../src/practice/practiceStore';
import { setLastRead } from '../src/quran/readerMarks';
import { PrayerSettingsProvider } from '../src/context/PrayerSettingsContext';
import { WindowSizeProvider } from '../src/responsive/windowSize';
import { SETTINGS_STACK_PAGES } from '../src/screens/settings/subpages';

type Screen = { route: string; get: () => React.ComponentType<any>; params?: Record<string, unknown> };

const SCREENS: Screen[] = [
  { route: 'TodayTab', get: () => require('../src/screens/HomeScreen').HomeScreen },
  { route: 'QuranTab', get: () => require('../src/screens/QuranScreen').QuranScreen },
  { route: 'TasbihTab', get: () => require('../src/screens/TasbihScreen').TasbihScreen },
  { route: 'DuasTab', get: () => require('../src/screens/DuasScreen').DuasScreen },
  { route: 'LogTab', get: () => require('../src/screens/LogScreen').LogScreen },
  { route: 'SettingsTab', get: () => require('../src/screens/SettingsScreen').SettingsScreen },
  { route: 'MonthTimes', get: () => require('../src/screens/MonthTimesScreen').MonthTimesScreen },
  { route: 'Compass', get: () => require('../src/screens/CompassScreen').CompassScreen },
  { route: 'QuranSurah', get: () => require('../src/screens/QuranSurahScreen').QuranSurahScreen, params: { surahNumber: 1 } },
  { route: 'QuranListen', get: () => require('../src/screens/quran/TilawahScreen').TilawahScreen },
  { route: 'Hifz', get: () => require('../src/screens/quran/HifzScreen').HifzScreen },
  { route: 'Khatmah', get: () => require('../src/screens/quran/KhatmahScreen').KhatmahScreen },
  { route: 'QuranTajweed', get: () => require('../src/quran/tajweed/TajweedGuideScreen').TajweedGuideScreen },
  { route: 'Onboarding', get: () => require('../src/screens/OnboardingScreen').OnboardingScreen },
  { route: 'Backup', get: () => require('../src/screens/BackupScreen').BackupScreen },
  { route: 'Fasting', get: () => require('../src/screens/FastingScreen').FastingScreen },
  ...SETTINGS_STACK_PAGES.map(page => ({ route: page.route, get: page.getComponent as () => React.ComponentType<any> })),
  // Cards the phone's Today does not show (the tablet's and the desktop's
  // do), on their own: the day's summary is where "logged today" is read.
  { route: '(card) TodaySummary', get: () => require('../src/screens/home/TodaySummary').TodaySummary },
];

/** Routes with no page of their own to draw, and why. */
const NOT_TOURED: Record<string, string> = {
  Home: 'the tabs themselves; each tab is toured',
  ShareMonth: 'draws a picture off screen and opens the share sheet',
};

class Catch extends React.Component<{ children: React.ReactNode; onError: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

describe('the tour', () => {
  beforeAll(() => {
    // The shared stand-in for the alerts module has no foreground events;
    // the Log listens for a notification's buttons.
    const alerts = require('../src/native/Alerts').default as Record<string, unknown>;
    alerts.onForegroundEvent ??= jest.fn(() => () => {});
  });
  /** Today as the tour's clock has it, and the two days before. */
  const seed = () => {
    const at = (daysAgo: number) => {
      const d = new Date(Date.now() - daysAgo * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    primePractice({
      journal: [0, 1, 2].flatMap(ago =>
        (['Fajr', 'Dhuhr', 'Asr'] as const).map(prayer => ({
          date: at(ago),
          prayer,
          status: 'on-time' as const,
          loggedAt: new Date(Date.now() - ago * 86_400_000).toISOString(),
        })),
      ),
      dhikr: { [at(0)]: 2, [at(1)]: 1 },
    });
    setLastRead({ surah: 2, ayah: 17, page: 4, mode: 'mushaf' });
  };
  let quiet: jest.SpyInstance[] = [];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-10T11:00:00Z'));
    quiet = [jest.spyOn(console, 'error').mockImplementation(() => {}), jest.spyOn(console, 'warn').mockImplementation(() => {})];
  });
  afterEach(() => {
    quiet.forEach(s => s.mockRestore());
    jest.useRealTimers();
  });

  it.each(SCREENS.map(s => [s.route, s] as const))('%s renders', async (_route, screen) => {
    mockParams = screen.params;
    seed();
    // Read before the screen asks: a summary that is not hydrated draws nothing.
    await loadPractice().catch(() => {});
    let failure: unknown = null;
    let root!: ReactTestRenderer;
    const Component = screen.get();
    await act(async () => {
      root = create(
        <WindowSizeProvider>
          <PrayerSettingsProvider>
            <Catch onError={e => (failure = e)}>
              <Component navigation={mockNavigation} route={{ key: 'tour', name: screen.route, params: screen.params }} />
            </Catch>
          </PrayerSettingsProvider>
        </WindowSizeProvider>,
      );
    });
    // What the screen starts on mount: a store read, a first effect.
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    if (failure) throw failure;
    expect(root.toJSON()).not.toBeNull();
  });

  it('the tour covers every route', () => {
    const src = ['RootNavigator.tsx', 'MainTabs.tsx']
      .map(f => readFileSync(path.join(__dirname, '../src/navigation', f), 'utf8'))
      .join('\n');
    const routes = new Set([...src.matchAll(/<(?:Stack|Tab)\.Screen\s+name="(\w+)"/g)].map(m => m[1]));
    expect(routes.size).toBeGreaterThan(15);
    const toured = new Set(SCREENS.map(s => s.route));
    const missing = [...routes].filter(r => !toured.has(r) && !(r in NOT_TOURED));
    expect(missing).toEqual([]);
  });
});
