/**
 * Back where you were, after the system closed the app behind your back
 * (src/navigation/resumeWhereLeft.ts; IMPROVEMENT_ROADMAP.md §1.1).
 */
import fs from 'fs';
import path from 'path';

const mockStore = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString(key: string) {
      return mockStore.get(key);
    }
    set(key: string, value: string) {
      mockStore.set(key, value);
    }
    delete(key: string) {
      mockStore.delete(key);
    }
  },
}));

import {
  RESTORABLE,
  RESUME_KEY,
  RESUME_WINDOW_MS,
  _resetResumeForTests,
  isJustToday,
  noteLeft,
  noteNavigationState,
  noteReaderPosition,
  placeOf,
  readResumeState,
  stateOf,
} from '../src/navigation/resumeWhereLeft';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

const tabs = (name: string, params?: object) => ({
  name: 'Home',
  key: 'home',
  state: {
    index: ['TodayTab', 'QuranTab', 'HadithTab', 'DhikrTab', 'LogTab'].indexOf(name),
    routes: ['TodayTab', 'QuranTab', 'HadithTab', 'DhikrTab', 'LogTab'].map(n =>
      n === name && params ? { name: n, params } : { name: n },
    ),
  },
});
const root = (...routes: object[]) => ({ index: routes.length - 1, routes });
const reader = (params: object, key = 'reader-1') => ({ name: 'QuranSurah', key, params });

beforeEach(() => {
  mockStore.clear();
  _resetResumeForTests();
});

describe('the place a state stands for', () => {
  it('is the tab on show and the screens open over it', () => {
    expect(placeOf(root(tabs('QuranTab'), reader({ surahNumber: 20, initialPage: 316 })))).toEqual({
      tab: 'QuranTab',
      stack: [{ name: 'QuranSurah', params: { surahNumber: 20, initialPage: 316 } }],
    });
    // Settings is pushed over Today now, not a tab of its own.
    expect(placeOf(root(tabs('TodayTab'), { name: 'Settings' }, { name: 'SettingsNotifications' }))).toEqual({
      tab: 'TodayTab',
      stack: [{ name: 'Settings' }, { name: 'SettingsNotifications' }],
    });
    expect(placeOf(root(tabs('HadithTab'), { name: 'HadithList', params: { list: 'set:nawawi40' } }, { name: 'HadithReader', params: { id: 'h:5456', list: 'set:nawawi40' } }))).toEqual({
      tab: 'HadithTab',
      stack: [
        { name: 'HadithList', params: { list: 'set:nawawi40' } },
        { name: 'HadithReader', params: { id: 'h:5456', list: 'set:nawawi40' } },
      ],
    });
  });

  it('before the tabs have a state of their own, they are on Today', () => {
    expect(placeOf(root({ name: 'Home' }))).toEqual({ tab: 'TodayTab', stack: [] });
  });

  it('keeps a Du\'as category, and no parameter it was not told of', () => {
    expect(placeOf(root(tabs('DhikrTab', { view: 'duas', category: 'evening', other: 1 })))).toEqual({
      tab: 'DhikrTab',
      tabParams: { view: 'duas', category: 'evening' },
      stack: [],
    });
    expect(
      placeOf(root(tabs('TodayTab'), { name: 'SettingsLocation', params: { highlight: 'savedLocations', activateOnAdd: true } })),
    ).toEqual({ tab: 'TodayTab', stack: [{ name: 'SettingsLocation' }] });
    // A function, an object, a number where a string belongs: dropped.
    expect(
      placeOf(root(tabs('QuranTab'), reader({ surahNumber: 2, initialPage: '7', scrollToAyah: NaN, onDone: () => {} })))!
        .stack[0],
    ).toEqual({ name: 'QuranSurah', params: { surahNumber: 2 } });
  });

  it('is cut at a screen that is something in progress, not a place', () => {
    // The walkthrough, a month being shared.
    expect(placeOf(root(tabs('TodayTab'), { name: 'Onboarding' }))!.stack).toEqual([]);
    expect(
      placeOf(root(tabs('TodayTab'), { name: 'MonthTimes' }, { name: 'ShareMonth', params: { year: 2026, month: 11 } }))!.stack,
    ).toEqual([{ name: 'MonthTimes' }]);
    // A recitation about to start, a Hifz test.
    expect(placeOf(root(tabs('QuranTab'), reader({ surahNumber: 2, playFromAyah: 5 })))!.stack).toEqual([]);
    expect(placeOf(root(tabs('QuranTab'), { name: 'Hifz' }, reader({ surahNumber: 2, hifzReview: 'j30' })))!.stack).toEqual([
      { name: 'Hifz' },
    ]);
    // A reader with no surah.
    expect(placeOf(root(tabs('QuranTab'), reader({})))!.stack).toEqual([]);
  });

  it('counts only what is on show: a route above the index is one being closed', () => {
    expect(
      placeOf({ index: 0, routes: [tabs('LogTab'), { name: 'Fasting' }] }),
    ).toEqual({ tab: 'LogTab', stack: [] });
  });

  it('is nothing without the tabs under it', () => {
    expect(placeOf(root({ name: 'Onboarding' }))).toBeNull();
    expect(placeOf(undefined)).toBeNull();
    expect(placeOf({ routes: 'x' })).toBeNull();
  });

  it('names only screens the navigator has', () => {
    const navigator = fs.readFileSync(path.join(__dirname, '..', 'src/navigation/types.ts'), 'utf8');
    const stack = navigator.slice(navigator.indexOf('export type RootStackParamList'));
    for (const name of Object.keys(RESTORABLE)) expect(stack).toMatch(new RegExp(`^  ${name}:`, 'm'));
    expect(RESTORABLE.Onboarding).toBeUndefined();
    expect(RESTORABLE.ShareMonth).toBeUndefined();
  });
});

