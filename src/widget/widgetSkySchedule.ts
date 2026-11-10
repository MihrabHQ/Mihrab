/**
 * The Sky theme's day on the home-screen widgets, worked out ahead.
 *
 * The widgets are drawn natively, at the prayer boundaries, at midnight
 * and on an unlock (docs/design/background-power.md), and JS used to
 * hand them only the colours of the hour the app was open in: a phone
 * put down at sunset wore the sunset's amber on the home screen all
 * night. Instead the app hands over the whole day — from which minute
 * of the local day the card and the accent are which colour — and the
 * widget picks the hour's own entry each time it is drawn, app or no
 * app. The same colours as the theme's (`widgetSkyColors`), from the
 * same times and the same sun and moon the hero publishes
 * (theme/skyTheme.ts, `SkyThemeDay`).
 *
 * One day stands for the days after it: the times move a few minutes a
 * day, which the sky cannot show, and the next open of the app writes
 * the day it is opened on.
 */
import { skyFrame, skyMoment } from '../screens/home/skyModel';
import {
  nominalSkyLight,
  PALETTE_STEPS,
  skyMoodFor,
  widgetSkyColors,
  type SkyVariant,
} from '../theme/skyMoods';
import type { SkyThemeDay } from '../theme/skyTheme';
import { quiet } from '../utils/quiet';

/** From this minute of the local day (0–1439), this card and this accent, #RRGGBB. */
export type WidgetSkySegment = [minuteOfDay: number, bg: string, accent: string];

/**
 * Every how many minutes the sky is sampled. Five: a widget is drawn at
 * the prayer boundaries, midnight and unlocks, so a palette change placed
 * to the nearest five minutes is never seen late, and the day costs 288
 * suns, moons and moods rather than 720 (a third of the JS time).
 */
export const WIDGET_SKY_STEP_MINUTES = 5;

/**
 * The day's segments, first at minute 0, in order; empty when the day's
 * times cannot place the sky. A widget takes the last segment that
 * starts at or before its minute.
 */
export function widgetSkySchedule(day: SkyThemeDay, variant?: SkyVariant): WidgetSkySegment[] {
  const [y, m, d] = day.day.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return [];
  const out: WidgetSkySegment[] = [];
  let last = '';
  try {
    for (let minute = 0; minute < 1440; minute += WIDGET_SKY_STEP_MINUTES) {
      const at = new Date(y, m - 1, d, 0, minute, 0, 0);
      const moment = skyMoment(day.times as Record<string, string>, at, day.tomorrowFajr);
      const light = day.where ? skyFrame(moment, at, day.where).light : nominalSkyLight(moment.passage, moment.t);
      const c = widgetSkyColors(skyMoodFor(moment.passage, moment.t, PALETTE_STEPS, variant, light));
      const key = `${c.bg}${c.accent}`;
      if (key !== last) {
        out.push([minute, c.bg, c.accent]);
        last = key;
      }
    }
  } catch (quietError) {
    quiet('widget/widgetSkySchedule', quietError);
    return [];
  }
  return out;
}

/** The segment in force at `minuteOfDay`; the last of the day before minute 0's own. */
export function widgetSkyAt(schedule: WidgetSkySegment[], minuteOfDay: number): WidgetSkySegment | null {
  if (schedule.length === 0) return null;
  let hit = schedule[schedule.length - 1];
  for (const seg of schedule) {
    if (seg[0] <= minuteOfDay) hit = seg;
    else break;
  }
  return hit;
}
