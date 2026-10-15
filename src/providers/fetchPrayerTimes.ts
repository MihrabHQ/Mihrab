import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { getIslamiskaForbundetDatasetTimes } from './islamiskaForbundetDataset';
import { getHabousDatasetTimes } from './habousDataset';
import { getMarwDatasetTimes } from './marwDataset';
import { computeNamazvaktiMethodTimes, getNamazvaktiTimes, namazvaktiCityPoint, nearestNamazvaktiCity } from './namazvakti';
import { kemenagTimesNear, nationalTableFor } from './nationalTables';
import { computeLocalAdhanTimes } from './localAdhan';
import { MOROCCO_CLOCK, SWEDEN_CLOCK } from './locationClock';
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
import { validateTimings, validateTimingShape } from './validateTimings';

/**
 * Islamiska Förbundet's convention on the phone, for the listed city
 * nearest the reader (the times are per city) or, beyond the listed cities'
 * reach, for the reader's own spot.
 */
function swedenOnDevice(p: UnifiedFetchParams): PrayerTimesResult {
  const near = getNearestIslamiskaForbundetCityWithDistance(p.latitude, p.longitude);
  const city = near.distanceKm <= IFIS_STAND_IN_KM ? islamiskaForbundetCityCoords(near.city) : undefined;
  const local: PrayerTimesResult = {
    ...computeLocalAdhanTimes({
      latitude: city?.lat ?? p.latitude,
      longitude: city?.lng ?? p.longitude,
      date: p.date,
      calculationMethod: SWEDEN_METHOD_ID,
      school: p.school,
      // a listed city's times on Sweden's clock, as the timetable prints them
      placeClock: city ? SWEDEN_CLOCK : undefined,
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
async function onDeviceMethod(p: UnifiedFetchParams): Promise<PrayerTimesResult | null> {
  const method =
    p.calculationMethod === 'auto'
      ? autoMethodForCoords(p.latitude, p.longitude)
      : p.calculationMethod;
  if (!ON_DEVICE_METHODS.has(method)) return null;
  const at = { latitude: p.latitude, longitude: p.longitude, date: p.date, school: p.school };
  let listed: PrayerTimesResult | null = null;
  try {
    if (method === ALGERIA_METHOD_ID && isCoordinateInAlgeria(p.latitude, p.longitude)) {
      listed = await getMarwDatasetTimes(at);
    } else if (method === MOROCCO_METHOD_ID && isCoordinateInMorocco(p.latitude, p.longitude) && !isCoordinateInAlgeria(p.latitude, p.longitude)) {
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
      result = await fetchAladhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        method: p.calculationMethod,
        school: p.school,
      });
      result.source = 'aladhan';
      break;
    }
    case 'prayertimes_dev':
      result = await fetchPrayTimesDev({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        school: p.school,
      });
      break;
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
      result = await fetchAladhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        method: p.calculationMethod,
        school: p.school,
      });
      result.source = 'aladhan';
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
      try {
        result = await table.getTimes({ latitude: p.latitude, longitude: p.longitude, date: p.date });
        break;
      } catch {
        /* outside coverage, or past the published window */
      }
      const place = table.covers(p.latitude, p.longitude) ? table.nearest(p.latitude, p.longitude) : null;
      const local: PrayerTimesResult = {
        ...computeLocalAdhanTimes({
          latitude: place?.lat ?? p.latitude,
          longitude: place?.lon ?? p.longitude,
          heightM: place?.heightM,
          horizonMin: place?.horizonMin,
          // A JAKIM zone's times are the zone's (`malaysiaMethod.ts`).
          jakimZone: p.provider === 'jakim' && place ? place.id : undefined,
          date: p.date,
          calculationMethod: p.provider === 'muis' ? 11 : p.provider === 'jakim' ? 17 : 20,
          school: 0,
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
        });
        break;
      } catch {
        /* no published day — compute the method below */
      }
      // The nearest listed city's height, if its tile is on the phone — it
      // sets the temkin (Istanbul's 500 m is a minute more than 250 m).
      const near = await nearestNamazvaktiCity(p.latitude, p.longitude, true).catch(() => null);
      // At the city's own point, as the site computes it, when one is near —
      // to the site's own precision when the phone holds a year of the
      // city's to fit it from (the listed point is cut to the arc-minute).
      const point = near ? await namazvaktiCityPoint(near).catch(() => null) : null;
      const local = computeNamazvaktiMethodTimes({
        latitude: point?.lat ?? near?.lat ?? p.latitude,
        longitude: point?.lon ?? near?.lon ?? p.longitude,
        date: p.date,
        school: p.school,
        heightM: near?.heightM,
        temkin: point?.temkin,
      });
      validateTimingShape(local.timings);
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
