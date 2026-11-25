/**
 * THE ALERTS DO NOT RUN OUT.
 *
 * Prayer alerts are written about four days ahead, and until this they
 * were written only by a screen (Today, the Log) or by an update. A phone
 * whose app was not opened for four days — someone who reads the times off
 * a widget and answers the alerts from the shade — stopped alerting, with
 * nothing to say it had.
 *
 * So each prayer alert carries where the schedule it belongs to ends
 * (`coveredUntil`, in its data), and when one is shown with less than two
 * days of schedule left, the next days are written from what the phone
 * holds — the same writer an update uses (`afterUpdate.ts`), which reads
 * the cached times and, where they stop, computes the source's method on
 * the phone.
 *
 * ── WHO READS IT ───────────────────────────────────────────────────────
 *
 * Android, natively, first: `AlertEventGate.kt` decides from this one
 * value whether a shown alert is worth starting JavaScript for at all.
 * Most are not (the app is closed, the schedule has days left, no widget
 * tap is waiting), and are shown without it. The two days here and there
 * are the same number, and `__tests__/alertsShownWithoutTheApp.test.ts`
 * holds them together.
 *
 * iOS runs nothing when a notification is shown with the app closed, so
 * there this only acts while the app is alive in the background.
 */
import { EventType, type Event } from '../native/Alerts';
import { quiet } from '../utils/quiet';

/** The alert's data key: the time of the last prayer alert of its schedule, epoch ms. */
export const COVERED_UNTIL_KEY = 'coveredUntil';

/** With less than this left of the schedule, the next days are written. */
export const TOP_UP_BELOW_MS = 2 * 24 * 60 * 60 * 1000;

/** What a schedule's alerts carry, given its events (any order). */
export function coveredUntilOf(events: ReadonlyArray<{ at: Date }>): string | undefined {
  let last = 0;
  for (const e of events) last = Math.max(last, e.at.getTime());
  return last > 0 ? String(last) : undefined;
}

/** An alert that does not say — written by an older build — asks for nothing. */
export function coverageRunsLow(
  data: Record<string, unknown> | undefined,
  now: number,
): boolean {
  const until = Number(data?.[COVERED_UNTIL_KEY]);
  return Number.isFinite(until) && until > 0 && until - now < TOP_UP_BELOW_MS;
}

let running: Promise<boolean> | null = null;

/**
 * A shown alert whose schedule is about to end: write the next days.
 * True when a write was made. Never throws — it runs in a process nobody
 * opened. Two alerts shown in the same minute are one write.
 */
export function topUpAlertsIfLow(event: Event, now: number = Date.now()): Promise<boolean> {
  if (event.type !== EventType.DELIVERED) return Promise.resolve(false);
  if (!coverageRunsLow(event.detail?.notification?.data, now)) return Promise.resolve(false);
  if (!running) {
    running = (async () => {
      try {
        // Asked for here, not at the top: this module is read by the
        // scheduler, which the writer below reads in turn.
        const { resyncPrayerAlertsFromStorage } = require('./afterUpdate') as typeof import('./afterUpdate');
        const { republishWidgetPayload } =
          require('../widget/republishWidgetPayload') as typeof import('../widget/republishWidgetPayload');
        // The widget first, as an update does: its republish puts the
        // reader's language and clock in place for a process with no
        // settings provider, and the alerts are written in both.
        await republishWidgetPayload('queue-drain', new Date(now));
        return await resyncPrayerAlertsFromStorage(new Date(now));
      } catch (quietError) {
        quiet('notifications/alertCoverage', quietError);
        return false;
      } finally {
        running = null;
      }
    })();
  }
  return running;
}

/** Tests: a new process. */
export function _resetAlertCoverageForTests(): void {
  running = null;
}
