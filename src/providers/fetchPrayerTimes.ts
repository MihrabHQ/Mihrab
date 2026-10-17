import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanCalendar, fetchAladhanTimes } from './aladhan';
import { getIslamiskaForbundetDatasetTimes } from './islamiskaForbundetDataset';
import { getHabousDatasetTimes } from './habousDataset';
import { getMarwDatasetTimes } from './marwDataset';
import {
  computeNamazvaktiMethodTimes,
  getNamazvaktiTimes,
  namazvaktiCityPoint,
  nearestNamazvaktiCity,
} from './namazvakti';
import {
  JAKIM_CLOCK,
  kemenagTimesNear,
  MUIS_CLOCK,
  nationalTableFor,
} from './nationalTables';
import { computeLocalAdhanTimes } from './localAdhan';
import {
  indonesiaClock,
  MOROCCO_CLOCK,
  placeCivilDay,
  SWEDEN_CLOCK,
  type PlaceClock,
} from './locationClock';
import { notePlaceZone, placeZoneFor } from './placeZone';
import { DEVICE_CLOCK } from '../utils/prayerTimes';
import { computeDiyanetTimes, DIYANET_METHOD_ID } from './diyanetMethod';
import { autoMethodForCoords } from './autoMethod';
import { ALGERIA_METHOD_ID } from './algeriaCities';
import { nearestMoroccoCity } from './moroccoNearest';
import { SWEDEN_METHOD_ID } from './swedenMethodId';
import {
  getNearestIslamiskaForbundetCityWithDistance,
  islamiskaForbundetCityCoords,
} from './islamiskaForbundetNearest';
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import {
  inPrayerOrder,
  validateTimings,
  validateTimingShape,
} from './validateTimings';

/**
 * Islamiska Förbundet's convention on the phone, for the listed city
 * nearest the reader (the times are per city) or, beyond the listed cities'
 * reach, for the reader's own spot.
 */
function swedenOnDevice(p: UnifiedFetchParams): PrayerTimesResult {
  const near = getNearestIslamiskaForbundetCityWithDistance(
    p.latitude,
    p.longitude,
  );
  const city =
    near.distanceKm <= IFIS_STAND_IN_KM
      ? islamiskaForbundetCityCoords(near.city)
      : undefined;
  const local: PrayerTimesResult = {
    ...computeLocalAdhanTimes({
      latitude: city?.lat ?? p.latitude,
      longitude: city?.lng ?? p.longitude,
      date: p.date,
      calculationMethod: SWEDEN_METHOD_ID,
      // One Asr, the standard, as the timetable prints and the listed
      // cities give it; Settings says so to a Hanafi reader.
      school: 0,
      // a listed city's times on Sweden's clock, as the timetable prints
      // them; beyond the cities, on the reader's spot's own (`placeZone.ts`)
      placeClock: city
        ? SWEDEN_CLOCK
        : placeZoneFor(p.latitude, p.longitude, p.date),
    }),
    timezone: 'Europe/Stockholm',
    source: 'local',
  };
  validateTimingShape(local.timings);
  return local;
}
/** Within this of a listed Swedish city, the city's times stand in. */
const IFIS_STAND_IN_KM = 250;

/** Within this of a listed Moroccan city, the ministry's method stands in for its table. */
const HABOUS_STAND_IN_KM = 200;
const MOROCCO_METHOD_ID = 21;
const KEMENAG_METHOD_ID = 20;

/**
 * Methods computed on the device whatever the provider, because each is an
 * authority's own and AlAdhan's version of it is only its angles: Algeria's
 * (19; AlAdhan lacks the Ministry's Maghrib margin and its signed Asr
 * shadow), Indonesia's (20) and Morocco's (21), each read off the ministry's
 * tables; Sweden's (24), which AlAdhan has no id for; and Türkiye's (13),
 * Diyanet's. (Each authority is also its own provider — 'marw', 'kemenag',
 * 'habous', 'islamiska_forbundet', 'diyanet'; this is the method a user
 * picks by hand, or Automatic's, with another provider.) Inside the
 * authority's country the method is computed for its nearest listed place,
 * with its correction list, as the provider does — the ministry's printed
 * minute; beyond them, for the reader's own spot. Returns null when the
 * method that applies is another.
 */
