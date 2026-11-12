import i18n from '../i18n';
import type { PrayerDataProviderId } from './types';

export type ProviderOption = {
  id: PrayerDataProviderId;
  /** English fallback name. */
  name: string;
  /** English fallback description. */
  description: string;
  /** i18next key for the localized name. */
  nameKey: string;
  /** i18next key for the localized description. */
  descriptionKey: string;
};

/** Widely used global APIs and on-device calculation (not tied to one country). */
export const MAINSTREAM_PRAYER_PROVIDERS: ProviderOption[] = [
  {
    id: 'aladhan',
    name: 'AlAdhan',
    description:
      'api.aladhan.com — large method list, coordinates worldwide; very widely used.',
    nameKey: 'providers.aladhan.name',
    descriptionKey: 'providers.aladhan.desc',
  },
  {
    id: 'namazvakti',
    name: 'Türkiye Takvimi (namazvakti.com)',
    description:
      'The cautious Turkish calendar — Fajr at 19°, Isha at 17°, a safety margin (temkin) on every time — as namazvakti.com publishes it for the nearest of its cities worldwide.',
    nameKey: 'providers.namazvakti.name',
    descriptionKey: 'providers.namazvakti.desc',
  },
  {
    id: 'diyanet',
    name: 'Diyanet',
    description:
      'The Turkish Presidency of Religious Affairs’ worldwide method (the 2021 Prayer Times Congress), calculated on your phone for your own location — matches Diyanet’s published tables to the minute.',
    nameKey: 'providers.diyanet.name',
    descriptionKey: 'providers.diyanet.desc',
  },
  {
    id: 'igmg',
    name: 'IGMG',
    description:
      'The prayer calendar of the Islamische Gemeinschaft Millî Görüş: Diyanet’s tables, as IGMG publishes them for its cities — calculated on your phone by Diyanet’s method for the nearest listed place.',
    nameKey: 'providers.igmg.name',
    descriptionKey: 'providers.igmg.desc',
  },
  {
    id: 'local_adhan',
    name: 'On-device (Adhan JS)',
    description:
      'Calculated on your phone with Batoul Adhan — no network prayer API.',
    nameKey: 'providers.local_adhan.name',
    descriptionKey: 'providers.local_adhan.desc',
  },
];

/**
 * Official or national-style tables where the app integrates a dedicated source.
 * Extend this list as more country-specific providers are added.
 */
