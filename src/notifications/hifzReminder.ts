/**
 * Hifz daily reminder (#121).
 *
 * While there is something by heart, a daily notification at the chosen
 * time saying how many portions are due — and only on days something is,
 * and only until it is recited: a reminder after the day's revision is
 * done is a poke. The same shape as the khatmah's (`khatmahReminder.ts`):
 * a rolling window of timestamp triggers with stable ids, rewritten on
 * foreground, on a settings change, and on a recitation.
 *
 * What is due a week out is read from today's schedule — a portion
 * recited tomorrow moves on, and tomorrow's resync rewrites the window
 * with the new answer.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import i18n from '../i18n';
import { ROUTE_HIFZ } from './notificationRoute';
import { getQuranState, hydrateQuranState } from '../quran/quranState';
import type { QuranState } from '../quran/quranTypes';
import { budgetOf, dayOf, todaysRevision } from '../quran/hifz';
import { quiet } from '../utils/quiet';

const HIFZ_REM_ID_PREFIX = 'hifz-rem-';
const HIFZ_CHANNEL_ID = 'prayer_app_hifz_reminder';
const LOOK_AHEAD_DAYS = 7;

export async function cancelAllHifzReminders(): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const ours = ids.filter(id => id.startsWith(HIFZ_REM_ID_PREFIX));
    if (ours.length > 0) {
      await Promise.all(ours.map(id => notifee.cancelTriggerNotification(id)));
    }
  } catch (e) {
    console.warn('cancelAllHifzReminders failed:', e);
  }
}

/**
 * What the day at `at` will ask for: today, what is left of today's
 * revision (`todaysRevision`, which counts what has been recited); a later
 * day, as many as are due by then, up to the day's budget.
 */
export function hifzReminderDue(state: QuranState, at: number): number {
  if (!state.hifz || state.hifz.portions.length === 0) return 0;
  const day = dayOf(at);
  if (day === dayOf(Date.now())) return todaysRevision(state.hifz, day).shown.length;
  return Math.min(budgetOf(state.hifz), todaysRevision(state.hifz, day).due.length);
}

export async function rescheduleHifzReminder(opts: {
  enabled: boolean;
  hour: number;
  minute: number;
  now?: Date;
}): Promise<void> {
  await cancelAllHifzReminders();
  if (!opts.enabled) return;

  await hydrateQuranState();
  const quran = getQuranState();
  if (!quran.hifz || quran.hifz.portions.length === 0) return;

  const hour = Math.max(0, Math.min(23, Math.floor(opts.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(opts.minute)));
  const now = opts.now ?? new Date();

  try {
    await notifee.createChannel({
      id: HIFZ_CHANNEL_ID,
      name: i18n.t('hifz.reminderChannelName', 'Hifz reminder'),
      importance: AndroidImportance.DEFAULT,
    });
  } catch (quietError) {
    quiet('notifications/hifzReminder', quietError);
    // Non-fatal.
  }

  for (let i = 0; i < LOOK_AHEAD_DAYS; i++) {
    const fireAt = new Date(now);
    fireAt.setDate(fireAt.getDate() + i);
    fireAt.setHours(hour, minute, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;
    const due = hifzReminderDue(quran, fireAt.getTime());
    if (due === 0) continue;

    try {
      await notifee.createTriggerNotification(
        {
          id: `${HIFZ_REM_ID_PREFIX}${dayOf(fireAt.getTime())}`,
          title: i18n.t('hifz.title', 'Hifz'),
          body: i18n.t('hifz.reminderBody', {
            defaultValue: '{{count}} portions to recite from memory today.',
            count: due,
          }),
          data: { route: ROUTE_HIFZ },
          android: {
            channelId: HIFZ_CHANNEL_ID,
            smallIcon: 'ic_stat_prayer',
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: fireAt.getTime() },
      );
    } catch (e) {
      console.warn('Failed to schedule hifz reminder', dayOf(fireAt.getTime()), e);
    }
  }
}

/**
 * One word for what the reminder should be saying now: how many portions
 * are due today and unrecited, and whether there is a stock at all. A
 * different word means the window is out of date (the blob changes on
 * every page turn, so it is not compared directly).
 */
export function hifzReminderVerdict(state: QuranState, nowMs: number): string {
  if (!state.hifz || state.hifz.portions.length === 0) return 'none';
  return `${state.hifz.portions.length}|${hifzReminderDue(state, nowMs)}`;
}

/** Re-run `onChange` whenever the verdict changes — see `watchKhatmahReminder`. */
export function watchHifzReminder(opts: {
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<unknown>;
  getState: () => QuranState;
  now?: () => number;
  onChange: () => void;
}): () => void {
  const clock = opts.now ?? Date.now;
  let last: string | null = null;
  let live = true;
  void opts.hydrate().then(() => {
    if (live) last = hifzReminderVerdict(opts.getState(), clock());
  });
  const unsubscribe = opts.subscribe(() => {
    if (last === null) return;
    const next = hifzReminderVerdict(opts.getState(), clock());
    if (next === last) return;
    last = next;
    opts.onChange();
  });
  return () => {
    live = false;
    unsubscribe();
  };
}
