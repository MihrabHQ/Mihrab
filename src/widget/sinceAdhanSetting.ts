/**
 * Settings → Widgets, "Time since the adhan" (issue #111), for code that
 * runs outside React.
 *
 * The widget payload is built by plain functions (`syncPrayerWidget`) that
 * cannot read the settings context, so the choice is mirrored here the way
 * the clock format is (`utils/activeClock.ts`): set by
 * `PrayerSettingsProvider` whenever it changes, and by
 * `republishWidgetPayload` from the stored settings when it runs headless.
 */
let minutes = 0;

export function setWidgetSinceAdhanMinutes(next: number): void {
  minutes = next > 0 ? next : 0;
}

export function widgetSinceAdhanMinutes(): number {
  return minutes;
}
