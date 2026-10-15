/**
 * Türkiye's outline, coarse: within a few kilometres at its land borders
 * and threading the straits between the Turkish coast and the Greek islands
 * (Lesbos, Chios, Samos, Kos, Rhodes, Kastellorizo). Points are [lat, lon].
 */
const TURKEY: ReadonlyArray<readonly [number, number]> = [
  // Bulgaria and Greece
  [41.98, 28.02], [42.0, 27.5], [41.95, 27.0], [41.72, 26.36], [41.6, 26.6], [41.3, 26.6], [41.0, 26.35], [40.75, 26.05],
  // the Aegean, Gökçeada and Bozcaada in, the Greek islands out
  [40.25, 25.6], [39.75, 25.95], [39.5, 26.3], [39.35, 26.62], [39.0, 26.75], [38.75, 26.45], [38.35, 26.22], [38.1, 26.25],
  [37.95, 26.8], [37.72, 27.1], [37.5, 27.15], [37.2, 27.0], [36.97, 27.2], [36.95, 27.45], [36.75, 27.35], [36.65, 27.3],
  [36.65, 27.8], [36.55, 28.5], [36.25, 29.3], [36.18, 29.7],
  // the Mediterranean, Cyprus out
  [35.95, 30.5], [35.95, 32.8], [35.95, 34.0], [36.5, 35.6],
  // Syria
  [35.82, 35.92], [35.9, 36.15], [36.2, 36.4], [36.65, 36.55], [36.68, 36.95], [36.62, 37.2], [36.68, 37.6], [36.83, 38.0], [36.7, 38.9],
  [36.8, 39.5], [36.85, 40.1], [37.06, 41.22], [37.15, 42.0], [37.11, 42.36],
  // Iraq and Iran
  [37.25, 43.0], [37.33, 44.0], [37.15, 44.79], [37.6, 44.6], [38.3, 44.3], [38.9, 44.3], [39.65, 44.8],
  // Nakhchivan, Armenia, Georgia
  [39.8, 44.75], [39.98, 44.4], [40.1, 43.95], [40.05, 43.65], [40.6, 43.6], [41.1, 43.5], [41.25, 43.47], [41.5, 42.8], [41.52, 41.55],
  // the Black Sea
  [42.2, 35.2], [41.9, 31.0],
];

export function isCoordinateInTurkey(latitude: number, longitude: number): boolean {
  if (latitude < 35.8 || latitude > 42.3 || longitude < 25.5 || longitude > 44.9) return false;
  let hit = false;
  for (let i = 0, j = TURKEY.length - 1; i < TURKEY.length; j = i++) {
    const [ay, ax] = TURKEY[i];
    const [by, bx] = TURKEY[j];
    if (ay > latitude !== by > latitude && longitude < ((bx - ax) * (latitude - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}
