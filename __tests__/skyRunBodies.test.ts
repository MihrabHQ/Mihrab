/**
 * The launch run's sun and moon keep to their own tracks.
 *
 * A cold start between Maghrib and Isha runs the sky from Maghrib (the sun
 * at the horizon) to now (the moon up). The bodies shared one track, so the
 * sun was carried up to the moon's place after sunset, and the one halo —
 * in the sun's light — was left glowing there (2.38, a screen recording).
 */
import { runHaloValues, runSunTrack } from '../src/screens/home/HeroSky';
import type { SkyFrame } from '../src/screens/home/skyModel';

type Body = SkyFrame['body'];
const sun = (x: number, y: number, halo = 0.5): Body => ({ kind: 'sun', x, y, below: 0, alpha: 1, light: '#FFAA55', halo }) as Body;
const moon = (x: number, y: number, halo = 0.1): Body => ({ kind: 'moon', x, y, alpha: 1, light: '#F2E3C6', halo, illuminated: 0.4, tilt: 0 }) as Body;
const none = { kind: 'none' } as Body;
const place = (b: { x: number; y: number }) => ({ x: b.x * 400, y: b.y * 800 });
const UNDER = 260;

describe('the run across Maghrib', () => {
  const bodies = [sun(0.74, 0.3), moon(0.4, 0.12), moon(0.4, 0.12)];

  it('takes the sun down under the horizon where it set, never to the moon', () => {
    const track = runSunTrack(bodies, place, UNDER)!;
    expect(track[0]).toEqual({ x: 296, y: 240 });
    expect(track[1]).toEqual({ x: 296, y: UNDER });
    expect(track[2]).toEqual({ x: 296, y: UNDER });
    // Never above where it started, and never moved sideways toward the moon.
    for (const p of track) {
      expect(p.y).toBeGreaterThanOrEqual(240);
      expect(p.x).toBe(296);
    }
  });

  it("gives each body its own halo, the sun's gone once it has set", () => {
    const reach = (h: number) => h;
    const s = runHaloValues(bodies, 'sun', reach)!;
    const m = runHaloValues(bodies, 'moon', reach)!;
    expect(s.light).toBe('#FFAA55');
    expect(s.opacity).toEqual([0.5, 0, 0]);
    expect(m.light).toBe('#F2E3C6');
    expect(m.opacity).toEqual([0, 0.1, 0.1]);
  });
});

describe('the run across sunrise', () => {
  it('brings the sun up out of the horizon at its own place', () => {
    const track = runSunTrack([moon(0.3, 0.1), none, sun(0.2, 0.3), sun(0.3, 0.2)], place, UNDER)!;
    expect(track[0]).toEqual({ x: 80, y: UNDER });
    expect(track[1]).toEqual({ x: 80, y: UNDER });
    expect(track[2]).toEqual({ x: 80, y: 240 });
    expect(track[3]).toEqual({ x: 120, y: 160 });
  });
});

describe('a run with one body', () => {
  it('has no sun track at night, and no halo for a body that is not there', () => {
    expect(runSunTrack([moon(0.3, 0.1), moon(0.35, 0.1)], place, UNDER)).toBeNull();
    expect(runHaloValues([moon(0.3, 0.1)], 'sun', h => h)).toBeNull();
  });
  it('leaves a day run as it was', () => {
    expect(runSunTrack([sun(0.3, 0.2), sun(0.5, 0.1)], place, UNDER)).toEqual([{ x: 120, y: 160 }, { x: 200, y: 80 }]);
  });
});

// ── The Track look's run ───────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { runSunLight } from '../src/screens/home/HeroTrack';
import { SUN_SURFACE, tintedBy } from '../src/screens/home/skyLight';
import type { TrackFrame } from '../src/screens/home/trackModel';

const trackAt = (altitude: number, under = altitude < 0) =>
  ({ body: { x: 0.5, y: 0.5, altitude, under, azimuth: 200, at: 0 } }) as unknown as TrackFrame;

describe("the Track look's run", () => {
  it("lights the riding sun by its height where it is up, from the run's start", () => {
    expect(runSunLight([trackAt(12), trackAt(-4)])).toBe(tintedBy(SUN_SURFACE, 12));
    expect(runSunLight([null, trackAt(-3), trackAt(30)])).toBe(tintedBy(SUN_SURFACE, 30));
    expect(runSunLight([trackAt(-6), null])).toBe(tintedBy(SUN_SURFACE, 0));
  });

  const src = fs.readFileSync(path.join(__dirname, '../src/screens/home/HeroTrack.tsx'), 'utf8');
  const view = src.slice(src.indexOf('const bodyView ='), src.indexOf('const svg ='));

  it('rides the sun along the chart, never the moon the sky ends on', () => {
    expect(view).toMatch(/backgroundColor: ride\.light/);
    expect(view).not.toMatch(/<Moon\b/);
    expect(view).not.toMatch(/body\.kind/);
  });

  it('carries the moon through the run on its own places, not held back to the end and not on the sun’s arc', () => {
    const end = src.slice(src.indexOf('// The run: the chart'), src.indexOf('{bodyView}'));
    // It rides: from where the launch picture has it to where it is now.
    expect(end).toMatch(/ride\.moon && body\.kind === 'moon'/);
    expect(end).toMatch(/translateX: ride\.moon\.tx \}, \{ translateY: ride\.moon\.ty/);
    // Its places are the chart's moon at each keyframe (2.38: never the sun's).
    expect(src).toMatch(/run\.tracks\.map\(t => \(t && t\.moon \?/);
    // And it is no longer drawn a second time with the end's marks.
    expect(end).not.toMatch(/cx=\{track\.moon\.x \* width\}/);
  });
});
