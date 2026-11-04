/** Allowed minutes before each prayer for the optional advance notification. */
export const PRE_PRAYER_REMINDER_OPTIONS = [
  0, 5, 10, 15, 20, 30, 45, 60,
] as const;

export type PrePrayerReminderMinutes =
  (typeof PRE_PRAYER_REMINDER_OPTIONS)[number];

/**
 * How long before the next prayer the Android Live Activity comes into
 * sight ("Show from"); 0 keeps it up all day. Longer than a reminder's
 * lead: a card that is hidden for most of the day is the point.
 */
export const LIVE_ACTIVITY_SHOW_BEFORE_OPTIONS = [
  0, 15, 30, 45, 60, 90, 120,
] as const;

export function coerceLiveActivityShowBeforeMinutes(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (LIVE_ACTIVITY_SHOW_BEFORE_OPTIONS as readonly number[]).includes(value)
  ) {
    return value;
  }
  return 0;
}

export function coercePrePrayerReminderMinutes(
  value: unknown,
): PrePrayerReminderMinutes {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (PRE_PRAYER_REMINDER_OPTIONS as readonly number[]).includes(value)
  ) {
    return value as PrePrayerReminderMinutes;
  }
  return 0;
}
