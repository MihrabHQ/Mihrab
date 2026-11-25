/**
 * ── THE APP'S NOTIFICATIONS, THROUGH ONE DOOR ────────────────────────
 *
 * Every notification the app posts, schedules, cancels or hears about —
 * the prayer alerts and their adhan, the reminders, the Qur'an download's
 * progress, the permission questions — goes through this file. Nothing
 * else in `src/` or `index.js` names the library underneath
 * (`__tests__/alertsThroughOneDoor.test.ts`).
 *
 * WHAT IS BEHIND IT. Notifee 9.1.8, in our tree and built from source:
 * its JavaScript in `src/native/notifee/`, its Android engine and bridge
 * in `android/alerts/`, its iOS ones in `ios/Alerts/`. The npm package is
 * gone. Notifee is no longer maintained (and Apache-2.0); the alerts are
 * the one part of the app that must not depend on code nobody looks
 * after, so it is ours to fix now. It was brought over unchanged — what
 * is posted, and when, is what it was — and `android/alerts/build.gradle`
 * says what must never be renamed in it.
 *
 * The API is notifee's: the default export is its module object, the
 * named exports its enums and types. A test mocks THIS file
 * (jest.setup.js does, for every suite).
 */
export { default } from './notifee';
export * from './notifee';
