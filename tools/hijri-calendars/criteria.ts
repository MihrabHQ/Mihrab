/**
 * The two Indonesian month-start rules, computed from the moon's position.
 *
 * Build-time only (astronomy-engine is a devDependency): `build.ts` runs these
 * once and writes a table of month starts that the app bundles, so nothing
 * astronomical happens on a phone.
 *
 *   MABIMS — Indonesia's government (Kemenag) and Nahdlatul Ulama. On the
 *     evening after the conjunction, somewhere in Indonesia, the crescent
 *     at sunset is at least 3° high and at least 6.4° from the sun — both
 *     geocentric, which is the reading that matches every announcement
 *     (topocentric altitude gets 1 Rajab 1447 a day late). The
 *     government then confirms by sighting (sidang isbat); NU follows the
 *     sighting. Adopted in 2022 (from 1444 AH).
 *
 *   KHGT — Muhammadiyah's Kalender Hijriah Global Tunggal (from 1447 AH).
 *     One date for the whole world: the month begins on the next day when,
 *     anywhere on Earth before 24:00 UTC, the crescent at sunset is at least
 *     5° high and 8° from the sun — or, later than 24:00 UTC, when that
 *     happens on the American mainland and the conjunction came before
 *     dawn in New Zealand.
 */
import * as A from 'astronomy-engine';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type Ymd = string; // yyyy-mm-dd

