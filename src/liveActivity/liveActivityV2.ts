/**
 * THE LIVE ACTIVITY, ONE PAYLOAD FOR BOTH PLATFORMS — the contract's
 * `LiveActivity` (scripts/contract/widget-contract.js; docs/rewrite-plan.md,
 * step 1.5).
 *
 * There were two: `PrayerLiveActivityContent` built in syncLiveActivity.ts
 * for iOS and `MihrabLiveActivityPayload` built in notifications/
 * liveActivity.ts for Android, from the same widget payload, with the next
 * prayer as an instant in SECONDS on one and MILLISECONDS on the other, each
 * working out "the prayer that last passed" by its own copy of the same
 * loop, and a dozen fields between them that nothing read.
 *
 * Now the app builds one `LiveActivity`: the widget payload's own days — wall
 * clock, the same `Day`/`Row` the widgets read — with the words and settings
 * the natives need. Each native turns it into the content its renderer
 * already draws, for the minute it draws at (LiveActivityV1.swift,
 * LiveActivityV1.kt), the same way the widgets read v2 (step 1.4). The two
 * functions at the bottom are the reference those adapters are held to by
 * the contract tests, and what the app itself uses to decide, before it
 * posts anything, whether there is a next prayer at all.
 */
import {
  WIDGET_CONTRACT_VERSION,
  type WidgetContractAlertModeKind,
  type WidgetContractClock,
  type WidgetContractDay,
  type WidgetContractLiveActivity,
  type WidgetContractLiveActivityAndroid,
  type WidgetContractLiveActivityAppearance,
  type WidgetContractLiveActivityWords,
  type WidgetContractRow,
} from '../widget/contract.generated';
import type { WidgetPrayerPayload } from '../widget/buildWidgetPayload';
import {
  hhmm,
  timePair,
  widgetMoment,
  widgetPayloadV2FromV1,
  widgetPrevious,
  type WidgetNow,
} from '../widget/widgetPayloadV2';

export type LiveActivityV2Input = {
  /** The widget payload, as `buildWidgetPayload` writes it. */
  payload: WidgetPrayerPayload;
  clock: WidgetContractClock;
  now: Date;
  language: string;
  /** A row key's full localised name. */
  nameOf: (key: string) => string;
  /** A day's Hijri date, localised; '' for none. */
  hijriOf: (dateKey: string) => string;
  /** What a row key's alert does now. */
  modeOf: (key: string) => WidgetContractAlertModeKind;
  appearance: WidgetContractLiveActivityAppearance;
  android: WidgetContractLiveActivityAndroid;
  words: WidgetContractLiveActivityWords;
};

/** The payload both Live Activities are drawn from. */
export function buildLiveActivityV2(
  input: LiveActivityV2Input,
): WidgetContractLiveActivity {
  const widget = widgetPayloadV2FromV1(input.payload, {
    clock: input.clock,
    now: input.now,
  });
  // The rows carry the full localised name, which both natives draw as the
  // hero label; the widget rows' `name` is whatever the widget wanted.
  const named = (r: WidgetContractRow): WidgetContractRow => ({
    ...r,
    name: input.nameOf(r.key) || r.abbr || r.key,
  });
  const days: WidgetContractDay[] = widget.days.map(d => ({
    ...d,
    prayers: d.prayers.map(named),
    ...(d.sunrise ? { sunrise: named(d.sunrise) } : {}),
    extras: (d.extras ?? []).map(named),
  }));
  return {
    schemaVersion: WIDGET_CONTRACT_VERSION,
    language: input.language,
    clock: input.clock,
    days,
    hijri: days
      .map(d => ({ dateKey: d.dateKey, text: input.hijriOf(d.dateKey) }))
      .filter(h => h.text !== ''),
    alertModes: [
      ...new Set(
        days.flatMap(d => [
          ...d.prayers,
          ...(d.sunrise ? [d.sunrise] : []),
          ...(d.extras ?? []),
        ]).map(r => r.key),
      ),
    ].map(key => ({ key, mode: input.modeOf(key) })),
    appearance: input.appearance,
    android: input.android,
    words: input.words,
  };
}

/** A day and minutes after its midnight as epoch ms, in some zone. */
export type EpochOf = (dateKey: string, minutes: number) => number;

/** In the device's zone — `WallClock.date` natively. */
export const deviceEpochOf: EpochOf = (dateKey, minutes) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, minutes, 0, 0).getTime();
};

