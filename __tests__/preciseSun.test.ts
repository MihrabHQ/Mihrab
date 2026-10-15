/**
 * The precise apparent Sun against JPL's DE421 (skyfield, apparent, of
 * date — tools/verify-methods/sun-jpl-grid.py), and against Meeus's short
 * series, which it replaces where a second matters.
 */
import { preciseApparentSun } from '../src/providers/preciseSun';
import { meeusApparentSun } from '../src/providers/moroccoMethod';

// D (days from 2000-01-01 12:00 UT), declination (°), equation of time (min), from DE421.
const JPL: [string, number, number, number][] = [
  ['2026-03-20 12:00 UT', 9575.0, -0.0454883434908054, -7.4364288221537045],
  ['2026-06-21 00:00 UT', 9667.5, 23.43752131340835, -1.7079926404766623],
  ['2026-11-03 12:00 UT', 9803.0, -15.150946137213822, 16.447035014610623],
  ['2027-02-11 06:00 UT', 9902.75, -14.086343915337608, -14.19625937251004],
];

describe('the precise sun', () => {
  it.each(JPL)('matches JPL at %s to 0.15 s and an arc-second', (_label, d, dec, eot) => {
    const s = preciseApparentSun(d);
    expect(Math.abs((s.dec * 180) / Math.PI - dec) * 3600).toBeLessThan(1);
    expect(Math.abs(s.eot - eot) * 60).toBeLessThan(0.15);
  });

  it('is where Meeus’s short series is a second off', () => {
    // Over 2026 the short series' equation of time strays from JPL's by
    // about a second — the drift that cost the Türkiye Takvimi one time in fifty.
    let worst = 0;
    for (let d = 9496.5; d < 9861.5; d += 1) worst = Math.max(worst, Math.abs(preciseApparentSun(d).eot - meeusApparentSun(d).eot) * 60);
    expect(worst).toBeGreaterThan(0.8);
    expect(worst).toBeLessThan(3);
  });
});
