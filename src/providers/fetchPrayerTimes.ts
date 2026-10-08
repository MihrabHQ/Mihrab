import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { getIslamiskaForbundetDatasetTimes } from './islamiskaForbundetDataset';
import { getHabousDatasetTimes } from './habousDataset';
import { getMarwDatasetTimes } from './marwDataset';
import { computeLocalAdhanTimes } from './localAdhan';
import { autoMethodForCoords } from './autoMethod';
import { ALGERIA_METHOD_ID } from './algeriaCities';
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { validateTimings, validateTimingShape } from './validateTimings';
import {
  isProviderCoolingDown,
  recordProviderResult,
} from './providerHealth';

/**
 * The Algeria METHOD is computed on the device, not asked of AlAdhan:
 * AlAdhan's own "Algeria" method is the Ministry's angles without its
 * Maghrib margin, so it is three minutes early on Maghrib. (The Ministry's
 * published TABLE is the 'marw' provider; this is the method a user picks
 * by hand elsewhere, and the fallback past the table.) Returns null when
 * the method that applies is not Algeria's.
 */
function algeriaOnDevice(p: UnifiedFetchParams): PrayerTimesResult | null {
  const method =
    p.calculationMethod === 'auto'
      ? autoMethodForCoords(p.latitude, p.longitude)
      : p.calculationMethod;
  if (method !== ALGERIA_METHOD_ID) return null;
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
      const algeria = algeriaOnDevice(p);
      if (algeria) return algeria;
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
      // consecutive failures it enters a 12 h cooldown during which we
      // silently serve AlAdhan for the same coordinates instead of
      // hammering (and warn-spamming about) a dead origin. Cached days
      // remain authoritative either way (see prayerStorage). The live
      // scrape now acts as a FALLBACK rung behind the dataset above.
      if (await isProviderCoolingDown('islamiska_forbundet')) {
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
        // Same-request failover (v2.7.30): don't make the caller wait
        // for 3 failed sessions before the cooldown kicks in — serve
        // AlAdhan for THIS request too. Only if the fallback also
        // fails does the original scraper error propagate (so the
        // caller's local-adhan last resort still applies).
        try {
          result = await fetchAladhanTimes({
            latitude: p.latitude,
            longitude: p.longitude,
            date: p.date,
            method: p.calculationMethod,
            school: p.school,
          });
          result.source = 'aladhan';
          break;
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
      // scraping it per device would be worse than not, so a miss goes
      // straight to AlAdhan — which auto-selects the Morocco method — and
      // then to the caller's on-device last resort, where the Morocco
      // parameters now sit within a minute of the ministry.
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
