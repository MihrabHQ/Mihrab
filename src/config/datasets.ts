/**
 * Static, CDN-fronted prayer-times dataset built by the scheduled GitHub
 * Actions job (`.github/workflows/ifis-dataset.yml`, script in
 * `tools/ifis-dataset/`). The job scrapes Islamiska Förbundet once server-side
 * and commits per-city JSON here, so the app reads a static file instead of
 * hitting the flaky bönetider widget on every device.
 *
 * Served from GitHub's raw endpoint (Fastly-fronted). Per-city files live at
 * `${IFIS_DATASET_BASE_URL}/cities/<slug>.json`.
 *
 * Forks: change the owner/repo to your own mirror.
 */
export const IFIS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/v1';

/** Refresh a cached city file when the local copy is older than this (a
 *  fallback for when the index poll can't reach the server). */
export const IFIS_DATASET_REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * How often the client re-reads the tiny `index.json` to learn whether the
 * server has published a newer build. The server commits atomically at the end
 * of its run, so a client that polls mid-run simply sees the previous build and
 * skips — no collision. ±25% jitter (applied at call sites) spreads client load
 * and de-synchronises devices.
 */
export const IFIS_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * The server's weekly schedule (`.github/workflows/ifis-dataset.yml`
 * cron `17 3 * * 1`), in UTC. Used only to *display* the next expected server
 * run in the statistics panel — not to gate fetching.
 */
export const IFIS_SERVER_CRON_UTC = { weekday: 1, hour: 3, minute: 17 }; // Mon 03:17 UTC

/** Compute the next server run (UTC) after `from`. */
export function nextServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  // Advance minute-by-minute is overkill; jump to the target time today then roll.
  d.setUTCHours(IFIS_SERVER_CRON_UTC.hour, IFIS_SERVER_CRON_UTC.minute, 0, 0);
  // Move to the correct weekday (1 = Monday); if already past, add a week.
  const dowDiff = (IFIS_SERVER_CRON_UTC.weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + dowDiff);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

// ── MOROCCO ───────────────────────────────────────────────────────────
//
// Same arrangement, different constraint. The Ministry of Habous's page
// takes a city and nothing else and returns whatever HIJRI month it is
// currently showing — there is no date parameter — so the builder cannot
// walk a horizon the way the Swedish one does. It accumulates: each weekly
// run merges the month it can see into what is already committed.
//
// That makes the forward window shorter and the refresh cadence more
// important, which is why the poll interval here is tighter than Sweden's.

export const HABOUS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/prayer-times/morocco/v1';

/** Fallback refresh when the index poll cannot reach the server. Shorter
 *  than Sweden's three days because the window itself is shorter. */
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
 * walking a horizon once a week. The statistics panel shows both cadences
 * side by side, and showing Sweden's Monday for both was one of the ways the
 * single shared slot misread the Moroccan dataset.
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