const ON_DEVICE_METHODS: ReadonlySet<number> = new Set([
  ALGERIA_METHOD_ID,
  KEMENAG_METHOD_ID,
  MOROCCO_METHOD_ID,
  SWEDEN_METHOD_ID,
  DIYANET_METHOD_ID,
]);
async function onDeviceMethod(
  p: UnifiedFetchParams,
): Promise<PrayerTimesResult | null> {
  const method =
    p.calculationMethod === 'auto'
      ? autoMethodForCoords(p.latitude, p.longitude)
      : p.calculationMethod;
  if (!ON_DEVICE_METHODS.has(method)) return null;
  const at = {
    latitude: p.latitude,
    longitude: p.longitude,
    date: p.date,
    school: p.school,
  };
  let listed: PrayerTimesResult | null = null;
  try {
    if (
      method === ALGERIA_METHOD_ID &&
      isCoordinateInAlgeria(p.latitude, p.longitude)
    ) {
      listed = await getMarwDatasetTimes(at);
    } else if (
      method === MOROCCO_METHOD_ID &&
      isCoordinateInMorocco(p.latitude, p.longitude) &&
      !isCoordinateInAlgeria(p.latitude, p.longitude)
    ) {
      listed = await getHabousDatasetTimes(at);
    } else if (method === KEMENAG_METHOD_ID) {
      listed = kemenagTimesNear(p.latitude, p.longitude, p.date, p.school);
    }
  } catch {
    /* beyond the listed places' reach: the method for the spot */
  }
  if (listed) {
    validateTimingShape(listed.timings);
    return listed;
  }
  const local: PrayerTimesResult = {
    ...computeLocalAdhanTimes({
      latitude: p.latitude,
      longitude: p.longitude,
      date: p.date,
      calculationMethod: method,
      school: p.school,
      placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
    }),
    source: 'local',
  };
  validateTimingShape(local.timings);
  return local;
}

/**
 * Would `fetchPrayerTimesUnified` ask AlAdhan for these parameters? The
 * AlAdhan provider with a method that is not computed on the phone — the
 * case a month can be asked of AlAdhan's calendar in one request.
 */
export function asksAladhan(p: {
  provider: UnifiedFetchParams['provider'];
  latitude: number;
  longitude: number;
  calculationMethod: UnifiedFetchParams['calculationMethod'];
}): boolean {
  if (p.provider !== 'aladhan') return false;
  const method =
    p.calculationMethod === 'auto'
      ? autoMethodForCoords(p.latitude, p.longitude)
      : p.calculationMethod;
  return !ON_DEVICE_METHODS.has(method);
}

/**
 * A month of AlAdhan's days (`month` 1–12), each checked as a single day's
 * answer is below — Imsak made sure of, then `validateTimings` — and keyed
 * `YYYY-MM-DD`. A day that fails is left out, for the caller to ask for on
 * its own; the request failing throws.
 */
export async function fetchAladhanMonth(
  p: Pick<UnifiedFetchParams, 'latitude' | 'longitude' | 'calculationMethod' | 'school'>,
  year: number,
  month: number,
): Promise<Map<string, PrayerTimesResult>> {
  const days = await fetchAladhanCalendar({
    latitude: p.latitude,
    longitude: p.longitude,
    year,
    month,
    method: p.calculationMethod,
    school: p.school,
  });
  const out = new Map<string, PrayerTimesResult>();
  for (const day of days) {
    let timings = day.timings;
    if (!timings.Imsak && timings.Fajr) {
      timings = { ...timings, Imsak: computeImsak(timings.Fajr, DEFAULT_IMSAK_OFFSET_MINUTES) };
    }
    try {
      validateTimings(timings);
    } catch {
      continue;
    }
    notePlaceZone(p.latitude, p.longitude, day.timezone);
    out.set(day.date, {
      timings,
      timezone: day.timezone,
      source: 'aladhan',
      clock: day.timezone ?? DEVICE_CLOCK,
    });
  }
  return out;
}

