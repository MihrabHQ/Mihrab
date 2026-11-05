import { LABEL_INSET, labelWidth, placeTrackLabels, type PlacedLabel } from '../src/screens/home/trackLabels';
import { trackFrame, trackWindow, type TrackBase, type TrackFrame } from '../src/screens/home/trackModel';

/**
 * The Track's names, across the day, the world and the screens: every
 * name inside the band, above the line, off the edges, clear of the body,
 * the ring and each other — and the path named wherever there is room.
 */

const PLACES = {
  Stockholm: { latitude: 59.33, longitude: 18.07, tz: 1 },
  Tromso: { latitude: 69.65, longitude: 18.96, tz: 1 },
  Nairobi: { latitude: -1.29, longitude: 36.82, tz: 3 },
  Sydney: { latitude: -33.87, longitude: 151.21, tz: 11 },
  Mecca: { latitude: 21.42, longitude: 39.83, tz: 3 },
  Reykjavik: { latitude: 64.15, longitude: -21.94, tz: 0 },
  Quito: { latitude: -0.18, longitude: -78.47, tz: -5 },
} as const;
const DATES = ['2026-03-21', '2026-06-21', '2026-11-05', '2026-12-21'];

/** Screens: a short phone band, the usual one, a tall one, the desktop's card. */
const SCREENS = [
  { name: 'compact', width: 360, bandTop: 70, horizon: 70 + 11 + 44 },
  { name: 'phone', width: 412, bandTop: 110, horizon: 110 + 11 + 90 },
  { name: 'tall', width: 430, bandTop: 120, horizon: 120 + 11 + 200 },
  { name: 'desktop', width: 960, bandTop: 50, horizon: 50 + 11 + 96 },
];

const TEXTS = {
  en: { path: "Sun's path", below: 'Sun below the horizon', horizon: 'Horizon', prayer: 'Maghrib' },
  es: { path: 'Trayectoria del sol', below: 'Sol bajo el horizonte', horizon: 'Horizonte', prayer: 'Maghrib' },
  zh: { path: '太阳轨迹', below: '太阳在地平线下', horizon: '地平线', prayer: '昏礼' },
  ar: { path: 'مسار الشمس', below: 'الشمس تحت الأفق', horizon: 'الأفق', prayer: 'المغرب' },
};

function geometry(s: (typeof SCREENS)[number]) {
  const roomTop = s.bandTop + 11;
  const room = s.horizon - roomTop;
  return {
    width: s.width,
    bandTop: s.bandTop,
    horizon: s.horizon,
    X: (p: TrackBase) => p.x * s.width,
    Y: (p: TrackBase) => (p.under ? s.horizon : roomTop + p.y * room),
  };
}

/** The chart at a local hour, with the next prayer three hours on. */
function chartAt(place: (typeof PLACES)[keyof typeof PLACES], date: string, hour: number): TrackFrame {
  const now = new Date(Date.parse(`${date}T00:00:00Z`) + (hour - place.tz) * 3600_000);
  const night = hour >= 20 || hour < 5;
  const passage = night ? 'night' : 'day';
  const maghrib = new Date(now.getTime() - 4 * 3600_000);
  const sunrise = new Date(now.getTime() + 6 * 3600_000);
  const w = trackWindow(passage, now, { maghrib, sunrise });
  return trackFrame({ ...w, now, nextAt: new Date(now.getTime() + 3 * 3600_000), latitude: place.latitude, longitude: place.longitude });
}

const overlap = (a: PlacedLabel, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the names stay clear, everywhere, all day', () => {
  for (const [placeName, place] of Object.entries(PLACES)) {
    it(placeName, () => {
      let charts = 0;
      let pathNamed = 0;
      for (const date of DATES) {
        for (let hour = 0; hour < 24; hour += 1.5) {
          const track = chartAt(place, date, hour);
          for (const screen of SCREENS) {
            const g = geometry(screen);
            for (const [lang, texts] of Object.entries(TEXTS)) {
              for (const scale of [1, 1.3]) {
                const placed = placeTrackLabels(track, g, texts, scale);
                const where = `${placeName} ${date} ${hour}h ${screen.name} ${lang} ×${scale}`;
                charts++;
                for (const l of placed) {
                  // Inside the band, above the line, off the edges.
                  expect([where, l.key, l.y >= g.bandTop]).toEqual([where, l.key, true]);
                  expect([where, l.key, l.y + l.h <= g.horizon]).toEqual([where, l.key, true]);
                  expect([where, l.key, l.x >= LABEL_INSET - 0.5]).toEqual([where, l.key, true]);
                  expect([where, l.key, l.x + l.w <= g.width - LABEL_INSET + 0.5]).toEqual([where, l.key, true]);
                  // Clear of the body and the ring.
                  if (track.body) {
                    const bx = g.X(track.body);
                    const by = g.Y(track.body);
                    expect([where, l.key, overlap(l, { x: bx - 10, y: by - 10, w: 20, h: 20 })]).toEqual([where, l.key, false]);
                  }
                  if (track.ring) {
                    const rx = g.X(track.ring);
                    const ry = g.Y(track.ring);
                    expect([where, l.key, overlap(l, { x: rx - 4, y: ry - 4, w: 8, h: 8 })]).toEqual([where, l.key, false]);
                  }
                }
                // Clear of each other.
                for (let i = 0; i < placed.length; i++) {
                  for (let j = i + 1; j < placed.length; j++) {
                    expect([where, placed[i].key, placed[j].key, overlap(placed[i], placed[j])]).toEqual([
                      where,
                      placed[i].key,
                      placed[j].key,
                      false,
                    ]);
                  }
                }
                if (placed.some(l => l.key === 'path')) pathNamed++;
                // The horizon is always named: the line is the whole width.
                expect([where, placed.some(l => l.key === 'horizon')]).toEqual([where, true]);
              }
            }
          }
        }
      }
      // The path is named nearly everywhere; it may give way only in the
      // shortest band with the longest words.
      expect(pathNamed / charts).toBeGreaterThan(0.9);
    });
  }
});

