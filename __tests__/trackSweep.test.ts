/**
 * The Track, swept: every half hour of four days, at places from the
 * equator to the polar circles, both hemispheres, either side of the date
 * line, on the solstices, the equinox, the DST changes and around a new
 * and a full moon — the frame TodayCard builds (trackModel's), with the
 * prayer times the app's local engine (adhan) gives there.
 *
 * What must hold everywhere: nothing off the band or NaN; a mark for NOW
 * in every frame (the body on the chart, or its place along the line); by
 * night the ring at Fajr and Isha behind, the mark for now between them
 * and moving toward Fajr as the hours go; the moon drawn exactly while it
 * is up, and on the band.
 */
// The real engine: jest.setup.js mocks adhan for the screens' tests.
const { CalculationMethod, Coordinates, HighLatitudeRule, PrayerTimes } = jest.requireActual('adhan') as typeof import('adhan');
import { moonPosition, sunPosition } from '../src/screens/home/moon';
import { clearTrackCache, trackFrame, type TrackFrame } from '../src/screens/home/trackModel';

type Place = { name: string; latitude: number; longitude: number; tz: string };
const PLACES: Place[] = [
  { name: 'Stockholm', latitude: 59.3293, longitude: 18.0686, tz: 'Europe/Stockholm' },
  { name: 'Tromsø', latitude: 69.6492, longitude: 18.9553, tz: 'Europe/Oslo' },
  { name: 'Longyearbyen', latitude: 78.2232, longitude: 15.6267, tz: 'Arctic/Longyearbyen' },
  { name: 'Reykjavík', latitude: 64.1466, longitude: -21.9426, tz: 'Atlantic/Reykjavik' },
  { name: 'Makkah', latitude: 21.4225, longitude: 39.8262, tz: 'Asia/Riyadh' },
  { name: 'Singapore', latitude: 1.3521, longitude: 103.8198, tz: 'Asia/Singapore' },
  { name: 'Quito', latitude: -0.1807, longitude: -78.4678, tz: 'America/Guayaquil' },
  { name: 'Nairobi', latitude: -1.2921, longitude: 36.8219, tz: 'Africa/Nairobi' },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093, tz: 'Australia/Sydney' },
  { name: 'Ushuaia', latitude: -54.8019, longitude: -68.303, tz: 'America/Argentina/Ushuaia' },
  { name: 'Auckland', latitude: -36.8485, longitude: 174.7633, tz: 'Pacific/Auckland' },
  { name: 'Apia', latitude: -13.8333, longitude: -171.7667, tz: 'Pacific/Apia' },
  { name: 'Honolulu', latitude: 21.3069, longitude: -157.8583, tz: 'Pacific/Honolulu' },
  { name: 'Anchorage', latitude: 61.2181, longitude: -149.9003, tz: 'America/Anchorage' },
];
/** Days (UTC dates) the sweep starts on: solstices, equinox, DST changes, near a new and a full moon. */
const DAYS = ['2026-03-20', '2026-03-28', '2026-06-20', '2026-10-24', '2026-11-07', '2026-11-23', '2026-12-20'];

const HOUR = 3_600_000;
const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
type Ev = { name: (typeof PRAYERS)[number]; at: number };

/** The prayers around a stretch of days, in order: the app's local engine, its high-latitude default. */
/** The app's three high-latitude rules (Settings → Prayer times), the angle-based its default. */
const RULES = ['TwilightAngle', 'MiddleOfTheNight', 'SeventhOfTheNight'] as const;