/**
 * AlAdhan's day for the place's own date for the phone's (`placeCivilDay`),
 * as every reader of a day on the place's clock reads it and as the phone
 * computes it offline: the phone's date wherever the two clocks are within
 * twelve hours; across the date line (Kiritimati asking for Cologne) the
 * place's day before — AlAdhan's answer for the phone's date was read a day
 * early. The date is chosen by the place's clock as far as the app knows it
 * (`placeZone.ts`); where the zone AlAdhan names puts the place on another
 * date, that day is asked for instead (once: the zone is then known).
 */
async function askAladhan(p: UnifiedFetchParams): Promise<PrayerTimesResult> {
  const ask = (date: Date) =>
    fetchAladhanTimes({
      latitude: p.latitude,
      longitude: p.longitude,
      date,
      method: p.calculationMethod,
      school: p.school,
    });
  const dayOn = (zone: PlaceClock | undefined) => {
    const c = placeCivilDay(p.date, zone);
    return c.y === p.date.getFullYear() &&
      c.m === p.date.getMonth() &&
      c.d === p.date.getDate()
      ? p.date
      : new Date(c.y, c.m, c.d);
  };
  const asked = dayOn(placeZoneFor(p.latitude, p.longitude, p.date));
  const result = await ask(asked);
  notePlaceZone(p.latitude, p.longitude, result.timezone);
  if (!result.timezone) return result;
  const right = dayOn({ zone: result.timezone });
  return right.getTime() === asked.getTime() ? result : ask(right);
}

/**
 * The user's method on the phone, where the provider would have asked the
 * network — on the place's clock, as AlAdhan writes it (`placeZone.ts`).
 */
function offlineMethod(p: UnifiedFetchParams): PrayerTimesResult {
  const local: PrayerTimesResult = {
    ...computeLocalAdhanTimes({
      latitude: p.latitude,
      longitude: p.longitude,
      date: p.date,
      calculationMethod: p.calculationMethod,
      school: p.school,
      placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
    }),
    source: 'local',
  };
  validateTimingShape(local.timings);
  return local;
}