export const REGIONAL_PRAYER_PROVIDERS: ProviderOption[] = [
  {
    id: 'islamiska_forbundet',
    name: 'Sweden',
    description:
      'Prayer times for listed Swedish cities; your location is matched to the nearest city in the list.',
    nameKey: 'providers.islamiska_forbundet.name',
    descriptionKey: 'providers.islamiska_forbundet.desc',
  },
  {
    id: 'habous',
    name: 'Morocco',
    description:
      'The Ministry of Habous and Islamic Affairs’ published times for listed Moroccan cities; your location is matched to the nearest city in the list.',
    nameKey: 'providers.habous.name',
    descriptionKey: 'providers.habous.desc',
  },
  {
    id: 'dumrt',
    name: 'Tatarstan',
    description:
      'The timetable of the Spiritual Administration of Muslims of Tatarstan, calculated on your device by its own method for the town or district seat nearest you in its list — it matches the published times to the minute. Fajr is the dawn (the end of sahur) and Dhuhr the sun’s zenith; its one Asr is the Hanafi one.',
    nameKey: 'providers.dumrt.name',
    descriptionKey: 'providers.dumrt.desc',
  },
  {
    id: 'cdum',
    name: 'Russia (Central Muftiate)',
    description:
      'The timetable of the Central Spiritual Administration of Muslims of Russia, calculated on your device by its own method for its city you are in — Moscow, Saint Petersburg and sixteen more — and matching the published times to the minute. Its one Asr is the Hanafi one.',
    nameKey: 'providers.cdum.name',
    descriptionKey: 'providers.cdum.desc',
  },
  {
    id: 'kmsh',
    name: 'Albania',
    description:
      'The Muslim Community of Albania’s calendar, calculated on your device by its own method for the town nearest you in its list — it matches the published times to the minute.',
    nameKey: 'providers.kmsh.name',
    descriptionKey: 'providers.kmsh.desc',
  },
  {
    id: 'grandmufti',
    name: 'Bulgaria',
    description:
      'The Grand Mufti’s Office of Bulgaria’s timetable, calculated on your device by its own method for the town nearest you in its list — it matches the published times to the minute.',
    nameKey: 'providers.grandmufti.name',
    descriptionKey: 'providers.grandmufti.desc',
  },
  {
    id: 'egypt',
    name: 'Egypt',
    description:
      'The timetable of the Egyptian General Authority of Survey, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute.',
    nameKey: 'providers.egypt.name',
    descriptionKey: 'providers.egypt.desc',
  },
  {
    id: 'kuwait',
    name: 'Kuwait',
    description:
      'The timetable of Kuwait’s Ministry of Awqaf and Islamic Affairs, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute.',
    nameKey: 'providers.kuwait.name',
    descriptionKey: 'providers.kuwait.desc',
  },
  {
    id: 'qatar',
    name: 'Qatar',
    description:
      'The timetable of the Qatar Calendar House, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute.',
    nameKey: 'providers.qatar.name',
    descriptionKey: 'providers.qatar.desc',
  },
  {
    id: 'jordan',
    name: 'Jordan',
    description:
      'The timetable of Jordan’s Ministry of Awqaf, Islamic Affairs and Holy Places, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute.',
    nameKey: 'providers.jordan.name',
    descriptionKey: 'providers.jordan.desc',
  },
  {
    id: 'kazakhstan',
    name: 'Kazakhstan',
    description:
      'The timetable of the Spiritual Administration of Muslims of Kazakhstan, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute. Its one Asr is the Hanafi one.',
    nameKey: 'providers.kazakhstan.name',
    descriptionKey: 'providers.kazakhstan.desc',
  },
  {
    id: 'brunei',
    name: 'Brunei',
    description:
      'The timetable of Brunei’s Ministry of Religious Affairs, calculated on your device by its own method for the place of its list that is yours — it matches the published times to the minute.',
    nameKey: 'providers.brunei.name',
    descriptionKey: 'providers.brunei.desc',
  },
  {
    id: 'banuri',
    name: 'Pakistan (Jamia Banuri Town)',
    description:
      'The prayer times of Jamia Uloom-ul-Islamia, Banuri Town (Karachi), calculated on your device by its own method: in a city of its list, that city’s times as its page gives them, to the minute; elsewhere in Pakistan, the same method for where you are. Dhuhr is a minute after the zenith (zawal) it prints.',
    nameKey: 'providers.banuri.name',
    descriptionKey: 'providers.banuri.desc',
  },
  {
    id: 'uae',
    name: 'United Arab Emirates',
    description:
      'The timetable of the General Authority of Islamic Affairs, Endowments and Zakat, calculated on your device by its own method for the zone you are in — it matches the published times to the minute.',
    nameKey: 'providers.uae.name',
    descriptionKey: 'providers.uae.desc',
  },
  {
    id: 'tehran',
    name: 'Iran (Institute of Geophysics, Tehran)',
    description:
      'The prayer times of the University of Tehran\'s Institute of Geophysics, calculated on your device by its own method — in the province capitals they match the Institute\'s published sheets to the minute. Asr and Isha, which the sheets do not print, are calculated by the same method.',
    nameKey: 'providers.tehran.name',
    descriptionKey: 'providers.tehran.desc',
  },
  {
    id: 'marw',
    name: 'Algeria',
    description:
      'The Ministry of Religious Affairs and Wakfs’ published times for listed Algerian cities; your location is matched to the nearest city in the list.',
    nameKey: 'providers.marw.name',
    descriptionKey: 'providers.marw.desc',
  },
  {
    id: 'muis',
    name: 'Singapore',
    description:
      'The Majlis Ugama Islam Singapura’s published timetable, as the government’s open-data portal carries it.',
    nameKey: 'providers.muis.name',
    descriptionKey: 'providers.muis.desc',
  },
  {
    id: 'london',
    name: 'London',
    description:
      'The London Unified Prayer Timetable, the one timetable the city’s main mosques agreed on, as londonprayertimes.com (the East London Mosque) publishes it. Within Greater London.',
    nameKey: 'providers.london.name',
    descriptionKey: 'providers.london.desc',
  },
  {
    id: 'bashkortostan',
    name: 'Bashkortostan',
    description:
      'The timetable of the Spiritual Administration of Muslims of Bashkortostan for the town or district seat nearest you in its list, as its own site (dumrb.com) gives it. Dhuhr is its fixed clock time, and its one Asr is the Hanafi one.',
    nameKey: 'providers.bashkortostan.name',
    descriptionKey: 'providers.bashkortostan.desc',
  },
  {
    id: 'dagestan',
    name: 'Dagestan',
    description:
      'The Muftiate of Dagestan’s timetable for the town or district seat nearest you in its list, as its own site (islamdag.ru) gives it. One Asr, the first.',
    nameKey: 'providers.dagestan.name',
    descriptionKey: 'providers.dagestan.desc',
  },
  {
    id: 'shuro',
    name: 'Tajikistan',
    description:
      'The Islamic Centre of Tajikistan’s timetable: its table for Dushanbe, and for the other towns it names the minutes before or after it. One Asr, the Hanafi one.',
    nameKey: 'providers.shuro.name',
    descriptionKey: 'providers.shuro.desc',
  },
  {
    id: 'kmdb',
    name: 'Kyrgyzstan',
    description:
      'The Spiritual Administration of Muslims of Kyrgyzstan’s timetable for the place nearest you in its list, as its own public service gives it. One Asr, the Hanafi one.',
    nameKey: 'providers.kmdb.name',
    descriptionKey: 'providers.kmdb.desc',
  },
  {
    id: 'jakim',
    name: 'Malaysia',
    description:
      'JAKIM’s e-Solat timetable for the zone you are in; your location is matched to the nearest town in its zone list.',
    nameKey: 'providers.jakim.name',
    descriptionKey: 'providers.jakim.desc',
  },
  {
    id: 'kemenag',
    name: 'Indonesia',
    description:
      'The Ministry of Religious Affairs’ (Kemenag) published timetable for your regency or city; your location is matched to the nearest in its list.',
    nameKey: 'providers.kemenag.name',
    descriptionKey: 'providers.kemenag.desc',
  },
];

/** Full list for lookups, settings copy, and labels (order: mainstream then regional). */
export const PRAYER_DATA_PROVIDERS: ProviderOption[] = [
  ...MAINSTREAM_PRAYER_PROVIDERS,
  ...REGIONAL_PRAYER_PROVIDERS,
];

/**
 * Resolve the localized name of a provider. Reads through i18next so the
 * label tracks the active app language; falls back to the English name
 * if no translation is registered.
 */
export function getProviderLabel(
  id: PrayerDataProviderId,
  /** See `getMethodLabel` — the share sheet has its own language. */
  translate: (key: string, opts: { defaultValue: string }) => string = (
    key,
    opts,
  ) => i18n.t(key, opts),
): string {
  const found = PRAYER_DATA_PROVIDERS.find(p => p.id === id);
  if (!found) return id;
  return translate(found.nameKey, { defaultValue: found.name });
}

/** Resolve the localized description of a provider. */
export function getProviderDescription(id: PrayerDataProviderId): string {
  const found = PRAYER_DATA_PROVIDERS.find(p => p.id === id);
  if (!found) return '';
  return i18n.t(found.descriptionKey, { defaultValue: found.description });
}