describe('what the app starts on', () => {
  it('Today alone keeps nothing: that launch is what it always was', () => {
    noteNavigationState(root(tabs('TodayTab')), T0);
    expect(mockStore.has(RESUME_KEY)).toBe(false);
    expect(readResumeState(T0 + MIN)).toBeUndefined();
    expect(isJustToday({ tab: 'TodayTab', stack: [] })).toBe(true);
  });

  it('the place left, within the half hour', () => {
    noteNavigationState(root(tabs('QuranTab'), reader({ surahNumber: 20, initialPage: 316 })), T0);
    expect(readResumeState(T0 + 2 * MIN)).toEqual({
      index: 1,
      routes: [
        { name: 'Home', state: { index: 0, routes: [{ name: 'QuranTab' }] } },
        { name: 'QuranSurah', params: { surahNumber: 20, initialPage: 316 } },
      ],
    });
    expect(readResumeState(T0 + RESUME_WINDOW_MS)).toBeDefined();
  });

  it('Today, after it: someone opening a prayer app, not coming back to a page', () => {
    noteNavigationState(root(tabs('QuranTab')), T0);
    expect(readResumeState(T0 + RESUME_WINDOW_MS + 1)).toBeUndefined();
  });

  it('the half hour counts from when the app was left, not from the last tap', () => {
    noteNavigationState(root(tabs('LogTab')), T0);
    noteLeft(T0 + 50 * MIN);
    expect(readResumeState(T0 + 70 * MIN)).toEqual(stateOf({ tab: 'LogTab', stack: [] }));
    expect(readResumeState(T0 + 81 * MIN)).toBeUndefined();
  });

  it('going back to Today forgets the place', () => {
    noteNavigationState(root(tabs('QuranTab')), T0);
    noteNavigationState(root(tabs('TodayTab')), T0 + MIN);
    expect(readResumeState(T0 + 2 * MIN)).toBeUndefined();
  });

  it('a clock set back, a record from another build, or rubbish: Today', () => {
    noteNavigationState(root(tabs('QuranTab')), T0);
    expect(readResumeState(T0 - MIN)).toBeUndefined();
    mockStore.set(RESUME_KEY, JSON.stringify({ v: 2, at: T0, place: { tab: 'QuranTab', stack: [] } }));
    expect(readResumeState(T0 + MIN)).toBeUndefined();
    mockStore.set(RESUME_KEY, '{not json');
    expect(readResumeState(T0 + MIN)).toBeUndefined();
    // A screen a later build no longer has is dropped as it is read, with what stood on it.
    mockStore.set(
      RESUME_KEY,
      JSON.stringify({ v: 1, at: T0, place: { tab: 'LogTab', stack: [{ name: 'Gone' }, { name: 'Fasting' }] } }),
    );
    expect(readResumeState(T0 + MIN)).toEqual(stateOf({ tab: 'LogTab', stack: [] }));
  });
});

