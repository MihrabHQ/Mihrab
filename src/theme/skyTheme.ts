/**
 * The sky over the countdown, published for the app's own theme.
 *
 * ── THE SKY THEME ─────────────────────────────────────────────────────
 *
 * Appearance → Theme → "Sky" paints the whole app in the colours of the
 * hero's sky as it is now: the night's ink-blue, the dawn's violet and
 * rose, the day's blue, the dusk's amber. Every surface takes the sky's
 * hue (the dark tonal ladder Verdant paints, in that hue), the accent is
 * the sky's own colour lifted until it reads, and the ink is warmed or
 * cooled to match — one look, through what would otherwise be light and
 * dark mode, that moves with the day. `appPalette.ts`, `skyPalette`,
 * makes the palette; this store carries what it is made from.
 *
 * The hero is the one thing that knows the sky (it draws it: skyModel.ts,
 * from the day's times and the clock), so the hero publishes the two
 * colours of its gradient here, once a minute, and the palette hooks read
 * them. A module store rather than a context for the usual reason: the
 * publisher re-renders every second, and the readers are everywhere.
 *
 * The last published sky is kept on disk so that a launch opens in
 * yesterday evening's colours rather than a default's, for the moment
 * before the hero has the day's times; the first publish then corrects
 * it, and the kept launch picture fades into the live screen as it would
 * for any change of the sky.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { skyMoment, type SkyPassage } from '../screens/home/skyModel';
import { PALETTE_STEPS, skyMoodFor, type SkyMood } from './skyMoods';
import { crossfadeScreen } from '../native/LaunchSnapshot';

export type SkyThemeColors = {
  /** The gradient's top colour, #RRGGBB. */
  top: string;
  /** Its bottom colour, #RRGGBB. */
  bottom: string;
  /** Which passage of the day the sky is in, and how far through it (0–1). */
  passage: SkyPassage;
  t: number;
};

/**
 * The day the sky was published from: its times, so a launch can work out
 * the sky for ITS clock from the disk alone (`restoreSkyTheme`) rather
 * than open in the colours of the hour the app was left in and change
 * once the hero has drawn — a whole second render of every screen, right
 * where the launch is busiest. `day` is the local date the times are for.
 */
export type SkyThemeDay = {
  day: string;
  times: Record<string, string | undefined>;
  tomorrowFajr?: string;
};

/** The local date, yyyy-mm-dd. */
export function skyDayKey(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** The night, until the hero has drawn anything. */
export const DEFAULT_SKY_THEME: SkyThemeColors = { top: '#0B1230', bottom: '#1E2B5A', passage: 'night', t: 0.5 };

/**
 * A day of times for a sky before there are any: an install that has
 * never had a location has no prayer times, and Sky is a new install's
 * look (2.31). Without this the walkthrough was the night at four in the
 * afternoon. Round figures for a middling latitude — the passage is
 * right for the hour almost anywhere, and the first real times replace
 * it within the walkthrough.
 */
const NOMINAL_DAY: Record<string, string> = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:30',
  Asr: '15:45',
  Maghrib: '18:30',
  Isha: '20:00',
};

/** The sky for `now` on the nominal day — the sky a first launch opens in. */
export function nominalSkyTheme(now: Date): SkyThemeColors {
  const m = skyMoment(NOMINAL_DAY, now);
  return { ...DEFAULT_SKY_THEME, passage: m.passage, t: m.t };
}
const PASSAGES: ReadonlySet<string> = new Set(['night', 'dawn', 'day', 'sunset', 'dusk']);

const STORAGE_KEY = '@mihrab/skyTheme/v1';
const HEX = /^#[0-9a-fA-F]{6}$/;

let current: SkyThemeColors = DEFAULT_SKY_THEME;
let published = false;
let currentDay: SkyThemeDay | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(fn => fn());
}

function valid(v: unknown): v is SkyThemeColors {
  if (typeof v !== 'object' || v == null) return false;
  const s = v as SkyThemeColors;
  return (
    HEX.test(s.top ?? '') &&
    HEX.test(s.bottom ?? '') &&
    PASSAGES.has(s.passage) &&
    typeof s.t === 'number' &&
    s.t >= 0 &&
    s.t <= 1
  );
}

