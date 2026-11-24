/**
 * ── THE APP'S NOTIFICATIONS, THROUGH ONE DOOR ────────────────────────
 *
 * Every notification the app posts, schedules, cancels or hears about —
 * the prayer alerts and their adhan, the reminders, the Qur'an download's
 * progress, the permission questions — goes through this file. Nothing
 * else in `src/` or `index.js` names the library underneath
 * (`__tests__/alertsThroughOneDoor.test.ts`).
 *
 * WHAT IS BEHIND IT. Today: notifee, re-exported whole and unchanged, so
 * this file changes nothing about what is posted or when. Notifee is no
 * longer maintained, and the alerts are the one part of the app that must
 * not depend on code nobody looks after; a module of our own is to take
 * its place. With one door that is a change to this file — and to the
 * native side — not to thirty callers, and it can be made, and undone,
 * in one commit.
 *
 * The API is notifee's: the default export is its module object, the
 * named exports its enums and types. A test that mocks
 * `@notifee/react-native` mocks what comes through here.
 */
export { default } from '@notifee/react-native';
export * from '@notifee/react-native';
