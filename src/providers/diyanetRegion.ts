/**
 * Where Diyanet's tables print Isha at 16° (the Congress's) rather than its
 * own 17°: read off Diyanet's published tables, a few places per country.
 *
 * 16°: Europe — but for Spain, Portugal, Greece, Bulgaria, Albania,
 * Montenegro, North Macedonia, Kosovo, Malta and Cyprus — with Russia,
 * Ukraine, Belarus, Kazakhstan, Mongolia and China; the United States,
 * Canada and Greenland. 17°: Türkiye and everywhere else.
 *
 * The outlines are coarse (tens of kilometres at the borders that matter:
 * the Pyrenees, the Danube, the Balkans, the Caucasus, Central Asia, the
 * US–Mexico line). Points are [lat, lon].
 */

type Poly = ReadonlyArray<readonly [number, number]>;

/** Europe's 16° countries with Russia, Ukraine, Belarus, Kazakhstan, Mongolia and China. */
const EURASIA: Poly = [
  [84, -12], [50.5, -12], [48, -6], [43.9, -4], [43.4, -1.8],
  // the Pyrenees
  [43.05, -1.45], [42.95, -0.75], [42.8, 0.0], [42.7, 0.7], [42.6, 1.4], [42.45, 1.75], [42.45, 2.1], [42.43, 3.17], [42.4, 3.3],
  // the western Mediterranean, Menorca and Tunisia out, Sardinia and Sicily in, Malta out
  [38.5, 7.5], [37.9, 9.0], [37.6, 11.4], [36.55, 15.3], [37.8, 16.5],
  // the Strait of Otranto and the Adriatic, Albania and Montenegro out
  [39.0, 17.5], [40.6, 19.0], [41.9, 19.0], [42.4, 18.52],
  // Bosnia | Montenegro, Serbia | Montenegro
  [42.55, 18.45], [42.7, 18.55], [42.95, 18.55], [43.15, 18.75], [43.3, 18.95], [43.5, 19.2], [43.4, 19.45], [43.3, 19.65], [43.1, 20.0], [42.95, 20.3],
  // Serbia | Kosovo
  [43.27, 20.79], [43.12, 21.08], [42.9, 21.43], [42.74, 21.78], [42.32, 21.6],
  // Serbia | North Macedonia, Serbia | Bulgaria
  [42.3, 21.9], [42.32, 22.36], [42.55, 22.45], [42.75, 22.5], [43.0, 22.98], [43.2, 22.85], [43.55, 22.5], [43.85, 22.45], [44.05, 22.6], [44.22, 22.67],
  // Romania | Bulgaria, along the Danube
  [43.75, 23.5], [43.7, 24.5], [43.65, 25.3], [43.875, 25.96], [44.0, 26.6], [44.135, 27.3], [43.85, 28.0], [43.74, 28.58],
  // the Black Sea, Türkiye out, Russia's coast and Crimea in
  [43.5, 30.0], [43.6, 37.0], [43.39, 40.0],
  // the Caucasus: Russia | Georgia, Azerbaijan
  [43.55, 40.7], [43.25, 41.8], [42.85, 43.4], [42.7, 44.5], [42.75, 45.2], [42.45, 45.8], [41.95, 46.5], [41.6, 47.0], [41.25, 47.85], [41.85, 48.58],
  // the Caspian; Kazakhstan | Turkmenistan, Uzbekistan
  [41.7, 52.5], [41.3, 56.0], [45.0, 56.0], [45.0, 58.6], [44.0, 61.0], [43.3, 64.5], [42.0, 66.0], [41.0, 68.0], [41.4, 69.1], [41.9, 70.0], [42.25, 70.95],
  // Kazakhstan | Kyrgyzstan
  [42.6, 71.3], [42.9, 73.6], [43.0, 74.4], [43.2, 75.0], [43.0, 76.0], [42.95, 77.0], [42.95, 78.5], [42.8, 80.2],
  // China | Kyrgyzstan, Tajikistan, Afghanistan, Pakistan, India
  [42.0, 80.0], [41.6, 78.4], [41.0, 77.0], [40.5, 75.5], [40.0, 74.0], [39.4, 73.6], [38.6, 74.9], [37.3, 74.9], [37.0, 74.5], [36.9, 75.5],
  [35.8, 77.0], [35.5, 77.8], [34.0, 78.7], [32.5, 79.4], [31.0, 79.0], [30.4, 81.2],
  // China | Nepal, Bhutan, India, Myanmar, Laos, Vietnam
  [30.0, 82.0], [29.3, 83.5], [28.8, 84.3], [28.3, 85.5], [28.0, 86.9], [27.9, 88.0], [28.0, 89.5], [28.0, 91.0], [27.8, 91.7], [28.9, 93.5],
  [29.2, 94.5], [29.3, 96.0], [28.3, 97.3], [27.0, 98.6], [25.8, 98.6], [24.0, 97.6], [23.0, 99.4], [22.0, 99.2], [21.5, 101.0], [22.0, 101.7],
  [22.8, 102.5], [22.5, 104.0], [23.3, 105.3], [22.9, 106.6], [21.6, 108.0],
  // the South China Sea, Hainan in, Taiwan out; Korea out
  [21.0, 108.3], [18.0, 108.5], [18.0, 111.2], [21.7, 114.5], [23.5, 117.5], [25.0, 119.3], [26.5, 120.6], [31.0, 123.0], [37.0, 123.5], [39.6, 124.0],
  [40.0, 124.4], [40.4, 124.9], [41.0, 125.8], [41.6, 126.8], [42.0, 128.2], [42.4, 129.8], [42.45, 130.6], [42.3, 130.75],
  // the Sea of Japan and the Kurils, Japan out
  [41.0, 132.0], [45.65, 140.5], [45.72, 142.0], [44.4, 145.4], [43.55, 145.7], [43.0, 147.0], [45.0, 155.0], [52.0, 165.0], [60.0, 180], [84, 180],
];

