import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { getIslamiskaForbundetDatasetTimes } from './islamiskaForbundetDataset';
import { getHabousDatasetTimes } from './habousDataset';
import { getMarwDatasetTimes } from './marwDataset';
import { computeNamazvaktiMethodTimes, getNamazvaktiTimes, nearestNamazvaktiCity } from './namazvakti';
import { nationalTableFor } from './nationalTables';
import { computeLocalAdhanTimes } from './localAdhan';
import { autoMethodForCoords } from './autoMethod';
import { ALGERIA_METHOD_ID } from './algeriaCities';
import { nearestMoroccoCity } from './moroccoNearest';
import { SWEDEN_METHOD_ID } from './swedenMethodId';
import {
  getNearestIslamiskaForbundetCityWithDistance,
  islamiskaForbundetCityCoords,
} from './islamiskaForbundetNearest';
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { validateTimings, validateTimingShape } from './validateTimings';
import {
  isProviderCoolingDown,
  recordProviderResult,
} from './providerHealth';

/**
 * Islamiska Förbundet's convention on the phone, for the listed city
 * nearest the reader (the tables are per city) or, beyond the dataset's
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
    }),
    timezone: 'Europe/Stockholm',
    source: 'local',
  };
  validateTimingShape(local.timings);
  return local;
}
/** Within this of a listed Swedish city, its table's convention stands in at the city. */
const IFIS_STAND_IN_KM = 250;

/** Within this of a listed Moroccan city, the ministry's method stands in for its table. */
const HABOUS_STAND_IN_KM = 200;
const MOROCCO_METHOD_ID = 21;

/**
 * Methods computed on the device whatever the provider: Algeria's, since
 * AlAdhan's own "Algeria" is the Ministry's angles without its Maghrib
 * margin (three minutes early) and its Asr without the Ministry's shadow;
 * and Sweden's, Islamiska Förbundet's convention, which AlAdhan has no id
 * for at all. (Each authority's published TABLE is its own provider —
 * 'marw', 'islamiska_forbundet'; this is the method a user picks by hand
 * elsewhere, and the fallback past the table.) Returns null when the
 * method that applies is another.
 */
const ON_DEVICE_METHODS: ReadonlySet<number> = new Set([ALGERIA_METHOD_ID, SWEDEN_METHOD_ID]);
function onDeviceMethod(p: UnifiedFetchParams): PrayerTimesResult | null {
  const method =
    p.calculationMethod === 'auto'
      ? autoMethodForCoords(p.latitude, p.longitude)
      : p.calculationMethod;
  if (!ON_DEVICE_METHODS.has(method)) return null;
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
      const onDevice = onDeviceMethod(p);
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
      // 0. Prepared dataset FIRST (v2.7.x): a scheduled server-side job mirrors
      // the bönetider times into a static CDN file (+ a bundled seed), so the
      // normal path has NO live dependency on the flaky origin. A miss (date
      // beyond the dataset / unknown city) falls through to the live chain.
      try {
        result = await getIslamiskaForbundetDatasetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        break;
      } catch {
        /* dataset miss — try the live sources below */
      }
      // The Swedish scraper origin regularly times out. After 3
      // consecutive failures it enters a 12 h cooldown during which the
      // day is computed on the phone instead of hammering (and
      // warn-spamming about) a dead origin — with Islamiska Förbundet's
      // own convention (method 24, read off its tables), for the nearest
      // listed city, so the stand-in is the table's own minute or near
      // it. Cached days remain authoritative either way (see
      // prayerStorage). The live scrape acts as a FALLBACK rung behind
      // the dataset above.
      if (await isProviderCoolingDown('islamiska_forbundet')) {
        return swedenOnDevice(p);
      }
      try {
        result = await fetchIslamiskaForbundetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        result.source = 'scrape';
        void recordProviderResult('islamiska_forbundet', true);
      } catch (e) {
        void recordProviderResult('islamiska_forbundet', false);
        // Same-request failover: don't make the caller wait for 3 failed
        // sessions before the cooldown kicks in — compute THIS request
        // too. (Until October 2026 this asked AlAdhan, whose nearest
        // method is the Muslim World League's: an hour apart from the
        // tables on a midsummer night.)
        try {
          return swedenOnDevice(p);
        } catch {
          throw e;
        }
      }
      break;
    }
    case 'habous': {
      // The Ministry of Habous's own published tables, from the prepared
      // dataset. There is no live rung behind it: the ministry serves one
      // Hijri month at a time and its endpoint is unreliable enough that
      // scraping it per device would be worse than not. Past the published
      // month the ministry's method is computed on the phone, for the
      // nearest listed city and at its height — the ministry lowers the
      // horizon for a town on a hill, which AlAdhan's id 21 cannot — and
      // only outside the ministry's reach is AlAdhan asked.
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
      // The Ministry of Religious Affairs and Wakfs's own table, from the
      // prepared dataset (bundled for the year, refreshed from the CDN).
      // Past the published year, or outside Algeria, the Algeria method is
      // computed on the device — AlAdhan is not asked, because its id 19
      // lacks the Ministry's Maghrib margin.
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
      // A national table (Singapore's MUIS, Malaysia's JAKIM, Indonesia's
      // Kemenag): the authority's published day for the nearest listed
      // place, from the phone's copy. Past the published window — JAKIM's
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
      // At the city's own point, as the site computes it, when one is near.
      const local = computeNamazvaktiMethodTimes({
        latitude: near?.lat ?? p.latitude,
        longitude: near?.lon ?? p.longitude,
        date: p.date,
        school: p.school,
        heightM: near?.heightM,
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
  validateTimings(result.timings);
  return result;
}