function events(place: Place, startUtc: number, days: number, rule: (typeof RULES)[number]): Ev[] {
  const params = CalculationMethod.MuslimWorldLeague();
  params.highLatitudeRule = HighLatitudeRule[rule];
  const out: Ev[] = [];
  for (let d = -2; d <= days + 1; d++) {
    const day = new Date(startUtc + d * 24 * HOUR);
    const local = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const pt = new PrayerTimes(new Coordinates(place.latitude, place.longitude), local, params);
    for (const n of PRAYERS) {
      const at = (pt[n] as Date).getTime();
      if (Number.isFinite(at)) out.push({ name: n, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** As TodayCard builds it: by night (Isha to Fajr) the 24 hours to Fajr with Isha behind; else the local day. */
function frameAt(place: Place, at: number, evs: Ev[]): { frame: TrackFrame; night: boolean; prev: Ev; next: Ev } | null {
  let i = evs.findIndex(e => e.at > at);
  if (i <= 0) return null;
  const prev = evs[i - 1];
  const next = evs[i];
  const night = prev.name === 'isha' || (next.name === 'fajr' && prev.name !== 'maghrib');
  const now = new Date(at);
  const day = localDay(at, place.tz);
  const window =
    night || next.at > day.to.getTime()
      ? { kind: 'sun' as const, from: new Date(Math.min(at, next.at - 24 * HOUR)), to: new Date(Math.max(at, next.at)) }
      : { kind: 'sun' as const, ...day };
  const frame = trackFrame({
    ...window,
    now,
    latitude: place.latitude,
    longitude: place.longitude,
    nextAt: new Date(next.at),
    prevAt: night ? new Date(prev.at) : null,
  });
  return { frame, night, prev, next };
}

/**
 * The place's local day around `at`, as trackWindow gives it on a phone
 * set to the place's zone (the test process has one zone; this is the
 * same midnight to midnight, read with Intl).
 */
function localDay(at: number, tz: string): { from: Date; to: Date } {
  const offset = (t: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(t));
    const v = (k: string) => Number(parts.find(x => x.type === k)!.value);
    return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - Math.floor(t / 1000) * 1000;
  };
  const local = at + offset(at);
  const midnightLocal = Math.floor(local / (24 * HOUR)) * 24 * HOUR;
  const from = midnightLocal - offset(midnightLocal - offset(at));
  const nextLocal = midnightLocal + 24 * HOUR;
  const to = nextLocal - offset(nextLocal - offset(at));
  return { from: new Date(from), to: new Date(to) };
}

const inUnit = (v: number) => Number.isFinite(v) && v >= -1e-9 && v <= 1 + 1e-9;

describe('the Track, swept over places, seasons and hours', () => {
  beforeEach(() => clearTrackCache());

  for (const place of PLACES) {
    it(`holds at ${place.name}`, () => {
      const problems: string[] = [];
      let frames = 0;
      let nights = 0;
      const say = (at: number, what: string) => {
        if (problems.length < 25) problems.push(`${place.name} ${new Date(at).toISOString().slice(0, 16)}Z: ${what}`);
      };
      for (const rule of RULES) for (const day of DAYS) {
        const start = Date.parse(`${day}T00:00:00Z`);
        const evs = events(place, start, 4, rule);
        let last: { night: boolean; prev: number; nowX: number | null; distance: number } | null = null;
        for (let at = start; at < start + 4 * 24 * HOUR; at += HOUR / 2) {
          const got = frameAt(place, at, evs);
          if (!got) continue;
          const { frame: f, night, prev } = got;
          frames++;
          if (night) nights++;
          // Nothing off the band, nothing NaN.
          for (const p of f.points) {
            if (!inUnit(p.x) || !inUnit(p.y)) {
              say(at, `track point off the band (${p.x}, ${p.y})`);
              break;
            }
          }
          for (const [what, p] of [['body', f.body], ['ring', f.ring], ['start', f.start]] as const) {
            if (p && (!inUnit(p.x) || !inUnit(p.y))) say(at, `${what} off the band (${p.x}, ${p.y})`);
          }
          if (f.deep != null && !inUnit(f.deep)) say(at, `deep off the band ${f.deep}`);
          // A mark for now, always.
          const nowX = f.body ? f.body.x : f.deep;
          if (nowX == null) say(at, `no mark for now (sun ${sunPosition(new Date(at), place.latitude, place.longitude).altitude.toFixed(1)}°, ${night ? 'night' : 'day'})`);
          // The ring at the next prayer.
          if (!f.ring) say(at, `no ring for ${got.next.name}`);
          if (night) {
            if (!f.start) say(at, 'no mark for Isha');
            // Past the floor, moving as the hours go toward where the sun
            // comes back onto the chart (`night.x2`): the distance to it never
            // grows. That is Fajr's side; in the polar night the sun comes
            // back a little east of where it is at Fajr and climbs to it.
            if (f.body == null && f.deep != null && f.night) {
              const distance = Math.abs(f.deep - f.night.x2);
              if (last && last.night && last.prev === prev.at && last.nowX != null && distance > last.distance + 0.005) {
                say(at, `now moved away from where the sun comes back (${last.distance.toFixed(3)} → ${distance.toFixed(3)})`);
              }
              last = { night, prev: prev.at, nowX: f.deep, distance };
            }
            // Isha on the side the sun left the chart, Fajr on the side it
            // comes back: the night reads from one to the other.
            if (f.body == null && f.deep != null && f.start && f.ring && f.night) {
              const { x1, x2 } = f.night;
              // (An Isha the engine puts deep in the night — Tromsø's angle-
              // based Isha at 01:26 in late November — is where the sun is
              // then, along the floor, and is checked by the line below.)
              if (prev.at <= f.night.at1 && Math.abs(f.start.x - x1) > Math.abs(f.start.x - x2)) say(at, `Isha ${new Date(prev.at).toISOString().slice(5, 16)} (${f.start.x.toFixed(3)}) on Fajr's side (${x1.toFixed(3)} → ${x2.toFixed(3)})`);
              if (Math.abs(f.ring.x - x2) > Math.abs(f.ring.x - x1)) say(at, `Fajr (${f.ring.x.toFixed(3)}) on Isha's side (${x1.toFixed(3)} → ${x2.toFixed(3)})`);
              const lo = Math.min(x1, x2) - 1e-6;
              const hi = Math.max(x1, x2) + 1e-6;
              if (f.deep < lo || f.deep > hi) say(at, `now (${f.deep.toFixed(3)}) off the night's crossing`);
            }
          } else {
            last = null;
          }
          // The moon exactly while it is up, on the band.
          const up = moonPosition(new Date(at), place.latitude, place.longitude).altitude > 0;
          if (up !== (f.moon != null)) say(at, `moon ${up ? 'up but not drawn' : 'drawn while down'}`);
          if (f.moon && (!inUnit(f.moon.x) || !inUnit(f.moon.y))) say(at, `moon off the band (${f.moon.x}, ${f.moon.y})`);
        }
      }
      expect(problems).toEqual([]);
      // Every half hour of every day was looked at.
      expect(frames).toBeGreaterThan(RULES.length * DAYS.length * 4 * 48 * 0.95);
      if (place.name !== 'Longyearbyen') expect(nights).toBeGreaterThan(0);
    });
  }
});
