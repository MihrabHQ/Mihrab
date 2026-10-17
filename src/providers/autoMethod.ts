/**
 * Which calculation method "Automatic" means, when the app has to answer
 * for itself.
 *
 * "Automatic" was always AlAdhan's job: omit `method` and its server picks
 * one from the coordinates. That left the on-device path with nothing to go
 * on, so it hardcoded MWL (3) — fine as a global default, wrong wherever a
 * country has its own parameters. It only ever showed up offline, which is
 * to say rarely, which is to say nobody reported it.
 *
 * It matters more now: the on-device computation is the rung underneath
 * every provider, the one that cannot fail (`prayerStorage.ts`), so it is
 * what a Moroccan user gets on a plane or past a published window. Answering
 * "MWL" there would be a visible minutes-level error against the table they
 * pray by.
 *
 * The table stays deliberately small: an entry belongs here only where a
 * country's own method is in `CALCULATION_METHODS` and the region predicate
 * already exists for provider routing. Everywhere else MWL remains the
 * honest answer.
 *
 * The countries with a method of their own (`nationalMethodCountryAt`) are
 * such a predicate: Automatic routes them to AlAdhan BECAUSE its Automatic
 * computes the country's method there, so offline the phone must too —
 * Mecca's Isha on MWL's 17° instead of Umm al-Qura's ninety minutes (two
 * hours in Ramadan) was the error this file exists to prevent.
 */
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { isCoordinateInIndonesia } from '../utils/indonesiaRegion';
import { isCoordinateInMalaysia } from '../utils/malaysiaRegion';
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { isCoordinateInSingapore } from '../utils/singaporeRegion';
import { isCoordinateInSweden } from '../utils/swedenRegion';
import { isCoordinateInTurkey } from '../utils/turkeyRegion';
import { nationalMethodCountryAt } from '../utils/countryAt';
import { SWEDEN_METHOD_ID } from './swedenMethodId';

/** Muslim World League — the global default when nothing more specific applies. */
export const DEFAULT_AUTO_METHOD = 3;

type AutoMethodRegion = {
  method: number;
  covers: (latitude: number, longitude: number) => boolean;
};

const AUTO_METHOD_REGIONS: readonly AutoMethodRegion[] = [
  // 19 = Algeria. FIRST, because Morocco's rectangle takes in a strip of
  // western Algeria (Tlemcen, Maghnia, Tindouf) and the first match wins;
  // `isCoordinateInAlgeria` is the narrower test and answers for them.
  { method: 19, covers: isCoordinateInAlgeria },
  // 21 = Morocco (Fajr 19°, Isha 17°, plus the ministry's own margins).
  { method: 21, covers: isCoordinateInMorocco },
  // 11 = Singapore (MUIS, 20° / 18°), 17 = Malaysia (JAKIM, the same angles).
  { method: 11, covers: isCoordinateInSingapore },
  { method: 17, covers: isCoordinateInMalaysia },
  // 20 = Indonesia (Kemenag, 20° / 18°).
  { method: 20, covers: isCoordinateInIndonesia },
  // 24 = Sweden (Islamiska Förbundet's own convention — the app's id, read
  // off its tables; AlAdhan has none, so it is computed on the device).
  { method: SWEDEN_METHOD_ID, covers: isCoordinateInSweden },
  // 13 = Türkiye (Diyanet's own method, computed on the device).
  { method: 13, covers: isCoordinateInTurkey },
];

/**
 * The method each country with one of its own computes, as listed under
 * Calculation method. Bahrain, Oman and Iraq are left on MWL: which of the
 * Gulf's, Qatar's, Dubai's, Kuwait's or Tehran's AlAdhan gives them is not
 * read off anything here, and a guess would be a second, quieter error.
 */
const NATIONAL_AUTO_METHOD: Readonly<Record<string, number>> = {
  SA: 4, // Umm al-Qura
  EG: 5, // Egyptian General Authority of Survey
  PK: 1, // University of Islamic Sciences, Karachi
  IN: 1,
  BD: 1,
  IR: 7, // Institute of Geophysics, University of Tehran
  KW: 9,
  QA: 10,
  AE: 16, // Dubai
  RU: 14,
  TN: 18,
  PT: 22,
  JO: 23,
};

/**
 * The method to compute with when the user has chosen "Automatic".
 *
 * Mirrors what AlAdhan would have auto-selected for these coordinates, for
 * the countries the app knows about; MWL otherwise.
 */
export function autoMethodForCoords(
  latitude: number,
  longitude: number,
): number {
  for (const region of AUTO_METHOD_REGIONS) {
    if (region.covers(latitude, longitude)) return region.method;
  }
  const national = nationalMethodCountryAt(latitude, longitude);
  return (national && NATIONAL_AUTO_METHOD[national]) || DEFAULT_AUTO_METHOD;
}
