import type { TimingsMap } from '../types/prayer';
import type { PrayerDataProviderId } from '../settings/types';

/**
 * Which rung of the fetch chain actually produced a result. Surfaced in the
 * Settings → data statistics panel so users can see where today's times came
 * from. `cdn`/`seed` are the Sweden prepared-dataset sources.
 */
export type DataSource =
  | 'cdn' // cached CDN mirror of the prepared Sweden dataset
  | 'seed' // bundled offline seed
  | 'namazvakti' // a year fetched from namazvakti.com (Türkiye Takvimi)
  | 'live' // the authority's own API, asked as a backup to the repo's copy
  | 'aladhan' // AlAdhan API
  | 'local'; // on-device calculation

export type PrayerTimesResult = {
  timings: TimingsMap;
  timezone?: string;
  /** Which source produced these timings (set by the fetch chain). */
  source?: DataSource;
  /**
   * The clock the times are written on: an IANA zone, or `'device'` for the
   * phone's (`DEVICE_CLOCK` in `utils/prayerTimes.ts`). Not `timezone`, which
   * names the place's zone whatever clock the strings are on. Absent is the
   * phone's.
   */
  clock?: string;
};

export type UnifiedFetchParams = {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  date: Date;
  calculationMethod: number | 'auto';
  school: number;
  /**
   * Answer from the phone alone: every on-device path as usual, and where
   * the provider would go to the network (AlAdhan, namazvakti.com) the
   * method computed instead. For the readers that must not fetch — the
   * widget's headless refresh — and the fallback after a fetch failed, so
   * either is the PROVIDER's answer (its listed place, clock, corrections)
   * rather than a generic calculation at the raw coordinates.
   */
  offline?: boolean;
};
