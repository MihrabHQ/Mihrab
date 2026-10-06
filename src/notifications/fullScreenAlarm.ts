/**
 * The full-screen prayer alert — issue #63.
 *
 * Opt-in (Notifications → "Full-screen prayer alerts", Android only). When on,
 * each of the five prayers' alerts carries a full-screen intent: with the phone
 * locked or its screen off, Android wakes it and raises `PrayerAlarmActivity`
 * over the lock screen, like an alarm clock. With the phone in hand Android
 * shows the ordinary heads-up instead — the platform's rule.
 *
 * What it does NOT change is the sound. That is still the row's own mode —
 * adhan, plain alert — on the same channels, so "adhan + vibration" and
 * "notification sound" stay the choices they already were, and "Play adhan
 * as an alarm" still decides whether the ringer switch can silence it. A
 * silent row registers no alarm at all, so it has no screen either.
 *
 * Leaf module (i18n and Notifee only), because three writers of the same
 * alert need it — the scheduler, the Live Activity's mode toggle and the
 * snooze — and they must not import each other.
 */
import { AndroidCategory } from '@notifee/react-native';
import i18n from '../i18n';
import { LAST_CHANCE_MINUTES, hasSnooze, type SnoozeMenu } from './snoozeWindow';
import { skyFrame, skyInkAt, type SkyPassage } from '../screens/home/skyModel';

/** The native activity Notifee launches; resolved by class name. */
export const PRAYER_ALARM_ACTIVITY = 'com.prayer_times.PrayerAlarmActivity';

/** See `fullScreenAlarmAndroid`. */
export const PRAYER_ALARM_COMPONENT = 'mihrab-prayer-alarm';

/** The alarm screen's Snooze button — the notification's own default. */
export const FULL_SCREEN_SNOOZE_MIN = 10;

/** The smaller Snooze chips under it, for a shorter or longer wait. */
export const FULL_SCREEN_SNOOZE_ALT_MIN = [5, 15, 30, 60];

/**
 * A chip's label. Shorter than the button above it ("Snooze 10 min"): the
 * row holds four, and the word is already on the button.
 */
export function snoozeChipLabel(minutes: number): string {
  return minutes === 60
    ? i18n.t('alertCopy.snoozeChipHour', { defaultValue: '1 hour' })
    : i18n.t('alertCopy.snoozeChipMinutes', {
        defaultValue: '{{minutes}} min',
        minutes,
      });
}

/** Marks an alert as full-screen in its data, so a snooze can carry it on. */
export const FULL_SCREEN_DATA_FLAG = 'fullScreen';

const RTL_LANGUAGES = ['ar', 'ur', 'he', 'fa'];

/**
 * Which passage of the Today hero's sky each prayer begins, and how far into
 * it. The alarm rings AT the prayer, so this is the sky the hero is showing
 * the moment it fires. Dhuhr starts nothing of its own — it sits in the
 * middle of the day passage.
 */
const PRAYER_SKY: Record<string, { passage: SkyPassage; t: number }> = {
  Fajr: { passage: 'dawn', t: 0 },
  Dhuhr: { passage: 'day', t: 0.55 },
  Asr: { passage: 'sunset', t: 0 },
  Maghrib: { passage: 'dusk', t: 0 },
  Isha: { passage: 'night', t: 0 },
};

/** The hero's two sky colours for a prayer and whether text on it is light or dark. */
export function fullScreenAlarmSky(prayer: string): Record<string, string> {
  const at = PRAYER_SKY[prayer];
  if (!at) return {};
  const frame = skyFrame({ ...at, daylight: null }, new Date());
  return {
    fsSkyTop: frame.top,
    fsSkyBottom: frame.bottom,
    fsInk: skyInkAt(frame, 0.5).text === '#FFFFFF' ? 'light' : 'dark',
  };
}

/**
 * The words the native screen prints, translated now, while JS and i18n are
 * here — the screen itself may draw with the app's process dead. Strings
 * only: Notifee rejects anything else in `data`.
 *
 * `fsLog` is absent for anything that is not one of the five prayers, and the
 * screen then draws no Log button.
 */
