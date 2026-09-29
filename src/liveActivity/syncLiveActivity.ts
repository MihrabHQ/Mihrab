/**
 * Live Activity orchestrator — task #128.
 *
 * Combines the widget payload, Hijri date, location label, and the
 * user's display preferences and dispatches to the right platform
 * implementation:
 *
 *   Android  → notifee ongoing-notification (src/notifications/liveActivity.ts)
 *   iOS      → ActivityKit native module (src/native/PrayerLiveActivity.ts)
 *
 * iOS implementation is gated on the native module being linked.
 * The first beta ships without the iOS bridge — calls there silently
 * no-op. Task #129 lands the ActivityKit widget + bridge.
 */
// tokens-ok: colours handed to the native notification, which has no palette

import { Platform } from 'react-native';
import { isMacCatalyst } from '../responsive/breakpoints';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';
import type { AppAccentId } from '../settings/types';
import {
  buildWidgetPayload,
  type WidgetCoords,
  type WidgetSeasonalFlags,
} from '../widget/buildWidgetPayload';
import {
  hijriLabelForDateKey,
  loadLiveActivityOptions,
  postLiveActivity,
  stopLiveActivity as androidStop,
} from '../notifications/liveActivity';
import { getPrayerLiveActivityModule } from '../native/PrayerLiveActivity';
import { activeClock } from '../utils/activeClock';
import { contractClock, contractDateKey } from '../widget/wallClock';
import {
  buildLiveActivityV2,
  deviceEpochOf,
  liveActivityIosContent,
} from './liveActivityV2';

export type LiveActivityDisplayOptions = {
  enabled: boolean;
};
// Note: Hijri/location/sunrise/compact display knobs were removed from the
// Live Activity UI in v2.1.0-beta.5. Sunrise is always shown and the other
// captions are always omitted, so the orchestrator no longer takes per-display
// options beyond the master `enabled` flag. The `liveActivity*` fields still
// persist in settings storage (schema is additive-only) but are unused.

/**
 * Resolve a #RRGGBB hex for the user's chosen app accent. The Android
 * notification's `color` field tints the small icon + chronometer; the
 * iOS Live Activity uses it as the system tint for the Lock-Screen
 * Activity. We pick the LIGHT swatch because notifications render
 * against the system shade, not the in-app dark mode — using the dark
 * variant would muddy the tint against a colourful wallpaper.
 *
 * Kept local to the live-activity module so we don't drag the full
 * `useAppPalette` (which needs RN's `useColorScheme()` and a hook
 * context) into a pure-data path.
 */
const ACCENT_LIGHT: Record<Exclude<AppAccentId, 'custom'>, string> = {
  green: '#22c55e',
  teal: '#0d9488',
  blue: '#2563eb',
  amber: '#b45309',
  rose: '#9F2D4D',
  violet: '#5B4B9E',
};

export function resolveAccentHex(
  accentId: AppAccentId,
  customHex: string,
): string {
  if (accentId === 'custom') {
    const valid = /^#[0-9a-fA-F]{6}$/.test(customHex.trim());
    return valid ? customHex.trim() : '#22c55e';
  }
  return ACCENT_LIGHT[accentId] ?? ACCENT_LIGHT.green;
}

// Hijri label now comes from the shared `formatHijriLabel` util (also used by
// the home day cards) so the format stays identical everywhere.

function localizedPrayerLabel(key: string | null | undefined): string {
  if (!key) return '';
  // Locale files use capitalised keys: prayer.Fajr, prayer.Maghrib, etc.
  // Try exact case first, then lowercase so older locale structures still work.
  const kExact = `prayer.${key}`;
  if (i18n.exists(kExact)) return i18n.t(kExact);
  const kLower = `prayer.${key.toLowerCase()}`;
  return i18n.exists(kLower) ? i18n.t(kLower) : key;
}

// Module-level debounce for syncLiveActivity.
// Multiple React effects (state, nextInfo, focusEffect) can fire at nearly
// the same instant when the app launches. Without debouncing, the iOS Swift
// bridge receives 3-4 concurrent start() calls, which races the
// stop-then-restart logic and leaves no active Live Activity on screen.
// 800ms is long enough to coalesce a typical burst of launch-time effects
// but short enough to feel instant to the user.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingArgs: Parameters<typeof syncLiveActivityImpl>[0] | null = null;

export function syncLiveActivity(
  args: Parameters<typeof syncLiveActivityImpl>[0],
): Promise<void> {
  _pendingArgs = args;
  if (_debounceTimer !== null) {
    // Already waiting — just update the pending args so the latest wins.
    return Promise.resolve();
  }
  return new Promise(resolve => {
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      const a = _pendingArgs!;
      _pendingArgs = null;
      syncLiveActivityImpl(a).then(resolve).catch(resolve);
    }, 800);
  });
}

/**
 * Drive the Live Activity to match the supplied state. Idempotent — call
 * on settings change, on prayer-day data update, and on AppState 'active'.
 */
