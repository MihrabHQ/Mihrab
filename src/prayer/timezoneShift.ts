/**
 * WHEN THE CLOCKS CHANGE UNDER THE APP — issue #56.
 *
 * Reported by Yushi on the day Morocco went back to GMT: Fajr was still
 * being shown at 05:49 when the country had moved to 04:49, and it stayed
 * that way for hours.
 *
 * ── WHY NOTHING CAUGHT IT ─────────────────────────────────────────────
 *
 * Every prayer time this app stores is a wall-clock string. "05:49" is not
 * a moment; it is a moment under a rule, and on 2026-09-20 Morocco changed
 * the rule. Nothing in the stored data changed, nothing expired, and
 * nothing was old — the rows were fetched yesterday and cover tomorrow.
 * The country moved and the table did not.
 *
 * The app found out the way it finds out about everything else on those
 * datasets: the ministry's builder republished, and the device's six-hourly
 * `index.json` poll eventually noticed a new `builtAt`. Six hours, ±25%,
 * and only while something asks for a time. That is the three hours in the
 * report, and it is the whole of the fault: the offset change was knowable
 * on the device, in the first millisecond, from the device's own clock.
 *
 * ── SO THE OFFSET IS THE SIGNAL ───────────────────────────────────────
 *
 * The device knows its UTC offset and it knows what that offset was the
 * last time it stored any prayer times. When those disagree, every
 * wall-clock string held for where the reader IS was written under a rule
 * that no longer applies, and no amount of freshness makes it right. That
 * is not a reason to re-poll on the usual schedule; it is a reason to throw
 * the answer away and ask again now.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not touch the OTHER places a traveller has stored. A cache slot
 * is keyed by coordinates and holds times in the local clock of those
 * coordinates: flying Stockholm → Casablanca changes this device's offset
 * and changes nothing whatsoever about Stockholm's table. Only the location
 * being loaded is invalidated, which is the one the reader is standing in
 * and the one the shift is about.
 *
 * It also cannot help a phone whose own timezone database is out of date.
 * If the device still thinks Casablanca is GMT+1, the device's clock is
 * wrong and every app on it is wrong together; there is nothing here to
 * detect and nothing to fix.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PrayerDataProviderId } from '../settings/types';
import { deviceUtcOffsetMinutes } from '../utils/utcOffset';
import { deviceZone } from '../utils/zoneClock';
import { dropStoredMonths } from './prayerStorage';
import { nationalTableFor } from '../providers/nationalTables';
import { refetchNamazvaktiNow } from '../providers/namazvakti';
import { refetchIslamiskaForbundetDatasetNow } from '../providers/islamiskaForbundetDataset';

export { deviceUtcOffsetMinutes };

const KEY = 'mihrab.prayer.utcOffset.v1';

/**
 * ── THE ZONE, NOT JUST THE OFFSET ─────────────────────────────────────
 *
 * The offset alone took every summer-time change for "the clocks changed":
 * twice a year the notice showed and the current place's stored year was
 * dropped — a year of times gone for a phone that may be offline — when
 * nothing about them was wrong. A zone's own summer time is in its rules,
 * and every stored time was written under those rules, the change included.
 *
 * So the record holds the zone's NAME too, and what its rules said the
 * offset would do from then on (`forecast`: each change over the next 400
 * days). An offset that moved under the same zone name, the way the rules
 * said it would, is that zone's summer time and not a shift. One that moved
 * under the same name the rules did NOT foresee is the rules themselves
 * changing — Morocco abolishing GMT+1, on a phone whose zone data learnt it
 * after the times were stored — and is a shift, as it always was. A new
 * zone name with a new offset is a shift (the phone was carried, or set,
 * to another zone). Where the phone cannot name its zone, the offset alone
 * decides, as before.
 */
type Forecast = {
  /** The offset the rules gave at `at`, the base the changes are read against. */
  base: number;
  /** [instant ms, offset after it] for each change the rules foresaw. */
  changes: [number, number][];
  /** The last instant the forecast covers. */
  until: number;
};

type Known = {
  minutes: number;
  zone?: string;
  at?: number;
  forecast?: Forecast;
};

const FORECAST_DAYS = 400;
/** A record this old is re-written on a quiet check, so its forecast never runs out. */
const REFRESH_AFTER_MS = 180 * 86_400_000;

const offsetAt = (t: number) => 0 - new Date(t).getTimezoneOffset();

/**
 * Every change of the device zone's offset over the next FORECAST_DAYS,
 * each to the minute: a day's step finds it, a bisection places it. A few
 * hundred `Date`s, once per record.
 */
