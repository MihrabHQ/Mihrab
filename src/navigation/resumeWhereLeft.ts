/**
 * BACK WHERE YOU WERE, AFTER THE SYSTEM CLOSED THE APP BEHIND YOUR BACK.
 *
 * Android reclaims a backgrounded app's process when it wants the memory
 * (IMPROVEMENT_ROADMAP.md §1.1: the most-felt problem, and not one a
 * lighter app escapes — a reclaim is a kill). Switch away to answer a
 * message in the middle of a surah, come back two minutes later, and the
 * app had started over: Today, not the Qur'an; the reader closed; the page
 * gone. Nothing was lost but the place — and the place is what was being
 * held.
 *
 * So the place is kept: which tab, which screens are open over it, and
 * where the reader is. A start within `RESUME_WINDOW_MS` of the app being
 * left opens there instead of on Today.
 *
 * ── WHY A WINDOW, AND WHY HALF AN HOUR ─────────────────────────────────
 *
 * A reclaim cannot be told from a deliberate start: both are a new
 * process. What can be told is how long ago the app was left. Minutes ago,
 * the person is coming back to what they were doing. Hours ago, they are
 * opening a prayer app — and that opens on Today, on the next prayer, as
 * it always has. Half an hour is the line: long enough for a call, a
 * message thread, a prayer; short enough that the evening's launch is not
 * the afternoon's settings page.
 *
 * ── WHAT IS KEPT, AND WHAT IS NOT ──────────────────────────────────────
 *
 * Only screens that can be opened again from their name and a few plain
 * parameters (`RESTORABLE`). The walkthrough, a month being shared, a
 * recitation about to start (`playFromAyah`) and a Hifz test in progress
 * are not: the stack is cut where the first of them stood. A start on
 * Today alone keeps nothing, so that launch is exactly what it was — the
 * kept picture, the run to now (boot/launchWarp.ts).
 *
 * The reader's position is its own: the route still says the page it was
 * opened at, so the page it has been turned to since is noted as it is
 * recorded (`noteReaderPosition`, from `setLastRead`) and written into the
 * kept route.
 *
 * ── A LINK STILL WINS ──────────────────────────────────────────────────
 *
 * An app started by a widget, a notification or a link is being sent
 * somewhere. React Navigation takes a given initial state over the
 * link's, so `AppNavigationRoot` asks for the launch link itself once the
 * container is ready and goes there (`launchLinkState`).
 *
 * ── WHERE ──────────────────────────────────────────────────────────────
 *
 * In the launch's small store (MMKV, boot/launchReads.ts), read
 * synchronously before the first render: the container needs its state
 * when it mounts, and a restore that arrived a frame later would be
 * Today flashing first. Phones, tablets and the Mac only: the browser
 * keeps its own place in the address bar, and nothing reclaims the
 * Windows and Linux app.
 */
import { Platform } from 'react-native';

export const RESUME_KEY = '@mihrab/resume/v1';
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

type Params = Record<string, string | number | boolean>;
type KeptRoute = { name: string; params?: Params };
export type KeptPlace = {
  /** The tab under everything. */
  tab: string;
  tabParams?: Params;
  /** The screens open over the tabs, bottom first. */
  stack: KeptRoute[];
};
type Kept = { v: 1; at: number; place: KeptPlace };

const TABS = ['TodayTab', 'QuranTab', 'HadithTab', 'DhikrTab', 'LogTab'] as const;

type ParamKind = 'string' | 'number' | 'boolean';
/**
 * The screens that can be opened again, and the parameters each is opened
 * with. A parameter not listed is dropped; a route carrying one of
 * `REFUSES` is not kept at all.
 */
