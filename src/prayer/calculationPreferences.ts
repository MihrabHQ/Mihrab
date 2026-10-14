/**
 * The two calculation preferences that are not a method id or a school:
 * the high-latitude rule, and the angles behind the Custom method. Held
 * here, outside React, the way the Hijri calendar is (`hijri/calendar.ts`),
 * because the calculation runs in places that have no settings context —
 * the notification task, the widget's headless refresh, the month table's
 * cache fill — and every one of them loads settings first, which publishes
 * these (`settings/storage.ts`).
 *
 * ── THE HIGH-LATITUDE RULE ────────────────────────────────────────────
 *
 * North of about 48.5° the sun does not sink 18° below the horizon on
 * midsummer nights, so Fajr and Isha have no astronomical answer and a
 * rule stands in. AlAdhan's default is ANGLE_BASED and the on-phone
 * library's was MiddleOfTheNight, so the same phone showed Stockholm on
 * 21 June as Fajr 01:54 / Isha 23:40 online and 00:49 / 00:50 offline.
 * The default here is AlAdhan's, so the two agree; the other two are the
 * rules it offers, under the names it uses. The nearest-latitude rule
 * (aqrab al-bilād, `localAdhan.ts`) still catches the days inside the
 * polar circles that none of these can compute.
 */
import { HighLatitudeRule } from 'adhan';

export type HighLatitudeRuleId = 'angle_based' | 'middle_of_night' | 'seventh_of_night';

export const HIGH_LATITUDE_RULES: readonly HighLatitudeRuleId[] = [
  'angle_based',
  'middle_of_night',
  'seventh_of_night',
];

export const DEFAULT_HIGH_LATITUDE_RULE: HighLatitudeRuleId = 'angle_based';

/** AlAdhan's `latitudeAdjustmentMethod` number for each rule. */
export const ALADHAN_LATITUDE_ADJUSTMENT: Record<HighLatitudeRuleId, number> = {
  middle_of_night: 1,
  seventh_of_night: 2,
  angle_based: 3,
};

export function adhanHighLatitudeRule(id: HighLatitudeRuleId): (typeof HighLatitudeRule)[keyof typeof HighLatitudeRule] {
  switch (id) {
    case 'middle_of_night':
      return HighLatitudeRule.MiddleOfTheNight;
    case 'seventh_of_night':
      return HighLatitudeRule.SeventhOfTheNight;
    default:
      return HighLatitudeRule.TwilightAngle;
  }
}

/** AlAdhan's id for "Custom": the angles are the user's own. */
export const CUSTOM_METHOD_ID = 99;
export const DEFAULT_CUSTOM_FAJR_ANGLE = 18;
export const DEFAULT_CUSTOM_ISHA_ANGLE = 17;
/** What a mosque might publish: nothing below 10° or above 24° is a twilight. */
export const CUSTOM_ANGLE_MIN = 10;
export const CUSTOM_ANGLE_MAX = 24;

export type CalculationPreferences = {
  highLatitudeRule: HighLatitudeRuleId;
  customFajrAngle: number;
  customIshaAngle: number;
};

let prefs: CalculationPreferences = {
  highLatitudeRule: DEFAULT_HIGH_LATITUDE_RULE,
  customFajrAngle: DEFAULT_CUSTOM_FAJR_ANGLE,
  customIshaAngle: DEFAULT_CUSTOM_ISHA_ANGLE,
};

export function coerceHighLatitudeRule(value: unknown): HighLatitudeRuleId {
  return HIGH_LATITUDE_RULES.includes(value as HighLatitudeRuleId)
    ? (value as HighLatitudeRuleId)
    : DEFAULT_HIGH_LATITUDE_RULE;
}

/** A custom angle, to a tenth of a degree and within the twilight range. */
export function coerceCustomAngle(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CUSTOM_ANGLE_MAX, Math.max(CUSTOM_ANGLE_MIN, Math.round(n * 10) / 10));
}

export function setCalculationPreferences(next: Partial<CalculationPreferences>): void {
  prefs = {
    highLatitudeRule: coerceHighLatitudeRule(next.highLatitudeRule ?? prefs.highLatitudeRule),
    customFajrAngle: coerceCustomAngle(next.customFajrAngle ?? prefs.customFajrAngle, DEFAULT_CUSTOM_FAJR_ANGLE),
    customIshaAngle: coerceCustomAngle(next.customIshaAngle ?? prefs.customIshaAngle, DEFAULT_CUSTOM_ISHA_ANGLE),
  };
}

export function getCalculationPreferences(): CalculationPreferences {
  return prefs;
}

/**
 * What these preferences add to a prayer-times cache key: nothing at the
 * defaults, so every table cached before they existed is still read.
 */
export function calculationPreferencesKey(method: number | 'auto'): string {
  const parts: string[] = [];
  if (prefs.highLatitudeRule !== DEFAULT_HIGH_LATITUDE_RULE) parts.push(`hl=${prefs.highLatitudeRule}`);
  if (method === CUSTOM_METHOD_ID) parts.push(`ca=${prefs.customFajrAngle}/${prefs.customIshaAngle}`);
  return parts.join(';');
}

/** Test seam. */
export function _resetCalculationPreferencesForTests(): void {
  setCalculationPreferences({
    highLatitudeRule: DEFAULT_HIGH_LATITUDE_RULE,
    customFajrAngle: DEFAULT_CUSTOM_FAJR_ANGLE,
    customIshaAngle: DEFAULT_CUSTOM_ISHA_ANGLE,
  });
}
