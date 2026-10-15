// ── MOROCCO ───────────────────────────────────────────────────────────
//
// The Ministry of Habous's page takes a city and nothing else and returns
// whatever HIJRI month it is currently showing — there is no date
// parameter — so the builder cannot walk a horizon. It accumulates: each
// run merges the month it can see into what is already committed.
//
// That makes the forward window short and the refresh cadence important,
// which is why the poll interval here is tight.

export const HABOUS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/morocco/v1';

/** Fallback refresh when the index poll cannot reach the server. Shorter
 *  because the window itself is short. */
export const HABOUS_DATASET_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

/** How often to re-read the tiny `index.json`. ±25% jitter at the call site. */
export const HABOUS_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** `.github/workflows/habous-dataset.yml` cron `41 4 * * *`, for display only. */
export const HABOUS_SERVER_CRON_DAILY_UTC = { hour: 4, minute: 41 }; // every day

/**
 * Compute the next Moroccan server run (UTC) after `from`.
 *
 * Daily, not weekly: the builder can only see the Hijri month the ministry's
 * page is currently showing, so it accumulates a little every day instead of
 * walking a horizon once a week. The statistics panel shows each dataset's
 * cadence on its own row.
 */
export function nextHabousServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCHours(
    HABOUS_SERVER_CRON_DAILY_UTC.hour,
    HABOUS_SERVER_CRON_DAILY_UTC.minute,
    0,
    0,
  );
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// ── ALGERIA ───────────────────────────────────────────────────────────
//
// The Ministry of Religious Affairs and Wakfs publishes a year at a time,
// as an update to its own app, and the bundled seed holds that year. The
// CDN copy is how next year's table reaches phones ahead of an app release,
// so the device need not ask often: once a day is plenty.

export const MARW_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/algeria/v1';

/** Fallback refresh when the index cannot be reached. */
export const MARW_DATASET_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** How often to re-read `index.json`. ±25% jitter at the call site. */
export const MARW_INDEX_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * `.github/workflows/marw-dataset.yml`: 05:23 UTC every Monday, and every
 * day in May, June and July, when the Ministry's new year is due. For
 * display only.
 */
export const MARW_SERVER_CRON_UTC = { hour: 5, minute: 23, weekday: 1, dailyMonths: [5, 6, 7] };

/** Compute the next Algerian server run (UTC) after `from`. */
export function nextMarwServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCHours(MARW_SERVER_CRON_UTC.hour, MARW_SERVER_CRON_UTC.minute, 0, 0);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 8; i++) {
    const daily = MARW_SERVER_CRON_UTC.dailyMonths.includes(d.getUTCMonth() + 1);
    if (daily || d.getUTCDay() === MARW_SERVER_CRON_UTC.weekday) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// ── NATIONAL TABLES (SINGAPORE, MALAYSIA, INDONESIA) ─────────────────
//
// Published per place by the country's own authority and mirrored by
// `tools/national-tables/`, read through `providers/nationalTable.ts`.

export const MUIS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/singapore/v1';
export const JAKIM_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/malaysia/v1';
export const KEMENAG_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/indonesia/v1';

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
