/**
 * Is this coordinate in Singapore?
 *
 * The country is small enough that its bounding box is nearly its outline:
 * the main island and the southern islets, from Tuas to Changi. Johor
 * Bahru starts a kilometre north of the Strait at 1.46°, so the box stops
 * at the Strait; Batam and Bintan lie south of 1.2°.
 */
const SG_MIN_LAT = 1.15;
const SG_MAX_LAT = 1.47;
const SG_MIN_LNG = 103.59;
const SG_MAX_LNG = 104.1;

export function isCoordinateInSingapore(latitude: number, longitude: number): boolean {
  return latitude >= SG_MIN_LAT && latitude <= SG_MAX_LAT && longitude >= SG_MIN_LNG && longitude <= SG_MAX_LNG;
}