export const RESTORABLE: Readonly<Record<string, Readonly<Record<string, ParamKind>>>> = {
  MonthTimes: {},
  Compass: {},
  QuranSurah: {
    surahNumber: 'number',
    initialPage: 'number',
    scrollToAyah: 'number',
    sessionBookmarkId: 'string',
    sessionKhatmah: 'boolean',
  },
  QuranTajweed: {},
  QuranListen: {},
  Khatmah: {},
  Hifz: {},
  Backup: {},
  Fasting: {},
  HadithReader: { id: 'string', list: 'string' },
  HadithList: { list: 'string', all: 'boolean' },
  Settings: {},
  SettingsAppearance: {},
  SettingsPrayerTimes: {},
  SettingsLocation: {},
  SettingsNotifications: {},
  SettingsQuran: {},
  SettingsWordReader: {},
  SettingsTajweed: {},
  SettingsHadith: {},
  SettingsHadithGrades: {},
  SettingsHadithLanguage: {},
  SettingsDownloads: {},
  SettingsWidgets: {},
  SettingsDevices: {},
  SettingsAbout: {},
  SettingsExtraTimes: {},
  SettingsDailyReminders: {},
  SettingsPrayerSounds: {},
  SettingsDhikrReminders: {},
  SettingsHelpMihrab: {},
  SettingsAttributions: {},
};
/** A route opened with one of these is something in progress, not a place. */
const REFUSES: Readonly<Record<string, readonly string[]>> = {
  QuranSurah: ['playFromAyah', 'hifzReview', 'hifzPractice'],
};
const TAB_PARAMS: Readonly<Record<string, Readonly<Record<string, ParamKind>>>> = {
  DhikrTab: { view: 'string', category: 'string' },
};

function plainParams(
  raw: unknown,
  allowed: Readonly<Record<string, ParamKind>>,
): Params | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Params = {};
  for (const [key, kind] of Object.entries(allowed)) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== kind) continue;
    if (kind === 'number' && !Number.isFinite(value as number)) continue;
    if (kind === 'string' && (value as string).length > 200) continue;
    out[key] = value as string | number | boolean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type AnyRoute = { name?: unknown; params?: unknown; state?: unknown };
type AnyState = { index?: unknown; routes?: unknown };

const routesOf = (state: unknown): AnyRoute[] => {
  const routes = (state as AnyState | undefined)?.routes;
  return Array.isArray(routes) ? (routes as AnyRoute[]) : [];
};

/**
 * The place a navigation state stands for, or null when it is not one to
 * keep: no tabs under it, or the walkthrough.
 */
export function placeOf(state: unknown): KeptPlace | null {
  const routes = routesOf(state);
  const index = (state as AnyState | undefined)?.index;
  // Only what is on show and under it: a state can hold routes above the
  // index for a moment, while a screen is being closed.
  const shown = typeof index === 'number' ? routes.slice(0, index + 1) : routes;
  if (shown.length === 0 || shown[0].name !== 'Home') return null;

  const home = shown[0];
  const tabRoutes = routesOf(home.state);
  const tabIndex = (home.state as AnyState | undefined)?.index;
  const tabRoute = tabRoutes[typeof tabIndex === 'number' ? tabIndex : 0];
  // Before the tabs have a state of their own they are on the first.
  const tab =
    typeof tabRoute?.name === 'string' && (TABS as readonly string[]).includes(tabRoute.name)
      ? tabRoute.name
      : 'TodayTab';
  const tabParams = TAB_PARAMS[tab] ? plainParams(tabRoute?.params, TAB_PARAMS[tab]) : undefined;

  const stack: KeptRoute[] = [];
  for (const route of shown.slice(1)) {
    const name = typeof route.name === 'string' ? route.name : '';
    const allowed = RESTORABLE[name];
    if (!allowed) break;
    const refused = REFUSES[name] ?? [];
    const params = (route.params ?? {}) as Record<string, unknown>;
    if (refused.some(key => params[key] != null && params[key] !== false)) break;
    const kept = plainParams(params, allowed);
    // A reader with no surah is not a reader.
    if (name === 'QuranSurah' && typeof kept?.surahNumber !== 'number') break;
    stack.push(kept ? { name, params: kept } : { name });
  }
  return { tab, ...(tabParams ? { tabParams } : null), stack };
}

/** Today alone: the launch the app has always had. */
export function isJustToday(place: KeptPlace): boolean {
  return place.tab === 'TodayTab' && place.stack.length === 0;
}

/** The state React Navigation is started with, for a kept place. */
export function stateOf(place: KeptPlace) {
  const home = {
    name: 'Home',
    state: {
      index: 0,
      routes: [place.tabParams ? { name: place.tab, params: place.tabParams } : { name: place.tab }],
    },
  };
  return {
    index: place.stack.length,
    routes: [home, ...place.stack.map(r => (r.params ? { name: r.name, params: r.params } : { name: r.name }))],
  };
}

// ── The store ──────────────────────────────────────────────────────────

