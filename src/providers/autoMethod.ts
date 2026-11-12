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
import { isCoordinateInKwaZuluNatal } from '../utils/kwazuluNatalRegion';
import { isCoordinateInMalaysia } from '../utils/malaysiaRegion';
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { isCoordinateInUsOrCanada } from '../utils/northAmericaRegion';
import { isCoordinateInSingapore } from '../utils/singaporeRegion';
import { isCoordinateInSouthAfrica } from '../utils/southAfricaRegion';
import { isCoordinateInSweden } from '../utils/swedenRegion';
import { isCoordinateInTurkey } from '../utils/turkeyRegion';
import { nationalMethodCountryAt } from '../utils/countryAt';
import { SWEDEN_METHOD_ID } from './swedenMethodId';

/** Muslim World League — the global default when nothing more specific applies. */
export const DEFAULT_AUTO_METHOD = 3;

type AutoMethodRegion = {
  method: number;
  covers: (latitude: number, longitude: number) => boolean;
  /** Automatic is this method even where Diyanet lists a place nearby (`regionalProviders.ts`). */
  aheadOfListedPlaces?: boolean;
};

/**
 * Regions where Automatic is one of AlAdhan's methods, but not the one its
 * own Automatic would pick there — so AlAdhan is asked for it by number
 * (`autoMethodToAsk`), and the phone computes the same offline.
 *
 * South Africa. AlAdhan's Automatic takes the method whose home is nearest,
 * which this far south is Umm al-Qura's (Fajr 18.5°, Isha ninety minutes
 * after sunset) — nobody's convention here, and not what the phone computed
 * offline. The country goes by the Muslim World League's 18° / 17° (3): the
 * Muslim Judicial Council's Cape Town timetable is that to the minute, and
 * the Jamiatul Ulama South Africa names it.
 *
 * KwaZulu-Natal is the exception, and first because the first match wins:
 * the Jamiatul Ulama KwaZulu-Natal, which publishes the province's
 * timetable, puts Isha at 18° — Karachi's angles (1), four to seven minutes
 * later through the year. Its Fajr is the same 18°. Its own margins (Zuhr
 * some minutes after the zenith, Maghrib a few after sunset) are not taken:
 * they differ between its printed tables and its website, and neither is
 * one formula.
 *
 * The United States and Canada: 15° / 15° (2), the convention of the
 * Islamic Society of North America that the Fiqh Council of North America
 * suggests for the United States and most mosques on the continent print.
 * (The Council's page suggests 13° for Canada; the country's timetables and
 * AlAdhan's own choice there are 15°, and that is what is taken.) Diyanet
 * lists a place near almost every town of both countries, and its table —
 * Fajr at 18°, Maghrib seven minutes after sunset — is not what their
 * mosques go by, so this comes ahead of it.
 */
const ASKED_BY_NUMBER: readonly AutoMethodRegion[] = [
  { method: 1, covers: isCoordinateInKwaZuluNatal, aheadOfListedPlaces: true },
  { method: 3, covers: isCoordinateInSouthAfrica },
  { method: 2, covers: isCoordinateInUsOrCanada, aheadOfListedPlaces: true },
];

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
  ...ASKED_BY_NUMBER,
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

/**
 * What to ask AlAdhan for when the reader's method is Automatic: its own
 * Automatic ('auto') nearly everywhere, a method by number where the app's
 * Automatic is not the one AlAdhan would choose (`ASKED_BY_NUMBER`).
 */
export function autoMethodToAsk(
  latitude: number,
  longitude: number,
): number | 'auto' {
  return (
    ASKED_BY_NUMBER.find(r => r.covers(latitude, longitude))?.method ?? 'auto'
  );
}

/** Is Automatic here a calculation method the app has settled on, ahead of a place Diyanet lists nearby? */
export function autoMethodAheadOfListedPlace(
  latitude: number,
  longitude: number,
): boolean {
  return ASKED_BY_NUMBER.some(
    r => r.aheadOfListedPlaces && r.covers(latitude, longitude),
  );
}
