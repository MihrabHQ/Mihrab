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

export type SkyThemeColors = {
  /** The gradient's top colour, #RRGGBB. */
  top: string;
  /** Its bottom colour, #RRGGBB. */
  bottom: string;
};

/** The night, until the hero has drawn anything. */
export const DEFAULT_SKY_THEME: SkyThemeColors = { top: '#0B1230', bottom: '#1E2B5A' };

const STORAGE_KEY = '@mihrab/skyTheme/v1';
const HEX = /^#[0-9a-fA-F]{6}$/;

let current: SkyThemeColors = DEFAULT_SKY_THEME;
let published = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(fn => fn());
}

function valid(v: unknown): v is SkyThemeColors {
  return (
    typeof v === 'object' &&
    v != null &&
    HEX.test((v as SkyThemeColors).top ?? '') &&
    HEX.test((v as SkyThemeColors).bottom ?? '')
  );
}

/** The hero says what its sky is. Idempotent for the same two colours. */
export function publishSkyTheme(next: SkyThemeColors): void {
  if (!valid(next)) return;
  if (current.top === next.top && current.bottom === next.bottom) {
    published = true;
    return;
  }
  current = { top: next.top, bottom: next.bottom };
  published = true;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {
    // Best effort: the next launch opens in the default night instead.
  });
}

export function getSkyTheme(): SkyThemeColors {
  return current;
}

/**
 * The last sky from disk, taken only if the hero has not published one
 * meanwhile — the live sky always wins over a remembered one.
 */
let restored: Promise<void> | null = null;
export function restoreSkyTheme(): Promise<void> {
  if (restored) return restored;
  restored = AsyncStorage.getItem(STORAGE_KEY)
    .then(raw => {
      if (published || !raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed) && !published) {
        current = { top: parsed.top, bottom: parsed.bottom };
        emit();
      }
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

/** Test seam. */
export function _resetSkyThemeForTests(): void {
  current = DEFAULT_SKY_THEME;
  published = false;
  restored = null;
  listeners.clear();
}
