/**
 * A precise apparent Sun: the Earth's VSOP87 series (truncated), IAU 2006
 * precession, IAU 2000B nutation and light time, after Don Cross's
 * Astronomy Engine (MIT licence). It agrees with JPL DE421 to about 0.05 s
 * in the equation of time and 0.5″ in declination, where Meeus's short
 * series (`meeusApparentSun`) drifts by about a second over the year —
 * enough to move a published minute.
 */

const ASEC2RAD = 4.848136811095359935899141e-6;
const ASEC360 = 1296000;
const DEG = Math.PI / 180;
const C_AUDAY = 173.1446326846693;
const DAYS_PER_MILLENNIUM = 365250;

type Series = number[][];
/** Heliocentric ecliptic (J2000) longitude, latitude and radius of the Earth: [ampl, phase, freq] per power of t. */
const EARTH: Series[][] = [
  [
    [
      [1.75347045673, 0, 0], [0.03341656453, 4.66925680415, 6283.0758499914], [0.00034894275, 4.62610242189, 12566.1516999828],
      [0.00003417572, 2.82886579754, 3.523118349], [0.00003497056, 2.74411783405, 5753.3848848968], [0.00003135899, 3.62767041756, 77713.7714681205],
      [0.00002676218, 4.41808345438, 7860.4193924392], [0.00002342691, 6.13516214446, 3930.2096962196], [0.00001273165, 2.03709657878, 529.6909650946],
      [0.00001324294, 0.74246341673, 11506.7697697936], [0.00000901854, 2.04505446477, 26.2983197998], [0.00001199167, 1.10962946234, 1577.3435424478],
      [0.00000857223, 3.50849152283, 398.1490034082], [0.00000779786, 1.17882681962, 5223.6939198022], [0.0000099025, 5.23268072088, 5884.9268465832],
      [0.00000753141, 2.53339052847, 5507.5532386674], [0.00000505267, 4.58292599973, 18849.2275499742], [0.00000492392, 4.20505711826, 775.522611324],
      [0.00000356672, 2.91954114478, 0.0673103028], [0.00000284125, 1.89869240932, 796.2980068164], [0.00000242879, 0.34481445893, 5486.777843175],
      [0.00000317087, 5.84901948512, 11790.6290886588], [0.00000271112, 0.31486255375, 10977.078804699], [0.00000206217, 4.80646631478, 2544.3144198834],
      [0.00000205478, 1.86953770281, 5573.1428014331], [0.00000202318, 2.45767790232, 6069.7767545534], [0.00000126225, 1.08295459501, 20.7753954924],
      [0.00000155516, 0.83306084617, 213.299095438],
    ],
    [[6283.0758499914, 0, 0], [0.00206058863, 2.67823455808, 6283.0758499914], [0.00004303419, 2.63512233481, 12566.1516999828]],
    [[0.00008721859, 1.07253635559, 6283.0758499914]],
  ],
  [[], [[0.00227777722, 3.4137662053, 6283.0758499914], [0.00003805678, 3.37063423795, 12566.1516999828]]],
  [
    [
      [1.00013988784, 0, 0], [0.01670699632, 3.09846350258, 6283.0758499914], [0.00013956024, 3.05524609456, 12566.1516999828],
      [0.0000308372, 5.19846674381, 77713.7714681205], [0.00001628463, 1.17387558054, 5753.3848848968], [0.00001575572, 2.84685214877, 7860.4193924392],
      [0.00000924799, 5.45292236722, 11506.7697697936], [0.00000542439, 4.56409151453, 3930.2096962196], [0.0000047211, 3.66100022149, 5884.9268465832],
      [0.00000085831, 1.27079125277, 161000.6857376741], [0.00000057056, 2.01374292245, 83996.84731811189], [0.00000055736, 5.2415979917, 71430.69561812909],
      [0.00000174844, 3.01193636733, 18849.2275499742], [0.00000243181, 4.2734953079, 11790.6290886588],
    ],
    [[0.00103018607, 1.10748968172, 6283.0758499914], [0.00001721238, 1.06442300386, 12566.1516999828]],
    [[0.00004359385, 5.78455133808, 6283.0758499914]],
  ],
];

