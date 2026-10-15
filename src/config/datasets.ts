// ── NATIONAL TABLES (SINGAPORE, MALAYSIA) ─────────────────────────
//
// Published per place by the country's own authority and mirrored by
// `tools/national-tables/`, read through `providers/nationalTable.ts`.

export const MUIS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/singapore/v1';
export const JAKIM_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/malaysia/v1';

/** Fallback refresh when the index poll cannot reach the server. */
export const NATIONAL_TABLE_REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
/** How often to re-read the tiny `index.json`. ±25% jitter at the call site. */
export const NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** `.github/workflows/national-tables.yml` cron `19 2 * * 1`, for display only. */
export const NATIONAL_TABLE_SERVER_CRON_UTC = { weekday: 1, hour: 2, minute: 19 }; // Mondays

/** The next Monday run (UTC) after `from`. */
export function nextNationalTableServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCHours(NATIONAL_TABLE_SERVER_CRON_UTC.hour, NATIONAL_TABLE_SERVER_CRON_UTC.minute, 0, 0);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== NATIONAL_TABLE_SERVER_CRON_UTC.weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// ── NAMAZVAKTI.COM (TÜRKİYE TAKVİMİ) ─────────────────────────────────
//
// An index of the site's ~120,000 cities (`tools/namazvakti-dataset`), in 5°
// tiles: the phone reads its tile from here and picks the nearest city. The
// city's year comes from the `data-namazvakti-<year>` release (mirrors.ts,
// `years.ts`), the site itself only behind it. See `providers/namazvakti.ts`.

export const NAMAZVAKTI_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/namazvakti/v1';

/** The site itself, asked for a city's year only when Mihrab's mirror does not have it. */
export const NAMAZVAKTI_ORIGIN = 'https://www.namazvakti.com';

/** How long a tile of the city index is kept before it is read again. */
export const NAMAZVAKTI_TILE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Past this, a held year is fetched again in the background, in case the
 * site has corrected it. The calendar is published a year at a time.
 */
export const NAMAZVAKTI_REFETCH_AFTER_MS = 45 * 24 * 60 * 60 * 1000; // 45 days

/** After a failed fetch — or one that did not have the day — the site is not asked again for this long. */
export const NAMAZVAKTI_RETRY_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * The furthest a reader may be from the site's nearest city and still be
 * given its times. The site lists towns down to a few thousand people, so
 * a reader further than this is somewhere it does not cover; the calendar's
 * method is then computed for their own coordinates.
 */
export const NAMAZVAKTI_MAX_CITY_KM = 75;

/** How often the statistics panel may re-read the index's `index.json`. */
export const NAMAZVAKTI_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** `.github/workflows/namazvakti-dataset.yml` cron `37 1 * * *`, for display only. */
export const NAMAZVAKTI_SERVER_CRON_DAILY_UTC = { hour: 1, minute: 37 };

/** The next city-index build (UTC) after `from` — daily. */
export function nextNamazvaktiServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCHours(NAMAZVAKTI_SERVER_CRON_DAILY_UTC.hour, NAMAZVAKTI_SERVER_CRON_DAILY_UTC.minute, 0, 0);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// ── HIJRI CORRECTIONS ─────────────────────────────────────────────────
//
// Announced Hijri month starts that replace the app's calendar tables —
// chiefly Kemenag's sidang isbat when it overrules the MABIMS prediction.
// Edited by hand in the repository (data/hijri/v1/overrides.json) after an
// announcement; see `hijri/overrides.ts`.

export const HIJRI_OVERRIDES_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/hijri/v1/overrides.json';

/** How often a phone asks for it. An isbat is announced on the evening
 *  before the month begins, so a few hours is what keeps that night right. */
export const HIJRI_OVERRIDES_POLL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── THE METHODS' CERTIFICATION AND CORRECTION LISTS ──────────────────
//
// MihrabHQ/mihrab-methods certifies each computed method against its
// authority's tables and publishes the correction list it certified
// (`methodCurrency.ts`). A newer list for this build's method is taken
// within a day; a method that has moved on is reported, not guessed at.

export const METHODS_CERTIFICATION_URL =
  'https://raw.githubusercontent.com/MihrabHQ/mihrab-methods/main/certification.json';
export const METHODS_CORRECTIONS_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/mihrab-methods/main/data/corrections';
export const METHODS_CERTIFICATION_POLL_MS = 12 * 60 * 60 * 1000; // 12 hours
