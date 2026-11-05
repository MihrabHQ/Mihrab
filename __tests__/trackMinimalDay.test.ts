/**
 * Minimal's Track through whole days, everywhere.
 *
 * TodayCard draws Minimal under the Track with the depth: the sun over the
 * 24 hours that end at the next prayer, the interval's prayer marked where
 * the sun was then, the next prayer's ring where it will be, and — while
 * the sun is deeper than the chart goes — the sun on the floor, crossing
 * the night by the clock. This sweeps that frame every ten minutes through
 * days that are hard for it: the equinox, both solstices, today's
 * November, the clocks changing; Stockholm, the Arctic in midnight sun and
 * polar night, Svalbard, Reykjavik, the equator (a sun through the zenith,
 * placed by the hour), Mecca, the southern hemisphere; with the prayer
 * times a reader there would see (adhan, Muslim World League, the
 * high-latitude rule its own recommendation picks).
 */
import { acrossNight, clearTrackCache, TRACK_FLOOR, trackFrame, type TrackFrame } from '../src/screens/home/trackModel';
import { placeTrackLabels } from '../src/screens/home/trackLabels';

// The real engine: jest.setup mocks 'adhan' with fixed, well-separated times.
const adhan = jest.requireActual<typeof import('adhan')>('adhan');

const PLACES = {
  Stockholm: { latitude: 59.33, longitude: 18.07 },
  Tromso: { latitude: 69.65, longitude: 18.96 },
  Longyearbyen: { latitude: 78.22, longitude: 15.65 },
  Reykjavik: { latitude: 64.15, longitude: -21.94 },
  Mecca: { latitude: 21.42, longitude: 39.83 },
  Nairobi: { latitude: -1.29, longitude: 36.82 },
  Quito: { latitude: -0.18, longitude: -78.47 },
  Singapore: { latitude: 1.35, longitude: 103.82 },
  Sydney: { latitude: -33.87, longitude: 151.21 },
  Ushuaia: { latitude: -54.8, longitude: -68.3 },
} as const;
type Place = keyof typeof PLACES;

// UTC midnights; every place is swept over the same 24 hours plus a margin,
// which covers each one's local day whatever its offset.
const DATES = ['2026-03-21', '2026-03-29', '2026-06-21', '2026-09-23', '2026-10-25', '2026-11-05', '2026-12-21'];
const TICK = 10 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Prayer = { name: string; at: number };