export async function fetchPrayerTimesUnified(
  p: UnifiedFetchParams,
): Promise<PrayerTimesResult> {
  let result: PrayerTimesResult;
  switch (p.provider) {
    case 'aladhan': {
      const onDevice = await onDeviceMethod(p);
      if (onDevice) return onDevice;
      if (p.offline) return offlineMethod(p);
      result = await askAladhan(p);
      result.source = 'aladhan';
      // AlAdhan writes a place's times on the place's clock (`meta.timezone`).
      result.clock = result.timezone ?? DEVICE_CLOCK;
      break;
    }
    case 'islamiska_forbundet': {
      // Islamiska Förbundet's cities, calculated on the phone: Diyanet's
      // method (congressMethod.ts, with swedenCorrections.ts) for the
      // nearest listed city — the source is MihrabHQ/mihrab-methods.
      // Beyond the listed cities' reach it is computed for the reader's own
      // coordinates.
      try {
        result = await getIslamiskaForbundetDatasetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        break;
      } catch {
        /* beyond the listed cities' reach */
      }
      return swedenOnDevice(p);
    }
    case 'habous': {
      // The Ministry of Habous's method, computed on the phone for the
      // nearest listed city at the point and horizons the ministry computes
      // it, with its correction list (`habousDataset.ts`). Beyond the listed
      // cities' reach, AlAdhan.
      // Morocco's rectangle takes in a strip of western Algeria — Tlemcen,
      // Maghnia — so a user there who pinned Morocco reaches this case. They
      // are not Moroccan, and Oujda's table is not theirs: they get the
      // Algerian Ministry's.
      const inAlgeria = isCoordinateInAlgeria(p.latitude, p.longitude);
      if (inAlgeria) {
        return fetchPrayerTimesUnified({ ...p, provider: 'marw' });
      } else {
        try {
          result = await getHabousDatasetTimes({
            latitude: p.latitude,
            longitude: p.longitude,
            date: p.date,
          });
          break;
        } catch {
          /* outside coverage, or past the published window */
        }
        const city = nearestMoroccoCity(p.latitude, p.longitude);
        if (city && city.distanceKm <= HABOUS_STAND_IN_KM) {
          const local: PrayerTimesResult = {
            ...computeLocalAdhanTimes({
              latitude: city.lat,
              longitude: city.lng,
              heightM: city.heightM,
              horizonMin: city.horizonMin,
              date: p.date,
              calculationMethod: MOROCCO_METHOD_ID,
              school: 0,
              placeClock: MOROCCO_CLOCK,
            }),
            source: 'local',
          };
          validateTimingShape(local.timings);
          return local;
        }
      }
      if (p.offline) return offlineMethod(p);
      result = await askAladhan(p);
      result.source = 'aladhan';
      // AlAdhan writes a place's times on the place's clock (`meta.timezone`).
      result.clock = result.timezone ?? DEVICE_CLOCK;
      break;
    }
    case 'marw': {
      // The Ministry of Religious Affairs and Wakfs's method, computed on
      // the phone for the nearest listed city at the point the Ministry
      // computes it, with its correction list (`marwDataset.ts`). Outside
      // Algeria, the Algeria method for the reader's own spot — AlAdhan is
      // not asked, because its id 19 lacks the Ministry's Maghrib margin.
      try {
        result = await getMarwDatasetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        break;
      } catch {
        /* outside coverage, or past the published year */
      }
      const local: PrayerTimesResult = {
        ...computeLocalAdhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          calculationMethod: ALGERIA_METHOD_ID,
          // The Ministry publishes one (Shafi'i) Asr, and this stands in for it.
          school: 0,
          placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
        }),
        source: 'local',
      };
      validateTimingShape(local.timings);
      return local;
    }
    case 'muis':
    case 'jakim':
    case 'kemenag': {
      // A national source (Singapore's MUIS, Malaysia's JAKIM, Indonesia's
      // Kemenag): the authority's day for the nearest listed place — the
      // published table from the phone's copy for MUIS and JAKIM, the
      // ministry's method with its correction list for Kemenag. Past the published window — JAKIM's
      // ends every 31 December until the January rebuild — the authority's
      // own method is computed on the phone (AlAdhan's ids 11, 17 and 20,
      // each fitted to the authority's own tables in `localAdhan.ts`) for
      // the listed place that would have served, at its height: a JAKIM
      // zone's time is the zone's, not the reader's spot, and the summit
      // zones are computed at the summit. Outside the country, for the
      // reader's own coordinates.
      const table = nationalTableFor(p.provider)!;
      // Kemenag's is a calculation, so it can take Hanafi Asr (two shadow
      // lengths) where the reader asks for it — Asr from the same method,
      // without the correction list's Shafi'i Asr. MUIS's and JAKIM's
      // tables print one Asr, the Shafi'i, and their days stand as printed
      // (Settings hides the toggle and says so).
      const hanafiKemenag = p.provider === 'kemenag' && p.school === 1;
      try {
        if (hanafiKemenag) {
          const listed = kemenagTimesNear(p.latitude, p.longitude, p.date, 1);
          if (!listed) throw new Error('kemenag: outside coverage');
          result = listed;
        } else {
          result = await table.getTimes({
            latitude: p.latitude,
            longitude: p.longitude,
            date: p.date,
          });
        }
        break;
      } catch {
        /* outside coverage, or past the published window */
      }
      const place = table.covers(p.latitude, p.longitude)
        ? table.nearest(p.latitude, p.longitude)
        : null;
      const local: PrayerTimesResult = {
        ...computeLocalAdhanTimes({
          latitude: place?.lat ?? p.latitude,
          longitude: place?.lon ?? p.longitude,
          heightM: place?.heightM,
          horizonMin: place?.horizonMin,
          // A JAKIM zone's times are the zone's (`malaysiaMethod.ts`).
          jakimZone: p.provider === 'jakim' && place ? place.id : undefined,
          // A listed place's day on its own clock, as its table prints it;
          // outside the country, the reader's spot's (`placeZone.ts`).
          placeClock: !place
            ? placeZoneFor(p.latitude, p.longitude, p.date)
            : p.provider === 'muis'
            ? MUIS_CLOCK
            : p.provider === 'jakim'
            ? JAKIM_CLOCK
            : indonesiaClock(place.nameEn),
          date: p.date,
          calculationMethod:
            p.provider === 'muis' ? 11 : p.provider === 'jakim' ? 17 : 20,
          // MUIS and JAKIM: the table's Shafi'i Asr, the same on a computed day as a printed one.
          school: hanafiKemenag ? 1 : 0,
        }),
        source: 'local',
      };
      validateTimingShape(local.timings);
      return local;
    }
    case 'namazvakti': {
      // namazvakti.com's published year for the nearest of its cities
      // (fetched once a year and kept). Without one — offline before the
      // first fetch, a date past the year the site serves, nowhere near a
      // listed city — the calendar's own method is computed on the phone.
      // AlAdhan is never asked: it has no method that is this calendar.
      try {
        result = await getNamazvaktiTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          school: p.school,
          offline: p.offline,
        });
        break;
      } catch {
        /* no published day — compute the method below */
      }
      // The nearest listed city's height, if its tile is on the phone — it
      // sets the temkin (Istanbul's 500 m is a minute more than 250 m).
      const near = await nearestNamazvaktiCity(
        p.latitude,
        p.longitude,
        true,
      ).catch(() => null);
      // At the city's own point, as the site computes it, when one is near —
      // to the site's own precision when the phone holds a year of the
      // city's to fit it from (the listed point is cut to the arc-minute).
      const point = near
        ? await namazvaktiCityPoint(near).catch(() => null)
        : null;
      const atLat = point?.lat ?? near?.lat ?? p.latitude;
      const atLon = point?.lon ?? near?.lon ?? p.longitude;
      const local = computeNamazvaktiMethodTimes({
        latitude: atLat,
        longitude: atLon,
        date: p.date,
        school: p.school,
        heightM: near?.heightM,
        temkin: point?.temkin,
        // The city's day on the city's clock, as the site prints it.
        placeClock: placeZoneFor(atLat, atLon, p.date),
      });
      validateTimingShape(local.timings);
      // The calendar has no rule for where the twilight does not end or
      // the sun does not set — the site lists no city north of about 62° —
      // and computed there it puts Maghrib before Asr (Tromsø, a third of
      // the year). Diyanet's method is the same school's, with the rules
      // for those latitudes its own tables use.
      if (!inPrayerOrder(local.timings)) {
        const diyanet = computeDiyanetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          school: p.school,
          placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
        });
        validateTimingShape(diyanet.timings);
        return diyanet;
      }
      return local;
    }
    case 'diyanet': {
      // Diyanet's worldwide method, computed on the phone for the reader's
      // own coordinates (`diyanetMethod.ts`). Nothing is fetched: the method
      // is the table.
      const local = computeDiyanetTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        school: p.school,
        // On the place's clock where it is not the phone's (`placeZone.ts`).
        placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
      });
      validateTimingShape(local.timings);
      return local;
    }
    case 'local_adhan': {
      // On-device calculation. Its shape is checked: it once produced
      // "NaN:NaN" for a polar day (issue #61), and a bad answer must stop
      // here as an error the caller can show, not reach a screen.
      const local: PrayerTimesResult = {
        ...computeLocalAdhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          calculationMethod: p.calculationMethod,
          school: p.school,
          // A saved place in another zone, on its own clock: written on
          // the phone's, its day landed on the phone's date (`placeZone.ts`).
          placeClock: placeZoneFor(p.latitude, p.longitude, p.date),
        }),
        source: 'local',
      };
      validateTimingShape(local.timings);
      return local;
    }
    default:
      throw new Error(`Unknown prayer data provider: ${String(p.provider)}`);
  }
  // Post-process: guarantee Imsak is present. AlAdhan returns it; the other
  // network providers compute a fallback in their normalisers; this is the
  // belt-and-suspenders pass that ensures consumers (widget, fasting tracker,
  // Suhoor countdown) never see a missing Imsak regardless of provider.
  if (!result.timings.Imsak && result.timings.Fajr) {
    result = {
      ...result,
      timings: {
        ...result.timings,
        Imsak: computeImsak(result.timings.Fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
      },
    };
  }
  // Throw early if the provider returned a structurally invalid response so
  // callers can fall through to the local-adhan fallback instead of caching garbage.
  // A day a dataset computed itself (past its window) is in the phone's own
  // clock, as every on-device answer is: its shape is what is checked.
  if (result.source === 'local') validateTimingShape(result.timings);
  else validateTimings(result.timings);
  return result;
}