function forecastFrom(at: number): Forecast {
  const DAY = 86_400_000;
  const base = offsetAt(at);
  const changes: [number, number][] = [];
  let prevT = at;
  let prev = base;
  const until = at + FORECAST_DAYS * DAY;
  for (let t = at + DAY; t <= until; t += DAY) {
    const o = offsetAt(t);
    if (o === prev) {
      prevT = t;
      continue;
    }
    let lo = prevT;
    let hi = t;
    while (hi - lo > 60_000) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (offsetAt(mid) === prev) lo = mid;
      else hi = mid;
    }
    changes.push([hi, o]);
    prev = o;
    prevT = t;
  }
  return { base, changes, until };
}

/** The offset the stored record's rules foresaw for `now`; null past its horizon. */
function foreseen(k: Known, now: number): number | null {
  const f = k.forecast;
  if (!f || k.at == null || now < k.at || now > f.until) return null;
  let o = f.base;
  for (const [t, after] of f.changes) {
    if (t <= now) o = after;
    else break;
  }
  return k.minutes + (o - f.base);
}

/**
 * The record this process has already settled, so the check costs one
 * AsyncStorage read per launch rather than one per load. `null` means "not
 * read yet"; `undefined` inside the stored shape means a device that has
 * never stored prayer times, which is not a shift.
 */
let known: Known | null = null;
let reading: Promise<Known | null> | null = null;

async function lastKnown(): Promise<Known | null> {
  if (known !== null) return known;
  if (!reading) {
    reading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw == null) return null;
        const parsed = JSON.parse(raw);
        const minutes = Number(parsed?.minutes);
        if (!Number.isFinite(minutes)) return null;
        const at = Date.parse(parsed?.at);
        return {
          minutes,
          zone: typeof parsed?.zone === 'string' ? parsed.zone : undefined,
          at: Number.isFinite(at) ? at : undefined,
          forecast: parsed?.forecast ?? undefined,
        };
      } catch {
        return null;
      } finally {
        reading = null;
      }
    })();
  }
  const value = await reading;
  if (value !== null) known = value;
  return value;
}

async function remember(
  minutes: number,
  zone: string | undefined,
  now: Date,
): Promise<void> {
  const at = now.getTime();
  const record: Known = { minutes, zone, at, forecast: forecastFrom(at) };
  known = record;
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...record, at: now.toISOString() }),
    );
  } catch {
    // Then it is re-detected next launch, which costs one extra refresh
    // and is the safe direction to fail in.
  }
}

export type TimezoneShift = {
  /** Minutes east of UTC the stored data was written under. */
  from: number;
  /** Minutes east of UTC now. */
  to: number;
  /** When it was noticed — what the notice on the Today card is dated by. */
  at: number;
};

/** The shift this launch noticed, until something clears it. */
let pending: TimezoneShift | null = null;

/**
 * Has the device's clock moved under a rule the stored times did not know?
 *
 * Records the new offset as it answers, so the shift is reported exactly
 * once however many loads follow. A device that has never stored an offset
 * — a first launch, or an upgrade from a build without this — records the
 * current one and reports nothing: there is no stale data to distrust,
 * only an unknown past. A zone's own summer time is not a shift (see the
 * note on `Forecast`).
 *
 * `peek` does not record a shift it finds: for a load of coordinates that
 * may not be where the phone is (the last fix, before a new one lands),
 * which must neither use up the check nor act on it. What is not a shift —
 * a first record, a zone's own summer time — is recorded either way.
 */
export async function noticeTimezoneShift(
  now: Date = new Date(),
  peek = false,
): Promise<TimezoneShift | null> {
  const to = deviceUtcOffsetMinutes(now);
  const zone = deviceZone();
  const from = await lastKnown();
  if (from === null) {
    await remember(to, zone, now);
    return null;
  }
  if (from.minutes === to) {
    // Nothing moved. A record from before the zone was kept, one for
    // another zone at the same offset, or one whose forecast is running
    // out is brought up to date quietly.
    const stale =
      from.zone !== zone ||
      !from.forecast ||
      from.at == null ||
      now.getTime() - from.at > REFRESH_AFTER_MS;
    if (stale) await remember(to, zone, now);
    return null;
  }
  if (
    zone != null &&
    from.zone === zone &&
    foreseen(from, now.getTime()) === to
  ) {
    // The zone's own summer time, which every stored time already allows
    // for: nothing to tell, nothing to drop.
    await remember(to, zone, now);
    return null;
  }
  const shift: TimezoneShift = { from: from.minutes, to, at: now.getTime() };
  if (peek) return shift;
  await remember(to, zone, now);
  pending = shift;
  return shift;
}