export function fullScreenAlarmData(
  prayer: string,
  /** "Next: Isha at 20:18", the same line the notification's card carries. */
  nextLine = '',
  /**
   * How much of the prayer is left (`snoozeWindow.snoozeMenu`, worked out for
   * the moment the alarm rings). Absent: the whole menu, as before.
   */
  menu?: SnoozeMenu,
  /**
   * When this prayer ends. With it the alarm screen keeps its own clock: it
   * re-checks every few seconds which snoozes still leave 15 minutes and
   * withdraws the ones that no longer do while it sits on the screen. The
   * keys above are what it draws FIRST; these are what it re-decides with.
   */
  deadlineMs?: number | null,
): Record<string, string> {
  const lang = (i18n.language || 'en').split('-')[0];
  // The big button is ten minutes while ten minutes fit; then five; then,
  // with nothing left to snooze, "Last chance to pray" — and inside the final
  // minutes no button at all (the native screen draws none without a label).
  const main: number | null =
    menu == null || menu.minutes.includes(FULL_SCREEN_SNOOZE_MIN)
      ? FULL_SCREEN_SNOOZE_MIN
      : menu.minutes.length > 0
        ? menu.minutes[0]
        : menu.lastChanceAt != null
          ? LAST_CHANCE_MINUTES
          : null;
  const mainLabel =
    main === LAST_CHANCE_MINUTES
      ? i18n.t('alertCopy.lastChanceChoice', {
          defaultValue: 'Last chance to pray {{prayer}}',
          prayer: i18n.t(`prayer.${prayer}`, { defaultValue: prayer }),
        })
      : main != null
        ? i18n.t('alertCopy.snoozeChoice', {
            defaultValue: 'Snooze {{minutes}} min',
            minutes: main,
          })
        : '';
  const alts = FULL_SCREEN_SNOOZE_ALT_MIN.filter(
    m => m !== main && (menu == null || menu.minutes.includes(m)),
  );
  const out: Record<string, string> = {
    [FULL_SCREEN_DATA_FLAG]: '1',
    fsStop: i18n.t('common.stop', { defaultValue: 'Stop' }),
    ...(main != null && (menu == null || hasSnooze(menu))
      ? {
          fsSnooze: mainLabel,
          fsSnoozeMinutes: String(main),
          // [{m: minutes, l: label}] — the native screen draws one chip each.
          fsSnoozeAlt: JSON.stringify(
            alts.map(m => ({ m, l: snoozeChipLabel(m) })),
          ),
        }
      : {}),
    ...(deadlineMs != null && Number.isFinite(deadlineMs)
      ? {
          fsDeadline: String(deadlineMs),
          // Every length the screen may ever show, longest-last, with the
          // label it prints — the native side picks among them by the clock.
          fsMainOpts: JSON.stringify(
            [FULL_SCREEN_SNOOZE_MIN, 5].map(m => ({
              m,
              l: i18n.t('alertCopy.snoozeChoice', {
                defaultValue: 'Snooze {{minutes}} min',
                minutes: m,
              }),
            })),
          ),
          fsChipOpts: JSON.stringify(
            FULL_SCREEN_SNOOZE_ALT_MIN.map(m => ({ m, l: snoozeChipLabel(m) })),
          ),
          fsLastChance: i18n.t('alertCopy.lastChanceChoice', {
            defaultValue: 'Last chance to pray {{prayer}}',
            prayer: i18n.t(`prayer.${prayer}`, { defaultValue: prayer }),
          }),
        }
      : {}),
    fsRtl: RTL_LANGUAGES.includes(lang) ? '1' : '0',
    ...fullScreenAlarmSky(prayer),
  };
  if (nextLine) out.fsNext = nextLine;
  if (prayer) {
    out.fsLog = i18n.t('journal.logActionTitle', {
      defaultValue: 'Log prayer',
    });
  }
  return out;
}

/**
 * The Android fields that make an alert full-screen.
 *
 * Category ALARM as well: Do Not Disturb's "Alarms" exception — on by default
 * — is what lets the screen through while the phone is in Do Not Disturb,
 * which is half of what the issue asked for.
 */
export function fullScreenAlarmAndroid() {
  return {
    fullScreenAction: {
      id: 'default',
      launchActivity: PRAYER_ALARM_ACTIVITY,
      // NOT decorative. Notifee attaches the notification to the full-screen
      // intent only when a main component is named — without one the screen
      // opens with nothing to show and closes itself (seen on the emulator,
      // 2026-10-03). Nothing reads the name: MainActivity never asks Notifee
      // for a component, and the alarm screen is native.
      mainComponent: PRAYER_ALARM_COMPONENT,
    },
    category: AndroidCategory.ALARM,
  };
}

/** Whether a delivered/scheduled alert was built full-screen. */
export function isFullScreenAlarm(data: unknown): boolean {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as Record<string, unknown>)[FULL_SCREEN_DATA_FLAG] === '1'
  );
}