function vsop(formula: Series[], t: number, clamp: boolean): number {
  let tp = 1;
  let out = 0;
  for (const series of formula) {
    let sum = 0;
    for (const [a, p, f] of series) sum += a * Math.cos(p + t * f);
    let incr = tp * sum;
    if (clamp) incr %= 2 * Math.PI;
    out += incr;
    tp *= t;
  }
  return out;
}

/** Earth−J2000 equatorial position (AU) at `tt` days from J2000. */
function earthJ2000(tt: number): [number, number, number] {
  const t = tt / DAYS_PER_MILLENNIUM;
  const lon = vsop(EARTH[0], t, true);
  const lat = vsop(EARTH[1], t, false);
  const r = vsop(EARTH[2], t, false);
  const x = r * Math.cos(lat) * Math.cos(lon);
  const y = r * Math.cos(lat) * Math.sin(lon);
  const z = r * Math.sin(lat);
  return [
    x + 0.00000044036 * y - 0.000000190919 * z,
    -0.000000479966 * x + 0.917482137087 * y - 0.397776982902 * z,
    0.397776982902 * y + 0.917482137087 * z,
  ];
}

/** ΔT (s), Espenak & Meeus, for UT days from J2000 — held at its 2017 value onward (about 69 s, as observed), as JPL Horizons does. */
export function deltaT(ut: number): number {
  const y = 2000 + (Math.min(ut, 17 * 365.24217) - 14) / 365.24217;
  if (y >= 2005 && y < 2050) {
    const u = y - 2000;
    return 62.92 + 0.32217 * u + 0.005589 * u * u;
  }
  if (y >= 2050 && y < 2150) {
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - y);
  }
  if (y >= 1986 && y < 2005) {
    const u = y - 2000;
    return 63.86 + 0.3345 * u - 0.060374 * u ** 2 + 0.0017275 * u ** 3 + 0.000651814 * u ** 4 + 0.00002373599 * u ** 5;
  }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

function nutation(tt: number): { dpsi: number; deps: number } {
  const mod = (x: number) => (x % ASEC360) * ASEC2RAD;
  const t = tt / 36525;
  const elp = mod(1287104.79305 + t * 129596581.0481);
  const f = mod(335779.526232 + t * 1739527262.8478);
  const d = mod(1072260.70369 + t * 1602961601.209);
  const om = mod(450160.398036 - t * 6962890.5431);
  let dp = (-172064161.0 - 174666.0 * t) * Math.sin(om) + 33386.0 * Math.cos(om);
  let de = (92052331.0 + 9086.0 * t) * Math.cos(om) + 15377.0 * Math.sin(om);
  let a = 2 * (f - d + om);
  dp += (-13170906.0 - 1675.0 * t) * Math.sin(a) - 13696.0 * Math.cos(a);
  de += (5730336.0 - 3015.0 * t) * Math.cos(a) - 4587.0 * Math.sin(a);
  a = 2 * (f + om);
  dp += (-2276413.0 - 234.0 * t) * Math.sin(a) + 2796.0 * Math.cos(a);
  de += (978459.0 - 485.0 * t) * Math.cos(a) + 1374.0 * Math.sin(a);
  a = 2 * om;
  dp += (2074554.0 + 207.0 * t) * Math.sin(a) - 698.0 * Math.cos(a);
  de += (-897492.0 + 470.0 * t) * Math.cos(a) - 291.0 * Math.sin(a);
  dp += (1475877.0 - 3633.0 * t) * Math.sin(elp) + 11817.0 * Math.cos(elp);
  de += (73871.0 - 184.0 * t) * Math.cos(elp) - 1924.0 * Math.sin(elp);
  return { dpsi: -0.000135 + dp * 1e-7, deps: 0.000388 + de * 1e-7 };
}

function meanObliquity(tt: number): number {
  const t = tt / 36525;
  return ((((-0.0000000434 * t - 0.000000576) * t + 0.0020034) * t - 0.0001831) * t - 46.836769) * t + 84381.406;
}

type V3 = [number, number, number];