/**
 * The shift the reader has not been told about yet, if any.
 *
 * Held in memory on purpose: it explains a refresh that has just happened
 * in front of them. A shift the app noticed a week ago is not news, and a
 * notice that survived a restart would be a message about nothing.
 */
export function pendingTimezoneShift(): TimezoneShift | null {
  return pending;
}

export function clearTimezoneShiftNotice(): void {
  pending = null;
}

/** For tests, and for a store reset. */
export function _resetTimezoneShiftForTests(): void {
  known = null;
  reading = null;
  pending = null;
  awaitingFix = false;
  looking = null;
}

/**
 * ── WHAT A SHIFT THROWS AWAY ──────────────────────────────────────────
 *
 * Two stores hold wall-clock times for where the reader is, and both were
 * written under the old rule:
 *
 *   • the monthly cache for THIS location (`dropStoredMonths`), which is
 *     refilled by the load that follows; and
 *   • the dataset's cached city file, which is the one that mattered in
 *     the report — for Morocco the dataset is consulted BEFORE the cache,
 *     so an untouched city file means the fresh cache is never even read.
 *
 * The dataset download is awaited, the cache drop is awaited, and both
 * happen before the load that will read them. Neither can fail the load:
 * a device that is offline when the clocks change keeps nothing wrong on
 * purpose — the stored rows go, and the computed chain answers from the
 * device's own clock, which is by definition running under the new rule.
 */
export async function applyTimezoneShift(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number | 'auto';
  school: number;
}): Promise<void> {
  await Promise.allSettled([
    dropStoredMonths(params),
    refetchDatasetFor(params),
  ]);
}

/**
 * Re-download the published table this provider reads from, now.
 *
 * Exported because the same need arrives two ways: the app noticing a
 * shift, and a reader pressing "Refresh stored data" because their times
 * are wrong. Both want the file itself replaced rather than the polite
 * six-hourly poll consulted, and both are the same call. A provider with
 * no dataset behind it (AlAdhan, or the computed chain) has nothing to
 * re-download and this does nothing.
 */
export async function refetchDatasetFor(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
}): Promise<void> {
  if (params.provider === 'namazvakti') {
    await refetchNamazvaktiNow(params.latitude, params.longitude);
    return;
  }
  const table = nationalTableFor(params.provider);
  if (table) {
    await table.refetchNow(params.latitude, params.longitude);
    return;
  }
  if (params.provider === 'islamiska_forbundet') {
    await refetchIslamiskaForbundetDatasetNow(params.latitude, params.longitude);
  }
}

/**
 * Whether a shift was seen on a load of the last fix and is still waiting
 * for the load of where the phone actually is.
 */
let awaitingFix = false;
/** The look in flight, so a caller asking right after it is not answered early. */
let looking: Promise<unknown> | null = null;

export async function timezoneShiftAwaitingFix(): Promise<boolean> {
  if (looking) await looking.catch(() => null);
  return awaitingFix;
}

/**
 * The whole check, for a caller that is about to load prayer times.
 *
 * Cheap and idempotent: after the first call in a process it is a number
 * comparison. Put in front of the load rather than beside it, because the
 * ordering is the fix — a load that starts before the invalidation reads
 * exactly the stale rows this exists to throw away.
 *
 * `provisionalFix`: the coordinates are the LAST fix, painted while a new
 * one is found. After a flight that is the city left behind — Stockholm's
 * year would be dropped, though nothing about Stockholm's times changed,
 * and the check used up, so Casablanca, loaded a moment later from the new
 * fix, was never checked at all. Such a load only looks: the check stays
 * armed for the load of where the phone is, and `timezoneShiftAwaitingFix`
 * tells the caller one is owed if no new place comes.
 */
export async function settleTimezoneShift(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number | 'auto';
  school: number;
  provisionalFix?: boolean;
  /** The moment of the check; tests pin it. */
  now?: Date;
}): Promise<TimezoneShift | null> {
  const { provisionalFix, now = new Date(), ...where } = params;
  if (provisionalFix) {
    const look = noticeTimezoneShift(now, true);
    looking = look;
    const seen = await look.finally(() => {
      if (looking === look) looking = null;
    });
    if (seen) awaitingFix = true;
    return null;
  }
  awaitingFix = false;
  const shift = await noticeTimezoneShift(now);
  if (!shift) return null;
  await applyTimezoneShift(where);
  return shift;
}