async function syncLiveActivityImpl(args: {
  options: LiveActivityDisplayOptions;
  today: TimingsMap | null;
  tomorrow?: TimingsMap | null;
  /** Consecutive days starting today — drives the multi-day rollover so the
   *  Live Activity advances to the correct day without the app being opened. */
  week?: TimingsMap[] | null;
  now?: Date;
  locationName?: string;
  coords?: WidgetCoords;
  seasonal?: WidgetSeasonalFlags;
  /** App accent hex — drives the notification tint / Live Activity
   *  system color. Optional; defaults to brand green. */
  accentHex?: string;
  /** iOS only: when the Liquid Glass / system-colours theme is active, the
   *  Live Activity should ignore the brand accent and use the dynamic iOS
   *  system tint so it matches the in-app theme and adapts to light/dark. */
  systemTinted?: boolean;
  /** Android only: when system colours are enabled, the notification should
   *  follow the live Material You system accent (re-resolved natively on each
   *  repost) instead of the static brand accent, so it matches the app and
   *  auto-updates when the wallpaper colour changes. */
  systemAccent?: boolean;
  /** Android only: which enhanced Live Activity visual style to render. */
  design?: 'timeline' | 'countdown' | 'markers';
  /** "Tinted surfaces" — promote the accent to the card's background on both
   *  platforms. Android reads it from settings inside its renderer; iOS needs
   *  it threaded here into the ActivityKit content. */
  tinted?: boolean;
}): Promise<void> {
  // Mac Catalyst has no ActivityKit Live Activity surface (no Lock Screen /
  // Dynamic Island), so the whole feature no-ops there. Gated here rather than
  // at every call site so the HomeScreen sync effect stays platform-agnostic.
  if (isMacCatalyst) return;

  const now = args.now ?? new Date();

  // Off → ensure we cancel any pre-existing pinned activity.
  if (!args.options.enabled || !args.today) {
    await stopLiveActivityCrossPlatform();
    return;
  }

  // We reuse buildWidgetPayload so the row keys + abbreviations and the
  // tomorrow-rollover logic stay consistent with the home-screen widget.
  let payload;
  try {
    payload = buildWidgetPayload(
      args.today,
      args.tomorrow ?? undefined,
      now,
      args.locationName,
      args.coords,
      args.seasonal,
      args.week ?? undefined,
    );
  } catch (e) {
    console.warn('[liveActivity] payload build failed', e);
    await stopLiveActivityCrossPlatform();
    return;
  }

  // ONE payload for both platforms (step 1.5): the widget payload's own
  // days, wall clock, with the words and settings the natives draw. Each
  // native turns it into its content for the minute it draws at.
  const options = await loadLiveActivityOptions();
  const la = buildLiveActivityV2({
    payload,
    clock: contractClock(activeClock().hour12, i18n.language || 'en'),
    now,
    language: i18n.language || 'en',
    nameOf: localizedPrayerLabel,
    // Only Android draws it: the Hijri date of the day the next prayer
    // falls on, beside it in the notification header.
    hijriOf: Platform.OS === 'android' ? hijriLabelForDateKey : () => '',
    modeOf: options.modeOf,
    appearance: {
      accentHex: args.accentHex || '#22c55e',
      systemTinted: !!args.systemTinted,
      systemAccent: args.systemAccent === true,
      // Android has always read "tinted surfaces" from settings, iOS from
      // the caller; the same setting either way.
      tinted: Platform.OS === 'android' ? options.tinted : !!args.tinted,
      design: args.design ?? 'timeline',
    },
    android: options.android,
    words: options.words,
  });
  const at = {
    todayKey: contractDateKey(now),
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  };

  if (Platform.OS === 'android') {
    await postLiveActivity(la, at);
    return;
  }

  if (Platform.OS === 'ios') {
    const mod = getPrayerLiveActivityModule();
    if (!mod) {
      // ActivityKit bridge not linked (Mac Catalyst, a simulator without
      // it): a silent no-op, so the toggle still reads as working.
      return;
    }
    try {
      if (mod.startV2) {
        // Start is idempotent — an existing activity is updated in place.
        await mod.startV2(JSON.stringify(la));
      } else {
        // A native module from before step 1.5: hand it the content it
        // decodes, worked out here the way the native adapter would.
        const content = liveActivityIosContent(la, at, deviceEpochOf);
        if (!content) {
          await stopLiveActivityCrossPlatform();
          return;
        }
        await mod.start(JSON.stringify(content));
      }
    } catch (e) {
      console.warn('[liveActivity] ios start/update failed', e);
    }
  }
}

/** End any running Live Activity on the current platform. */
export async function stopLiveActivityCrossPlatform(): Promise<void> {
  if (Platform.OS === 'android') {
    await androidStop();
    return;
  }
  if (Platform.OS === 'ios') {
    const mod = getPrayerLiveActivityModule();
    if (!mod) return;
    try {
      await mod.stop();
    } catch {
      // Non-fatal.
    }
  }
}