/** The United States (mainland and Alaska) and Canada. */
const NORTH_AMERICA: Poly = [
  // the Mexican border, Tijuana to Brownsville
  [32.53, -117.12], [32.72, -114.72], [31.33, -111.07], [31.33, -108.21], [31.78, -108.21], [31.78, -106.53], [31.0, -105.5], [29.6, -104.5],
  [29.0, -103.15], [29.8, -102.3], [29.75, -101.3], [28.7, -100.5], [27.5, -99.5], [26.4, -99.1], [26.05, -98.0], [25.885, -97.5], [25.95, -97.15], [25.9, -96.8],
  // the Gulf and Florida, Cuba and the Bahamas out
  [24.3, -82.0], [24.3, -80.2], [25.6, -79.8], [26.8, -79.6],
  // the Atlantic, Bermuda out, Greenland out
  [31.0, -76.0], [40.0, -60.0], [46.5, -50.0], [53.0, -53.0], [60.0, -60.0], [66.5, -58.0], [70.0, -61.0], [76.0, -74.0], [78.5, -74.0],
  [80.5, -68.5], [82.3, -62.0], [84, -62],
  // the Arctic, the Bering Strait, the Aleutians, the Pacific
  [84, -169], [66, -168.6], [60, -180], [51, -180], [50, -130], [40, -127], [33, -121], [32.4, -117.4],
];

/** Iceland, Greenland, Hawaii, and Chukotka east of 180°. */
const BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
  [62.5, 67.5, -25, -12.5],
  [59.5, 84, -73.5, -11],
  [18.5, 22.5, -160.6, -154.5],
  [64, 72, -180, -168.8],
];

function inside(lat: number, lon: number, poly: Poly): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ay, ax] = poly[i];
    const [by, bx] = poly[j];
    if (ay > lat !== by > lat && lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

/** Do Diyanet's tables for this spot print Isha at the Congress's 16°? */
export function diyanetUsesCongressIsha(latitude: number, longitude: number): boolean {
  if (BOXES.some(([a, b, c, d]) => latitude >= a && latitude <= b && longitude >= c && longitude <= d)) return true;
  return inside(latitude, longitude, EURASIA) || inside(latitude, longitude, NORTH_AMERICA);
}