/** Where the Live Activity stands at a moment: next and previous, as instants. */
type LiveMoment = {
  nextRow: WidgetContractRow;
  nextAt: number;
  nextEpochMs: number;
  /** The day the next prayer falls on. */
  nextDateKey: string;
  prevEpochMs: number | null;
  shown: WidgetContractDay;
};

function liveMoment(
  la: WidgetContractLiveActivity,
  now: WidgetNow,
  epochOf: EpochOf,
): LiveMoment | null {
  const m = widgetMoment(la.days, now);
  if (!m || !m.next) return null;
  const prev = widgetPrevious(m);
  return {
    nextRow: m.next.row,
    nextAt: m.next.at,
    nextEpochMs: epochOf(m.today.dateKey, m.next.at),
    nextDateKey:
      m.next.at >= 1440 && m.tomorrow ? m.tomorrow.dateKey : m.today.dateKey,
    prevEpochMs: prev ? epochOf(m.today.dateKey, prev.at) : null,
    shown: m.shown,
  };
}

// ── iOS: the ActivityKit ContentState ────────────────────────────────────

export type IosLiveActivityRow = {
  key: string;
  abbr: string;
  name: string;
  time: string;
  /** Always written — see PrayerLiveActivityAttributes. */
  display: string;
  /** Minutes after the shown day's midnight — what the card places it by. */
  minutes?: number;
};

/** The fields of `PrayerLiveActivityAttributes.ContentState` that are drawn. */
export type IosLiveActivityContent = {
  nextKey: string;
  nextLabel: string;
  nextTime: string;
  nextTimeDisplay: string;
  nextEpochSeconds: number;
  prevEpochSeconds: number;
  rows: IosLiveActivityRow[];
  sunriseRow?: IosLiveActivityRow;
  extraRows: IosLiveActivityRow[];
  accentHex: string;
  systemTinted: boolean;
  tinted: boolean;
};

function iosRow(
  r: WidgetContractRow,
  clock: WidgetContractClock,
): IosLiveActivityRow {
  const pair = timePair(r.minutes, clock);
  return {
    key: r.key,
    abbr: r.abbr ?? '',
    name: r.name ?? '',
    time: pair.time,
    display: pair.display ?? pair.time,
    ...(r.minutes != null ? { minutes: r.minutes } : {}),
  };
}

/**
 * The iOS content at `now` — the reference for LiveActivityV1.swift. Null
 * when nothing is ahead. With nothing passed yet today the progress bar
 * starts an hour before the next prayer, as it always did.
 */
export function liveActivityIosContent(
  la: WidgetContractLiveActivity,
  now: WidgetNow,
  epochOf: EpochOf,
): IosLiveActivityContent | null {
  const clock = la.clock ?? { hour12: false };
  const m = liveMoment(la, now, epochOf);
  if (!m) return null;
  const next = timePair(m.nextAt, clock);
  const appearance = la.appearance;
  return {
    nextKey: m.nextRow.key,
    nextLabel: m.nextRow.name ?? '',
    nextTime: next.time,
    nextTimeDisplay: next.display ?? next.time,
    nextEpochSeconds: m.nextEpochMs / 1000,
    prevEpochSeconds: (m.prevEpochMs ?? m.nextEpochMs - 60 * 60 * 1000) / 1000,
    rows: m.shown.prayers.map(r => iosRow(r, clock)),
    ...(m.shown.sunrise ? { sunriseRow: iosRow(m.shown.sunrise, clock) } : {}),
    extraRows: (m.shown.extras ?? []).map(r => iosRow(r, clock)),
    accentHex: appearance?.accentHex ?? '#22c55e',
    systemTinted: appearance?.systemTinted ?? false,
    tinted: appearance?.tinted ?? false,
  };
}

// ── Android: the MihrabLiveActivityModule payload ────────────────────────

export type AndroidLiveActivityRow = {
  key: string;
  name: string;
  time: string;
  display?: string;
  /** Minutes after the row's day's midnight — what the service places it by. */
  minutes?: number;
  mode: WidgetContractAlertModeKind;
};

export type AndroidLiveActivityDay = {
  dateKey: string;
  hijriLabel: string;
  rows: AndroidLiveActivityRow[];
  sunriseRow?: AndroidLiveActivityRow;
  extraRows: AndroidLiveActivityRow[];
};