describe('what the first name says', () => {
  const g = geometry(SCREENS[1]);
  it('names the path when some of it is up', () => {
    const t = chartAt(PLACES.Stockholm, '2026-11-05', 13);
    const path = placeTrackLabels(t, g, TEXTS.en).find(l => l.key === 'path');
    expect(path?.text).toBe("Sun's path");
  });
  it('says the sun is below in the polar night, over its place on the line', () => {
    const t = chartAt(PLACES.Tromso, '2026-12-21', 12);
    expect(t.base.every(p => p.under)).toBe(true);
    const path = placeTrackLabels(t, g, TEXTS.en).find(l => l.key === 'path');
    expect(path?.text).toBe('Sun below the horizon');
    expect(path!.y + path!.h).toBeLessThanOrEqual(g.horizon);
    const bx = g.X(t.body!);
    expect(Math.abs(path!.x + path!.w / 2 - bx)).toBeLessThan(path!.w);
  });
  it('names the prayer at a ring on the arc top (Dhuhr) without covering the path', () => {
    // The ring at noon: the arc's top, where the path's name first goes.
    const place = PLACES.Stockholm;
    const now = new Date('2026-11-05T08:30:00Z');
    const w = trackWindow('day', now, null);
    const t = trackFrame({ ...w, now, nextAt: new Date('2026-11-05T10:38:00Z'), latitude: place.latitude, longitude: place.longitude });
    const placed = placeTrackLabels(t, g, { ...TEXTS.en, prayer: 'Dhuhr' });
    expect(placed.map(l => l.key).sort()).toEqual(['horizon', 'path', 'prayer']);
  });
});

describe('labelWidth', () => {
  it('grows with the words, the script and the text size, to a cap', () => {
    expect(labelWidth('Horizon')).toBeLessThan(labelWidth('Trayectoria del sol'));
    expect(labelWidth('地平线')).toBeGreaterThan(labelWidth('abc'));
    expect(labelWidth('Horizon', 1.3)).toBeGreaterThan(labelWidth('Horizon'));
    expect(labelWidth('Horizon', 3)).toBe(labelWidth('Horizon', 1.3));
  });
});

describe('with the depth under the line', () => {
  it('may name a ring under the line, and never sets a name across it', () => {
    const fajr = new Date('2026-11-06T03:57:00Z');
    const track = trackFrame({
      kind: 'sun',
      now: new Date('2026-11-05T21:00:00Z'),
      nextAt: fajr,
      latitude: 59.33,
      longitude: 18.07,
      from: new Date(fajr.getTime() - 24 * 3_600_000),
      to: fajr,
    });
    const width = 412;
    const bandTop = 110;
    const floor = 420;
    const roomTop = bandTop + 11;
    const horizon = roomTop + (floor - roomTop) * (track.top / (track.top + 20));
    const X = (p: { x: number }) => p.x * width;
    const Y = (p: { under: boolean; y: number; altitude: number }) =>
      p.under ? horizon + Math.min(1, -p.altitude / 20) * (floor - horizon) : roomTop + p.y * (horizon - roomTop);
    const placed = placeTrackLabels(
      track,
      { width, bandTop, horizon, bottom: floor, X, Y },
      { path: "Sun's path", below: 'Sun below the horizon', horizon: 'Horizon', prayer: 'Fajr' },
      1,
    );
    const prayer = placed.find(l => l.key === 'prayer');
    expect(prayer).toBeDefined();
    expect(prayer!.y).toBeGreaterThan(horizon);
    for (const l of placed) {
      const across = l.y < horizon + 2 && l.y + l.h > horizon - 2;
      expect([l.key, across]).toEqual([l.key, false]);
      expect(l.y + l.h).toBeLessThanOrEqual(floor - 2);
    }
  });
});
