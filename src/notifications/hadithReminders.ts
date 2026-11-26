/**
 * Two daily notifications of the Hadith tab, both off until asked for:
 *
 *   • THE HADITH OF THE DAY, at a chosen time: the same hadith the tab's
 *     Learn page shows that day (`hadith/daily.ts` — from what al-Bukhārī
 *     and Muslim both report, by the date, the same for everyone).
 *   • THE READING PLAN'S REMINDER, at a chosen time, on the days today's
 *     share is not yet read (`hadith/plan.ts`).
 *
 * The strategy is `ayahOfDay.ts`'s and `khatmahReminder.ts`'s: individual
 * TIMESTAMP triggers over a rolling window under stable ids, replaced
 * whole at every resync (foreground, a setting changed, the plan or its
 * progress changed). Default sound — never the adhan.
 *
 * WHAT A HADITH'S NOTIFICATION SAYS. Its heading — HadeethEnc's own, the
 * hadith's best-known sentence, the line the Learn page shows — and where
 * it is from. Not the hadith cut to fit: a notification has room for a
 * few lines, and a hadith is given whole or by its heading
 * (docs/hadith-policy.md §4). A tap opens it, in "Agreed upon".
 *
 * NOTHING IS SCHEDULED FOR A DAY THE APP CANNOT SHOW: the hadith are a
 * download, and a day whose hadith is not on the device gets no
 * notification rather than one that opens on "not on this device".
 */
import notifee, { AndroidImportance, AndroidStyle, TriggerType } from '../native/Alerts';
import i18n from '../i18n';
import { AGREED_LIST, parseList } from '../hadith/catalog';
import { dailyHadithId } from '../hadith/daily';
import { getHadithRecord, hydrateHadithRecord } from '../hadith/hadithStore';
import { planOf } from '../hadith/hadithRecord';
import { listRows, loadItem } from '../hadith/library';
import { planProgress } from '../hadith/plan';
import { quiet } from '../utils/quiet';
import { SYSTEM_TONE } from './systemTone';
import { ROUTE_HADITH, ROUTE_HADITH_PLAN } from './notificationRoute';

const DAILY_ID_PREFIX = 'hadith-day-';
const PLAN_ID_PREFIX = 'hadith-plan-';
const DAILY_CHANNEL_ID = 'prayer_app_hadith_of_day';
const PLAN_CHANNEL_ID = 'prayer_app_hadith_plan';
const DAILY_LOOK_AHEAD_DAYS = 14;
const PLAN_LOOK_AHEAD_DAYS = 7;

type Options = { enabled: boolean; hour: number; minute: number; language: string; now?: Date };

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const clampTime = (o: Options) => ({
  hour: Math.max(0, Math.min(23, Math.floor(o.hour))),
  minute: Math.max(0, Math.min(59, Math.floor(o.minute))),
});

async function cancelPrefixed(prefix: string): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    await Promise.all(ids.filter(id => id.startsWith(prefix)).map(id => notifee.cancelTriggerNotification(id)));
  } catch (quietError) {
    quiet('notifications/hadithReminders', quietError);
  }
}

async function channel(id: string, name: string): Promise<void> {
  try {
    await notifee.createChannel({ id, name, importance: AndroidImportance.DEFAULT, sound: SYSTEM_TONE });
  } catch (quietError) {
    quiet('notifications/hadithReminders', quietError);
  }
}

/** The times the window's notifications fire at: each coming day's chosen time, those already past left out. */
export function fireTimes(now: Date, hour: number, minute: number, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(hour, minute, 0, 0);
    if (at.getTime() > now.getTime()) out.push(at);
  }
  return out;
}