export function ymd(ms: number): Ymd {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysYmd(d: Ymd, n: number): Ymd {
  return ymd(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS);
}

/** Every new moon (conjunction) from `fromMs`, for `count` lunations. */
export function conjunctions(fromMs: number, count: number): number[] {
  const out: number[] = [];
  let t = new A.AstroTime(new Date(fromMs));
  for (let i = 0; i < count; i++) {
    const nm = A.SearchMoonPhase(0, t, 40);
    if (!nm) throw new Error('no new moon found');
    out.push(nm.date.getTime());
    t = nm.AddDays(20);
  }
  return out;
}

export type Sky = { alt: number; elong: number };
export type AltMode = 'topo' | 'geo';

/**
 * The crescent at `ms` for this observer: the altitude of the moon's centre
 * (no refraction) — topocentric, as seen from that place, or geocentric, as
 * from the earth's centre — and its geocentric elongation from the sun.
 */
export function skyAt(ms: number, obs: A.Observer, mode: AltMode): Sky {
  const t = new A.AstroTime(new Date(ms));
  let ra: number;
  let dec: number;
  if (mode === 'topo') {
    const eq = A.Equator(A.Body.Moon, t, obs, true, true);
    ra = eq.ra;
    dec = eq.dec;
  } else {
    const v = A.RotateVector(A.Rotation_EQJ_EQD(t), A.GeoMoon(t));
    const eq = A.EquatorFromVector(v);
    ra = eq.ra;
    dec = eq.dec;
  }
  return {
    alt: A.Horizon(t, obs, ra, dec).altitude,
    elong: A.AngleFromSun(A.Body.Moon, t),
  };
}

/** The first sunset at this observer at or after `fromMs`, within a day. */
export function sunsetAfter(obs: A.Observer, fromMs: number): number | null {
  const r = A.SearchRiseSet(A.Body.Sun, obs, -1, new A.AstroTime(new Date(fromMs)), 1);
  return r ? r.date.getTime() : null;
}

export type Evaluation = { date: Ymd; met: boolean; best: Sky & { where: string } };

// ── MABIMS ────────────────────────────────────────────────────────────────

/**
 * Where in Indonesia the crescent is looked for, west to east. The west
 * sees the sun set last, so Aceh decides nearly every month.
 */
export const INDONESIA_POINTS: [number, number][] = [
  [5.89, 95.32], // Sabang
  [5.55, 95.32], // Banda Aceh
  [-0.95, 100.35], // Padang
  [-6.99, 106.55], // Pelabuhan Ratu
  [-6.2, 106.82], // Jakarta
  [-8.65, 115.22], // Denpasar
  [-5.14, 119.42], // Makassar
  [-10.17, 123.6], // Kupang
  [-2.53, 140.72], // Jayapura
  [-8.5, 140.4], // Merauke
];

/** WIB (UTC+7): the day a month begins, in Indonesia. */
const WIB_MS = 7 * HOUR_MS;

/**
 * MABIMS on the Indonesian evening of `dateWib`. `slack` raises (or, below
 * zero, lowers) both limits — the build asks again at ±slack to find the
 * months too close to call.
 */
export function mabimsMet(dateWib: Ymd, conjMs: number, mode: AltMode = 'geo', slack = 0): Evaluation {
  // From that day's late morning (WIB), so the search finds its evening.
  const from = Date.parse(`${dateWib}T00:00:00Z`) - WIB_MS + 10 * HOUR_MS;
  let best: Evaluation['best'] = { alt: -90, elong: 0, where: '' };
  let met = false;
  for (const [lat, lon] of INDONESIA_POINTS) {
    const obs = new A.Observer(lat, lon, 0);
    const set = sunsetAfter(obs, from);
    if (set == null || set <= conjMs) continue;
    const s = skyAt(set, obs, mode);
    if (s.alt > best.alt) best = { ...s, where: `${lat},${lon}` };
    if (s.alt >= 3 + slack && s.elong >= 6.4 + slack) met = true;
  }
  return { date: dateWib, met, best };
}

/** The first day of the month that follows the conjunction `conjMs`, by MABIMS. */
export function mabimsStart(conjMs: number, mode: AltMode = 'geo', slack = 0): Ymd {
  const d0 = ymd(conjMs + WIB_MS);
  // The evening of the conjunction day decides; a conjunction after that
  // evening's sunset leaves the next evening to decide; neither → 30 days.
  for (let i = 0; i < 2; i++) {
    const d = addDaysYmd(d0, i);
    if (mabimsMet(d, conjMs, mode, slack).met) return addDaysYmd(d, 1);
  }
  return addDaysYmd(d0, 2);
}

// ── KHGT ──────────────────────────────────────────────────────────────────

/**
 * The American mainland, for KHGT's late-evening clause: by latitude band,
 * its western coast (no Hawaii, no Aleutians, no open Pacific) and a
 * generous eastern edge. Coarse, but it is the WEST coast that decides:
 * that is where the sun sets last.
 */
const AMERICA_BANDS: [number, number, number, number][] = [
  // [minLat, maxLat, westLon, eastLon]
  [55, 72, -166, -55],
  [50, 55, -131, -55],
  [40, 50, -124, -52],
  [32, 40, -121, -70],
  [23, 32, -115, -77],
  [15, 23, -105, -86],
  [7, 15, -92, -60],
  [-18, 7, -80, -34],
  [-56, -18, -72, -40],
];

export function americanMainland(lat: number, lon: number): boolean {
  return AMERICA_BANDS.some(
    ([lo, hi, w, e]) => lat >= lo && lat < hi && lon >= w && lon <= e,
  );
}

/** Wellington: where KHGT asks whether the conjunction came before dawn. */
const NZ = new A.Observer(-41.29, 174.78, 0);

function nzFajrAfter(fromMs: number): number | null {
  const r = A.SearchAltitude(A.Body.Sun, NZ, +1, new A.AstroTime(new Date(fromMs)), 1, -18);
  return r ? r.date.getTime() : null;
}

const KHGT_LATS: number[] = [];
for (let lat = -60; lat <= 64; lat += 4) KHGT_LATS.push(lat);
const KHGT_LONS: number[] = [];
for (let lon = -180; lon < 180; lon += 5) KHGT_LONS.push(lon);

/**
 * KHGT for UTC day `dateUtc`: does the next day begin the month? A 4° × 5°
 * grid of the world is searched for an evening, after the conjunction, on
 * which the crescent at sunset is 5° high and 8° from the sun.
 */
export function khgtMet(dateUtc: Ymd, conjMs: number, mode: AltMode = 'geo'): Evaluation {
  const dayStart = Date.parse(`${dateUtc}T00:00:00Z`);
  const dayEnd = dayStart + DAY_MS;
  // The late clause needs the conjunction before New Zealand's dawn of the
  // next calendar day there, which falls inside this UTC day.
  const fajr = nzFajrAfter(dayStart);
  const lateAllowed = fajr != null && conjMs < fajr;
  let best: Evaluation['best'] = { alt: -90, elong: 0, where: '' };
  let met = false;
  for (const lat of KHGT_LATS) {
    for (const lon of KHGT_LONS) {
      const obs = new A.Observer(lat, lon, 0);
      // That place's own evening of `dateUtc`: search from its local morning.
      const localNoon = dayStart + (12 - lon / 15) * HOUR_MS;
      const set = sunsetAfter(obs, localNoon - 4 * HOUR_MS);
      if (set == null || set <= conjMs) continue;
      const before = set < dayEnd;
      if (!before && !(lateAllowed && americanMainland(lat, lon))) continue;
      const s = skyAt(set, obs, mode);
      if (s.alt > best.alt) best = { ...s, where: `${lat},${lon}${before ? '' : ' late'}` };
      if (s.alt >= 5 && s.elong >= 8) met = true;
    }
  }
  return { date: dateUtc, met, best };
}

export function khgtStart(conjMs: number, mode: AltMode = 'geo'): Ymd {
  const d0 = ymd(conjMs);
  for (let i = 0; i < 2; i++) {
    const d = addDaysYmd(d0, i);
    if (khgtMet(d, conjMs, mode).met) return addDaysYmd(d, 1);
  }
  return addDaysYmd(d0, 2);
}