/** J2000 equatorial → mean equator and equinox of date (IAU 2006). */
function precess(v: V3, tt: number): V3 {
  const t = tt / 36525;
  const eps0 = 84381.406 * ASEC2RAD;
  const psia = (((((-0.0000000951 * t + 0.000132851) * t - 0.00114045) * t - 1.0790069) * t + 5038.481507) * t) * ASEC2RAD;
  const omegaa = (((((0.0000003337 * t - 0.000000467) * t - 0.00772503) * t + 0.0512623) * t - 0.025754) * t + 84381.406) * ASEC2RAD;
  const chia = (((((-0.000000056 * t + 0.000170663) * t - 0.00121197) * t - 2.3814292) * t + 10.556403) * t) * ASEC2RAD;
  const sa = Math.sin(eps0), ca = Math.cos(eps0);
  const sb = Math.sin(-psia), cb = Math.cos(-psia);
  const sc = Math.sin(-omegaa), cc = Math.cos(-omegaa);
  const sd = Math.sin(chia), cd = Math.cos(chia);
  const xx = cd * cb - sb * sd * cc;
  const yx = cd * sb * ca + sd * cc * cb * ca - sa * sd * sc;
  const zx = cd * sb * sa + sd * cc * cb * sa + ca * sd * sc;
  const xy = -sd * cb - sb * cd * cc;
  const yy = -sd * sb * ca + cd * cc * cb * ca - sa * cd * sc;
  const zy = -sd * sb * sa + cd * cc * cb * sa + ca * cd * sc;
  const xz = sb * sc;
  const yz = -sc * cb * ca - sa * cc;
  const zz = -sc * cb * sa + cc * ca;
  return [xx * v[0] + yx * v[1] + zx * v[2], xy * v[0] + yy * v[1] + zy * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
}

/** Mean → true equator and equinox of date. */
function nutate(v: V3, oblm: number, oblt: number, psi: number): V3 {
  const cobm = Math.cos(oblm), sobm = Math.sin(oblm);
  const cobt = Math.cos(oblt), sobt = Math.sin(oblt);
  const cpsi = Math.cos(psi), spsi = Math.sin(psi);
  const xx = cpsi;
  const yx = -spsi * cobm;
  const zx = -spsi * sobm;
  const xy = spsi * cobt;
  const yy = cpsi * cobm * cobt + sobm * sobt;
  const zy = cpsi * sobm * cobt - cobm * sobt;
  const xz = spsi * sobt;
  const yz = cpsi * cobm * sobt - sobm * cobt;
  const zz = cpsi * sobm * sobt + cobm * cobt;
  return [xx * v[0] + yx * v[1] + zx * v[2], xy * v[0] + yy * v[1] + zy * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
}

/**
 * The apparent Sun at `d` days from J2000.0 (UT): declination (rad) and
 * equation of time (minutes), such that the transit at longitude λ (east) is
 * 720 − 4λ − eot minutes UT. Same contract as `meeusApparentSun`.
 */
export function preciseApparentSun(d: number): { dec: number; eot: number } {
  const tt = d + deltaT(d) / 86400;
  const e = earthJ2000(tt - 1 / C_AUDAY);
  const nut = nutation(tt);
  const mobl = meanObliquity(tt);
  const oblm = (mobl / 3600) * DEG;
  const oblt = ((mobl + nut.deps) / 3600) * DEG;
  const v = nutate(precess([-e[0], -e[1], -e[2]], tt), oblm, oblt, nut.dpsi * ASEC2RAD);
  const ra = Math.atan2(v[1], v[0]) / DEG;
  const dec = Math.atan2(v[2], Math.hypot(v[0], v[1]));
  // Greenwich apparent sidereal time (degrees): Earth rotation angle + the precession and equation of the equinoxes.
  const t = tt / 36525;
  const era = 360 * (((0.779057273264 + 0.00273781191135448 * d + (d % 1)) % 1) + 1);
  const eqeq = nut.dpsi * Math.cos(oblm);
  const st = eqeq + 0.014506 + ((((-0.0000000368 * t - 0.000029956) * t - 0.00000044) * t + 1.3915817) * t + 4612.156534) * t;
  const gast = era + st / 3600;
  const tmin = (d - Math.floor(d + 0.5) + 0.5) * 1440; // minutes past 0h UT
  const eotDeg = ((((gast - ra - (tmin - 720) / 4 + 180) % 360) + 360) % 360) - 180;
  return { dec, eot: 4 * eotDeg };
}