/** Re-schedule the hadith of the day's rolling window. Cancels, and stops there, when off. */
export async function rescheduleHadithOfDay(opts: Options): Promise<void> {
  await cancelPrefixed(DAILY_ID_PREFIX);
  if (!opts.enabled) return;
  const { hour, minute } = clampTime(opts);
  const title = i18n.t('hadith.daily.title');
  await channel(DAILY_CHANNEL_ID, title);
  for (const at of fireTimes(opts.now ?? new Date(), hour, minute, DAILY_LOOK_AHEAD_DAYS)) {
    const id = dailyHadithId(at);
    // Not on this device (the hadith are a download): no notification for what cannot be opened.
    const item = id ? await loadItem(id, opts.language).catch(() => null) : null;
    if (!id || !item) continue;
    const body = [item.title, i18n.t('hadith.daily.from')].filter(Boolean).join('\n\n');
    try {
      await notifee.createTriggerNotification(
        {
          id: `${DAILY_ID_PREFIX}${ymd(at)}`,
          title,
          body,
          // This day's hadith, decided when it was written: a late tap still opens it.
          data: { route: ROUTE_HADITH, hadith: id, list: AGREED_LIST },
          android: {
            channelId: DAILY_CHANNEL_ID,
            smallIcon: 'ic_stat_prayer',
            style: { type: AndroidStyle.BIGTEXT, text: body },
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: at.getTime() },
      );
    } catch (quietError) {
      quiet('notifications/hadithReminders', quietError);
    }
  }
}

/** The settings the plan's reminder was last scheduled with, for `refreshHadithPlanReminder`. */
let lastPlanOptions: Options | null = null;

/**
 * Re-schedule the reading plan's reminder: one a day for a week, while a
 * plan is being followed. Today's is left out once today's share is read —
 * a reminder to do what is done punishes the reader who kept to the plan
 * (`khatmahReminderDue` has the same reason) — and all of them once every
 * hadith of the list is read.
 */
export async function rescheduleHadithPlanReminder(opts: Options): Promise<void> {
  lastPlanOptions = { enabled: opts.enabled, hour: opts.hour, minute: opts.minute, language: opts.language };
  await cancelPrefixed(PLAN_ID_PREFIX);
  if (!opts.enabled) return;
  await hydrateHadithRecord();
  const rec = getHadithRecord();
  const plan = planOf(rec);
  if (!plan || !parseList(plan.list)) return;
  const rows = await listRows(plan.list, opts.language, []).catch(() => []);
  const ids = rows.map(r => r.id);
  if (!ids.length) return;
  const now = opts.now ?? new Date();
  const today = planProgress(plan, ids, rec, now);
  if (today.finished) return;
  const { hour, minute } = clampTime(opts);
  const title = i18n.t('hadith.plan.card');
  await channel(PLAN_CHANNEL_ID, title);
  for (const at of fireTimes(now, hour, minute, PLAN_LOOK_AHEAD_DAYS)) {
    const isToday = ymd(at) === ymd(now);
    if (isToday && today.doneToday >= today.target) continue;
    const day = planProgress(plan, ids, rec, at);
    const left = isToday ? today.target - today.doneToday : day.target;
    if (left <= 0) continue;
    try {
      await notifee.createTriggerNotification(
        {
          id: `${PLAN_ID_PREFIX}${ymd(at)}`,
          title,
          body: i18n.t('hadith.plan.reminderBody', { n: left }),
          data: { route: ROUTE_HADITH_PLAN },
          android: {
            channelId: PLAN_CHANNEL_ID,
            smallIcon: 'ic_stat_prayer',
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: at.getTime() },
      );
    } catch (quietError) {
      quiet('notifications/hadithReminders', quietError);
    }
  }
}

/**
 * The plan or its progress changed (begun, ended, a hadith read): write
 * the reminders again with the settings they were last written with.
 * Nothing before the first scheduling of a session, and nothing while off.
 */
export function refreshHadithPlanReminder(): void {
  if (lastPlanOptions?.enabled) void rescheduleHadithPlanReminder(lastPlanOptions);
}

export function _resetHadithRemindersForTests(): void {
  lastPlanOptions = null;
}
