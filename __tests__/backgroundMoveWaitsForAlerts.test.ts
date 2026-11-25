/**
 * A move found in the background is not done until the alerts are with the
 * system.
 *
 * With the app alive in the background, Today takes the new place as well
 * and writes the alerts itself; the task's own write stands down for it
 * (`afterUpdate.ts`). The task then returned — and returning gives iOS its
 * background time back. The app was suspended with Today's write still on
 * its way: the widget on the new city, every alert on the old one. Seen on
 * an iPhone 13 (Nov 2026): the new place's next prayer passed in silence.
 */
import { readFileSync } from 'fs';
import path from 'path';

jest.mock('../src/native/Alerts', () => ({
  __esModule: true,
  default: {},
  EventType: {},
  TriggerType: {},
  AndroidImportance: {},
  AndroidVisibility: {},
  AndroidCategory: {},
  AndroidStyle: {},
  AuthorizationStatus: {},
}));

describe('every write of the alerts asked for, waited for', () => {
  it('prayerSyncsSettled resolves only when a write in flight has ended — also one that fails', async () => {
    const notifications = require('../src/notifications/prayerNotifications') as typeof import('../src/notifications/prayerNotifications');
    const before = notifications.prayerSyncsAsked();
    // A write with nothing to write from throws or returns inside the
    // chain; either way it is "asked", and the chain is what is waited on.
    const write = notifications.syncPrayerNotifications({} as never).catch(() => 'failed');
    expect(notifications.prayerSyncsAsked()).toBe(before + 1);
    let settled = false;
    const waiting = notifications.prayerSyncsSettled().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    await write;
    await waiting;
    expect(settled).toBe(true);
  });

  it('the background move waits for it, within a bound, before it says it is done', () => {
    const src = readFileSync(path.join(__dirname, '../src/location/backgroundLocation.ts'), 'utf8');
    expect(src).toMatch(
      /await resyncPrayerAlertsFromStorage\(now, asked\);[\s\S]{0,900}await within\(prayerSyncsSettled\(\), ALERTS_WAIT_MS, undefined\);\s+return 'moved';/,
    );
    expect(src).toMatch(/export const ALERTS_WAIT_MS = 8_000;/);
    // iOS lends about half a minute: the three waits together stay inside it.
    const ms = (name: string) => Number(new RegExp(`export const ${name} = ([\\d_]+);`).exec(src)![1].replace(/_/g, ''));
    expect(ms('NAME_WAIT_MS') + ms('WEEK_WAIT_MS') + ms('ALERTS_WAIT_MS')).toBeLessThanOrEqual(27_000);
  });
});
