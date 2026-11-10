/**
 * Reading a stored setting back: each value checked, and the default in
 * its place when it is not what it should be.
 *
 * Settings come off disk as whatever JSON was written by whichever
 * version wrote it — or by a restore, or a sync from an older device. A
 * value of the wrong type or outside its range is not an error to raise;
 * it is the default. These are those checks, out of storage.ts, where they
 * stood between the storage keys and the read itself.
 */
import { resolveDeviceLanguage } from '../i18n/deviceLanguage';
import { CUSTOM_METHOD_ID } from '../prayer/calculationPreferences';
import { CALCULATION_METHODS } from './methodList';
import {
  DEFAULT_SETTINGS,
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
  WIDGET_TIME_SCALE_STEP,
  WIDGET_SINCE_ADHAN_CHOICES,
  type AppLanguage,
  type PrayerAppSettings,
  type WidgetHighlightId,
} from './types';


export const LANGUAGES: AppLanguage[] = [
  'en',
  'sv',
  'ar',
  'bn',
  'ur',
  'hi',
  'fr',
  'es',
  'de',
  'tr',
  'id',
  'ru',
  'zh',
];

// No 'dynamic': removed 2026-08-27. A stored 'dynamic' from an older
// build falls through to the default, which is the colour that build was
// already drawing — this is the migration, and it needs no other code.
export const WIDGET_HIGHLIGHT_IDS: WidgetHighlightId[] = [
  'green',
  'teal',
  'blue',
  'amber',
  'custom',
];

export function coerceLanguage(value: unknown): AppLanguage {
  if (typeof value === 'string' && LANGUAGES.includes(value as AppLanguage)) {
    return value as AppLanguage;
  }
  return DEFAULT_SETTINGS.language;
}

/**
 * The language to open in when the user has never chosen one.
 *
 * Consulted on every load rather than once, so a phone switched to Arabic
 * brings the app with it — right up until the moment someone picks a
 * language in Settings, after which their choice is the only thing that
 * decides.
 */
export function deviceLanguage(): AppLanguage {
  return resolveDeviceLanguage(LANGUAGES, DEFAULT_SETTINGS.language);
}

/**
 * Whether a stored blob represents a language the user actually chose.
 *
 * v2.8.4 and earlier had no way to record the difference: the default was
 * 'en' and the picker wrote the same field. So for a blob from before this
 * flag existed, anything other than 'en' can only have come from the
 * picker, and 'en' is indistinguishable from never having been asked —
 * which is exactly the install that should have been following the phone
 * all along.
 */
export function coerceLanguagePicked(parsed: Record<string, unknown>): boolean {
  if (typeof parsed.languagePicked === 'boolean') return parsed.languagePicked;
  return 'language' in parsed && coerceLanguage(parsed.language) !== 'en';
}

export const KNOWN_METHOD_IDS: ReadonlyArray<number | 'auto'> =
  CALCULATION_METHODS.map(m => m.id);

/** 'auto', or a method id this build lists (Custom, 99, among them). */
export function coerceCalculationMethod(
  value: unknown,
): PrayerAppSettings['calculationMethod'] {
  if (value === undefined) return DEFAULT_SETTINGS.calculationMethod;
  if (
    value === CUSTOM_METHOD_ID ||
    KNOWN_METHOD_IDS.includes(value as number | 'auto')
  ) {
    return value as PrayerAppSettings['calculationMethod'];
  }
  return DEFAULT_SETTINGS.calculationMethod;
}

export function coerceWidgetHighlightId(value: unknown): WidgetHighlightId {
  if (
    typeof value === 'string' &&
    WIDGET_HIGHLIGHT_IDS.includes(value as WidgetHighlightId)
  ) {
    return value as WidgetHighlightId;
  }
  return DEFAULT_SETTINGS.widgetHighlightId;
}

export function coerceWidgetHighlightHex(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return DEFAULT_SETTINGS.widgetHighlightCustomHex;
}

export function coerceHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}

/** Snapped to the stepper's rungs and clamped to its ends. */
/** The id PrayTimes.dev was stored under, before it was removed in 2.32.0. */
export const REMOVED_PRAYTIMES_DEV = 'prayertimes_dev';

/** A location-providers map with one source id renamed, choices kept. */
export function renameProvider(value: unknown, from: string, to: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const c = v as { provider?: unknown } | null;
    out[k] =
      c && typeof c === 'object' && c.provider === from
        ? { ...c, provider: to }
        : v;
  }
  return out;
}

/** One of the offered choices, else off: a hand-edited 45 is not a choice. */
export function coerceWidgetSinceAdhan(value: unknown): number {
  return typeof value === 'number' &&
    (WIDGET_SINCE_ADHAN_CHOICES as readonly number[]).includes(value)
    ? value
    : 0;
}

export function coerceWidgetTimeScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.androidWidgetTimeScale;
  }
  const snapped =
    Math.round(value / WIDGET_TIME_SCALE_STEP) * WIDGET_TIME_SCALE_STEP;
  return Math.min(
    WIDGET_TIME_SCALE_MAX,
    Math.max(WIDGET_TIME_SCALE_MIN, snapped),
  );
}

export function coerceWidgetOpacity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.min(100, Math.max(0, value)));
  }
  return DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
}