/**
 * The same as far as the theme is concerned: the mood it makes is the
 * same in every token. The sky's `t` moves every minute; through the
 * night, and through most of the day, the mood does not, and the app is
 * not re-rendered for a change it cannot see.
 */
function same(a: SkyThemeColors, b: SkyThemeColors): boolean {
  if (a.passage !== b.passage) return false;
  const ma = skyMoodFor(a.passage, a.t, PALETTE_STEPS);
  const mb = skyMoodFor(b.passage, b.t, PALETTE_STEPS);
  return (Object.keys(ma) as (keyof SkyMood)[]).every(k => ma[k] === mb[k]);
}

function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, day: currentDay ?? undefined })).catch(() => {
    // Best effort: the next launch opens in the default night instead.
  });
}

/** The hero says what its sky is. Idempotent for the same two colours. */
export function publishSkyTheme(next: SkyThemeColors, day?: SkyThemeDay): void {
  if (!valid(next)) return;
  if (day && (currentDay?.day !== day.day || currentDay.tomorrowFajr !== day.tomorrowFajr || currentDay.times !== day.times)) {
    currentDay = day;
    if (same(current, next)) persist();
  }
  if (same(current, next)) {
    published = true;
    return;
  }
  // The page turns from dark to light or back (sunrise; the middle of the
  // sunset): the only two moments the whole screen changes at once. A
  // still of it now, faded over what it becomes — asked for before the
  // change renders, and only while the theme is the one looking.
  const flips =
    published &&
    listeners.size > 0 &&
    skyMoodFor(current.passage, current.t).isDark !== skyMoodFor(next.passage, next.t).isDark;
  current = { top: next.top, bottom: next.bottom, passage: next.passage, t: next.t };
  published = true;
  if (flips) crossfadeScreen();
  emit();
  persist();
}

export function getSkyTheme(): SkyThemeColors {
  return current;
}

function validDay(v: unknown): v is SkyThemeDay {
  if (typeof v !== 'object' || v == null) return false;
  const d = v as SkyThemeDay;
  return typeof d.day === 'string' && typeof d.times === 'object' && d.times != null;
}

/**
 * The last sky from disk, taken only if the hero has not published one
 * meanwhile — the live sky always wins over a remembered one. With the
 * day's times kept beside it, the sky is worked out for the clock NOW,
 * so the first screen is already the hour's and the hero's own publish
 * changes nothing. Awaited with the settings (PrayerSettingsContext), so
 * the first render is painted from it.
 */
let restored: Promise<void> | null = null;
export function restoreSkyTheme(now: () => Date = () => new Date()): Promise<void> {
  if (restored) return restored;
  restored = AsyncStorage.getItem(STORAGE_KEY)
    .then(raw => {
      if (published) return;
      if (!raw) {
        // Nothing kept: a first launch. The hour's sky on a nominal day
        // rather than the default night, until the hero has real times.
        current = nominalSkyTheme(now());
        emit();
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!valid(parsed) || published) return;
      let next: SkyThemeColors = { top: parsed.top, bottom: parsed.bottom, passage: parsed.passage, t: parsed.t };
      const day = (parsed as { day?: unknown }).day;
      if (validDay(day)) {
        const at = now();
        if (day.day === skyDayKey(at)) {
          try {
            const m = skyMoment(day.times as Record<string, string>, at, day.tomorrowFajr);
            next = { ...next, passage: m.passage, t: m.t };
          } catch {
            // The remembered sky as it was, then.
          }
        }
        currentDay = day;
      }
      current = next;
      emit();
    })
    .catch(() => {
      // Nothing remembered, or unreadable: the default night stands.
    });
  return restored;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const noSubscribe = (): (() => void) => () => {};

/**
 * The sky the theme is painted from, re-rendering as the hero publishes.
 * `enabled` false (the Sky theme is not on): a fixed snapshot and no
 * subscription, so the rest of the app does not re-render with the sky.
 */
export function useSkyTheme(enabled: boolean): SkyThemeColors {
  return useSyncExternalStore(enabled ? subscribe : noSubscribe, getSkyTheme, getSkyTheme);
}

/** Test seams. */
export function _subscribeSkyThemeForTests(): () => void {
  return subscribe(() => {});
}
export function _resetSkyThemeForTests(): void {
  current = DEFAULT_SKY_THEME;
  currentDay = null;
  published = false;
  restored = null;
  listeners.clear();
}
