/**
 * Sweden — Islamiska Förbundet: the app's own calculation method id. No
 * AlAdhan id exists for it, so it is always computed on the device (see
 * `localAdhan.ts` for the method, `fetchPrayerTimes.ts` for the routing).
 * A leaf, so the auto-method table and the calculator can both import it
 * without importing each other.
 */
export const SWEDEN_METHOD_ID = 24;