type Fast = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};
let fast: Fast | null | undefined;
function store(): Fast | null {
  if (fast !== undefined) return fast;
  if (Platform.OS === 'web') return (fast = null);
  try {
    const { MMKV } = require('react-native-mmkv') as { MMKV: new (c: { id: string }) => Fast };
    fast = new MMKV({ id: 'mihrab.launch' });
  } catch {
    fast = null;
  }
  return fast;
}

// ── Keeping ────────────────────────────────────────────────────────────

let current: KeptPlace | null = null;
let readerAt: { surah: number; ayah: number; page: number; mode: string } | null = null;
let readerOf: string | null = null;

/** The reader's own position, written over the page its route was opened at. */
function withReader(place: KeptPlace): KeptPlace {
  const top = place.stack[place.stack.length - 1];
  if (!top || top.name !== 'QuranSurah' || !readerAt) return place;
  const params: Params = { ...(top.params ?? {}), surahNumber: readerAt.surah };
  if (readerAt.mode === 'mushaf') {
    // The page, and not an ayah: an ayah that began on the page before
    // would open that page instead (pages.ts, resolveOpenPage).
    params.initialPage = readerAt.page;
    delete params.scrollToAyah;
  } else {
    params.scrollToAyah = readerAt.ayah;
    delete params.initialPage;
  }
  return { ...place, stack: [...place.stack.slice(0, -1), { name: top.name, params }] };
}

function write(now: number): void {
  const f = store();
  if (!f) return;
  try {
    if (!current || isJustToday(current)) {
      f.delete(RESUME_KEY);
      return;
    }
    const kept: Kept = { v: 1, at: now, place: withReader(current) };
    f.set(RESUME_KEY, JSON.stringify(kept));
  } catch {
    // Then the next start is on Today, as it was.
  }
}

/** `NavigationContainer`'s `onStateChange` (and its first state, at `onReady`). */
export function noteNavigationState(state: unknown, now: number = Date.now()): void {
  const place = placeOf(state);
  // The reader's position belongs to the reader it was noted in.
  const routes = routesOf(state);
  const index = (state as AnyState | undefined)?.index;
  const top = routes[typeof index === 'number' ? index : routes.length - 1] as
    | (AnyRoute & { key?: unknown })
    | undefined;
  const key = top?.name === 'QuranSurah' && typeof top.key === 'string' ? top.key : null;
  if (key !== readerOf) {
    readerOf = key;
    readerAt = null;
  }
  current = place;
  write(now);
}

/** A page turned or a verse scrolled to, as the reader records it (`setLastRead`). */
export function noteReaderPosition(
  pos: { surah: number; ayah: number; page: number; mode: string; pinned?: boolean },
  now: number = Date.now(),
): void {
  // A marker set by hand is put on an ayah, not where the reader is.
  if (pos.pinned || readerOf == null) return;
  readerAt = { surah: pos.surah, ayah: pos.ayah, page: pos.page, mode: pos.mode };
  write(now);
}

/** The app was left: the half hour counts from here. */
export function noteLeft(now: number = Date.now()): void {
  write(now);
}

// ── Coming back ────────────────────────────────────────────────────────

/**
 * The state to start on, or undefined for the ordinary start. Read once,
 * synchronously, before the container mounts.
 */
export function readResumeState(now: number = Date.now()): ReturnType<typeof stateOf> | undefined {
  const f = store();
  if (!f) return undefined;
  try {
    const raw = f.getString(RESUME_KEY);
    if (!raw) return undefined;
    const kept = JSON.parse(raw) as Partial<Kept>;
    if (kept?.v !== 1 || typeof kept.at !== 'number' || !kept.place) return undefined;
    // A clock set back is not a reason to restore for ever.
    const age = now - kept.at;
    if (!(age >= 0 && age <= RESUME_WINDOW_MS)) return undefined;
    // Read through the same door it was written by: a route a later build
    // no longer has, or a parameter it no longer takes, is dropped here.
    const place = placeOf(stateOf(kept.place as KeptPlace));
    if (!place || isJustToday(place)) return undefined;
    return stateOf(place);
  } catch {
    return undefined;
  }
}

/** Tests. */
export function _resetResumeForTests(): void {
  current = null;
  readerAt = null;
  readerOf = null;
  fast = undefined;
}