/** The fields `MihrabLiveActivityModule` and its service read. */
export type AndroidLiveActivityPayload = {
  nextKey: string;
  nextLabel: string;
  nextTime: string;
  nextTimeDisplay: string;
  nextEpochMs: number;
  prevEpochMs: number;
  title: string;
  rows: AndroidLiveActivityRow[];
  sunriseRow?: AndroidLiveActivityRow;
  extraRows: AndroidLiveActivityRow[];
  days: AndroidLiveActivityDay[];
  hijriLabel: string;
  showHijri: boolean;
  accentHex: string;
  systemAccent: boolean;
  tinted: boolean;
  design: 'timeline' | 'countdown' | 'markers';
  secondMetric: 'time';
  alertActionEnabled: boolean;
  aodActionEnabled: boolean;
  adhanChannelId: string;
  adhanSoundId: string;
  defaultChannelId: string;
  fgsText: string;
  alertLabelAdhan: string;
  alertLabelNotification: string;
  alertLabelSilent: string;
  alertOnceWord: string;
  aodHideLabel: string;
  aodShowLabel: string;
  nowWord: string;
  inWord: string;
  atWord: string;
  atPrayerBody: string;
};

/**
 * The Android payload at `now` — the reference for LiveActivityV1.kt. Null
 * when nothing is ahead; the app then posts its plain notification.
 */
export function liveActivityAndroidPayload(
  la: WidgetContractLiveActivity,
  now: WidgetNow,
  epochOf: EpochOf,
): AndroidLiveActivityPayload | null {
  const clock = la.clock ?? { hour12: false };
  const m = liveMoment(la, now, epochOf);
  if (!m) return null;
  const modes = new Map((la.alertModes ?? []).map(a => [a.key, a.mode]));
  const hijri = new Map((la.hijri ?? []).map(h => [h.dateKey, h.text ?? '']));
  const row = (r: WidgetContractRow): AndroidLiveActivityRow => ({
    key: r.key,
    name: r.name ?? '',
    ...timePair(r.minutes, clock),
    ...(r.minutes != null ? { minutes: r.minutes } : {}),
    mode: modes.get(r.key) ?? 'notification',
  });
  const next = timePair(m.nextAt, clock);
  const nextTimeDisplay = next.display ?? next.time;
  const nextLabel = m.nextRow.name ?? '';
  const a = la.appearance;
  const android = la.android;
  const w = la.words;
  return {
    nextKey: m.nextRow.key,
    nextLabel,
    nextTime: hhmm(m.nextAt),
    nextTimeDisplay,
    nextEpochMs: m.nextEpochMs,
    prevEpochMs: m.prevEpochMs ?? 0,
    title: `${nextLabel} · ${nextTimeDisplay}`,
    rows: m.shown.prayers.map(row),
    ...(m.shown.sunrise ? { sunriseRow: row(m.shown.sunrise) } : {}),
    extraRows: (m.shown.extras ?? []).map(row),
    days: la.days
      .filter(d => !d.estimated)
      .map(d => ({
        dateKey: d.dateKey,
        hijriLabel: hijri.get(d.dateKey) ?? '',
        rows: d.prayers.map(row),
        ...(d.sunrise ? { sunriseRow: row(d.sunrise) } : {}),
        extraRows: (d.extras ?? []).map(row),
      })),
    hijriLabel: hijri.get(m.nextDateKey) ?? '',
    showHijri: true,
    accentHex: a?.accentHex ?? '#22c55e',
    systemAccent: a?.systemAccent ?? false,
    tinted: a?.tinted ?? false,
    design: a?.design ?? 'timeline',
    secondMetric: 'time',
    alertActionEnabled: android?.alertActionEnabled ?? false,
    aodActionEnabled: android?.aodActionEnabled ?? true,
    adhanChannelId: android?.adhanChannelId ?? 'prayer-times-default',
    adhanSoundId: android?.adhanSoundId ?? 'default',
    defaultChannelId: android?.defaultChannelId ?? 'prayer-times-default',
    fgsText: w?.fgsText ?? '',
    alertLabelAdhan: w?.alertLabelAdhan ?? '',
    alertLabelNotification: w?.alertLabelNotification ?? '',
    alertLabelSilent: w?.alertLabelSilent ?? '',
    alertOnceWord: w?.alertOnceWord ?? '',
    aodHideLabel: w?.aodHideLabel ?? '',
    aodShowLabel: w?.aodShowLabel ?? '',
    nowWord: w?.nowWord ?? '',
    inWord: w?.inWord ?? '',
    atWord: w?.atWord ?? '',
    atPrayerBody: w?.atPrayerBody ?? '',
  };
}