describe('the reader comes back to the page it was turned to', () => {
  const open = root(tabs('QuranTab'), reader({ surahNumber: 20, initialPage: 312 }));

  it('the muṣḥaf: the page, and never an ayah that might have begun on the page before', () => {
    noteNavigationState(open, T0);
    noteReaderPosition({ surah: 20, ayah: 65, page: 316, mode: 'mushaf' }, T0 + MIN);
    expect(readResumeState(T0 + 2 * MIN)!.routes[1]).toEqual({
      name: 'QuranSurah',
      params: { surahNumber: 20, initialPage: 316 },
    });
  });

  it('into the next surah, if that is where the reading went', () => {
    noteNavigationState(open, T0);
    noteReaderPosition({ surah: 21, ayah: 1, page: 322, mode: 'mushaf' }, T0 + MIN);
    expect(readResumeState(T0 + 2 * MIN)!.routes[1]).toEqual({
      name: 'QuranSurah',
      params: { surahNumber: 21, initialPage: 322 },
    });
  });

  it('verse by verse: the ayah', () => {
    noteNavigationState(open, T0);
    noteReaderPosition({ surah: 20, ayah: 71, page: 316, mode: 'withTranslation' }, T0 + MIN);
    expect(readResumeState(T0 + 2 * MIN)!.routes[1]).toEqual({
      name: 'QuranSurah',
      params: { surahNumber: 20, scrollToAyah: 71 },
    });
  });

  it('a marker set by hand is not where the reader is', () => {
    noteNavigationState(open, T0);
    noteReaderPosition({ surah: 2, ayah: 255, page: 42, mode: 'mushaf', pinned: true }, T0 + MIN);
    expect(readResumeState(T0 + 2 * MIN)!.routes[1]).toEqual({
      name: 'QuranSurah',
      params: { surahNumber: 20, initialPage: 312 },
    });
  });

  it('a position belongs to the reader it was noted in', () => {
    noteNavigationState(open, T0);
    noteReaderPosition({ surah: 20, ayah: 65, page: 316, mode: 'mushaf' }, T0 + MIN);
    // Closed, and another surah opened: its own opening page, not the last one's.
    noteNavigationState(root(tabs('QuranTab')), T0 + 2 * MIN);
    noteNavigationState(root(tabs('QuranTab'), reader({ surahNumber: 36, initialPage: 440 }, 'reader-2')), T0 + 3 * MIN);
    expect(readResumeState(T0 + 4 * MIN)!.routes[1]).toEqual({
      name: 'QuranSurah',
      params: { surahNumber: 36, initialPage: 440 },
    });
    // …and one noted with no reader open is nobody's.
    noteNavigationState(root(tabs('QuranTab')), T0 + 5 * MIN);
    noteReaderPosition({ surah: 1, ayah: 1, page: 1, mode: 'mushaf' }, T0 + 6 * MIN);
    expect(readResumeState(T0 + 7 * MIN)).toEqual(stateOf({ tab: 'QuranTab', stack: [] }));
  });
});

describe('the wiring', () => {
  const rootFile = fs.readFileSync(path.join(__dirname, '..', 'src/AppNavigationRoot.tsx'), 'utf8');

  it('the container starts on the kept place, keeps the place as it changes, and is told when the app is left', () => {
    expect(rootFile).toContain('const RESUME_STATE = readResumeState();');
    expect(rootFile).toContain('initialState={RESUME_STATE}');
    expect(rootFile).toContain('onStateChange={noteNavigationState}');
    expect(rootFile).toMatch(/if \(state !== 'active'\) noteLeft\(\);/);
  });

  it('a start that was sent somewhere still goes there, and the pressed notification is asked for once', () => {
    expect(rootFile).toMatch(/\? \{ \.\.\.linking, getInitialURL: async \(\) => null \}\s+: linking;/);
    expect(rootFile).toContain('linking={CONTAINER_LINKING}');
    expect(rootFile).toMatch(/if \(RESUME_STATE\) \{[\s\S]{0,400}hideLaunchSnapshot\(\);\s+followLaunchLink\(\);/);
  });

  it('the reader notes its position where it records it', () => {
    const marks = fs.readFileSync(path.join(__dirname, '..', 'src/quran/readerMarks.ts'), 'utf8');
    expect(marks).toMatch(/export function setLastRead\([^)]*\): void \{\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+noteReaderPosition\(pos\);/);
  });
});