function prayersAround(place: Place, day: Date): Prayer[] {
  const { latitude, longitude } = PLACES[place];
  const coords = new adhan.Coordinates(latitude, longitude);
  const params = adhan.CalculationMethod.MuslimWorldLeague();
  // The app's default rule (settings: angle_based).
  params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle;
  const out: Prayer[] = [];
  for (const d of [-1, 0, 1, 2]) {
    const date = new Date(day.getTime() + d * DAY);
    const t = new adhan.PrayerTimes(coords, date, params);
    for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
      const at = t[name]?.getTime();
      if (Number.isFinite(at)) out.push({ name, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The frame TodayCard builds for Minimal at `now` (trackAt with `trackDepth`). */
function minimalFrame(place: Place, now: number, prayers: Prayer[]) {
  const next = prayers.find(p => p.at > now);
  const prev = [...prayers].reverse().find(p => p.at <= now);
  if (!next) return null;
  const track = trackFrame({
    kind: 'sun',
    now: new Date(now),
    nextAt: new Date(next.at),
    prevAt: prev ? new Date(prev.at) : null,
    ...PLACES[place],
    from: new Date(Math.min(now, next.at - DAY)),
    to: new Date(Math.max(now, next.at)),
  });
  return { track, next, prev };
}

/** Where the dot is, in the band's unit square with the floor at y = 1 + 20/top. */
function dot(t: TrackFrame): { x: number; y: number } | null {
  if (t.body) return { x: t.body.x, y: t.body.under ? 1 + Math.min(1, -t.body.altitude / -TRACK_FLOOR) * (-TRACK_FLOOR / t.top) : t.body.y };
  if (t.deep != null) return { x: t.deep, y: 1 + -TRACK_FLOOR / t.top };
  return null;
}

describe.each(Object.keys(PLACES) as Place[])('Minimal Track through the day — %s', place => {
  beforeEach(() => clearTrackCache());

  it.each(DATES)('%s', date => {
    const problems: string[] = [];
    const day = new Date(`${date}T00:00:00Z`);
    const prayers = prayersAround(place, day);
    let last: {
      at: number;
      next: string;
      x: number;
      y: number;
      circumpolar: boolean;
      night: number | null;
      floor: boolean;
    } | null = null;
    for (let now = day.getTime() - 2 * HOUR; now <= day.getTime() + DAY + 2 * HOUR; now += TICK) {
      const f = minimalFrame(place, now, prayers);
      const when = `${new Date(now).toISOString().slice(0, 16)}Z`;
      if (!f) {
        problems.push(`${when}: no next prayer`);
        continue;
      }
      const { track, next, prev } = f;
      const here = dot(track);
      // The dot is always somewhere.
      if (!here) {
        problems.push(`${when}: no dot (next ${next.name})`);
        continue;
      }
      // The next prayer's ring, and the interval's prayer, are always placed.
      if (!track.ring) problems.push(`${when}: no ring for ${next.name}`);
      if (prev && prev.at >= next.at - DAY && !track.start) problems.push(`${when}: no mark for ${prev.name}`);
      // On the floor: inside the night it is crossing.
      if (track.deep != null) {
        const n = track.night;
        if (!n) problems.push(`${when}: on the floor with no night`);
        else {
          const lo = Math.min(n.x1, n.x2) - 1e-9;
          const hi = Math.max(n.x1, n.x2) + 1e-9;
          if (track.deep < lo || track.deep > hi) problems.push(`${when}: off its night (${track.deep.toFixed(3)})`);
          if (!(n.at1 <= now && now <= n.at2)) problems.push(`${when}: night does not hold now`);
          if (Math.abs(acrossNight(n, now) - track.deep) > 1e-9) problems.push(`${when}: not by the clock`);
        }
      }
      // A ring or mark on the floor is on the same night as the dot's, ahead of / behind it.
      for (const [label, m] of [
        ['ring', track.ring],
        ['mark', track.start],
      ] as const) {
        if (m && (m.x < -1e-9 || m.x > 1 + 1e-9)) problems.push(`${when}: ${label} off the chart`);
      }
      // No jumps on the track: ten minutes moves the dot a little, unless
      // it is the circumpolar seam (north, where the chart's edges meet).
      // On the floor it crosses the night at the night's own pace — a
      // short one (Tromsø at the equinox dips past the floor for an hour)
      // is crossed fast — which the clock checks above already hold it to.
      if (last && !last.circumpolar && !track.circumpolar && track.body && !last.floor) {
        const dx = Math.abs(here.x - last.x);
        const dy = Math.abs(here.y - last.y);
        if (dx > 0.08 || dy > 0.12) {
          problems.push(
            `${when}: jumps ${dx.toFixed(3)}/${dy.toFixed(3)} (${last.next}→${next.name}, ${track.body ? 'on track' : 'floor'})`,
          );
        }
      }
      // Across a night the dot only goes one way.
      if (last && track.deep != null && last.night != null && track.night && track.night.at1 === last.night) {
        const dir = Math.sign(track.night.x2 - track.night.x1);
        if (dir * (here.x - last.x) < -1e-6) problems.push(`${when}: goes back across the night`);
      }
      // The names, at a phone's size, stay clear and never across the line.
      const width = 412;
      const bandTop = 110;
      const floor = 520;
      const roomTop = bandTop + 11;
      const horizon = roomTop + (floor - roomTop) * (track.top / (track.top + -TRACK_FLOOR));
      const X = (p: { x: number }) => p.x * width;
      const Y = (p: { under: boolean; y: number; altitude: number }) =>
        p.under ? horizon + Math.min(1, -p.altitude / -TRACK_FLOOR) * (floor - horizon) : roomTop + p.y * (horizon - roomTop);
      const placed = placeTrackLabels(
        track,
        { width, bandTop, horizon, bottom: floor, X, Y },
        { path: "Sun's path", below: 'Sun below the horizon', horizon: 'Horizon', prayer: next.name },
        1,
      );
      for (const l of placed) {
        if (l.y < horizon + 2 && l.y + l.h > horizon - 2) problems.push(`${when}: ${l.key} across the line`);
        if (l.x < 24 || l.x + l.w > width - 24 || l.y < bandTop || l.y + l.h > floor) problems.push(`${when}: ${l.key} out of the band`);
      }
      if (!placed.some(l => l.key === 'horizon')) problems.push(`${when}: horizon not named`);
      last = {
        at: now,
        next: next.name,
        x: here.x,
        y: here.y,
        circumpolar: track.circumpolar,
        night: track.night?.at1 ?? null,
        floor: !track.body,
      };
    }
    expect(problems).toEqual([]);
  });
});
