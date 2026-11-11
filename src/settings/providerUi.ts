import type { PrayerDataProviderId } from './types';

/**
 * Served by Diyanet's method on the phone: Diyanet itself, and IGMG, whose
 * prayer calendar is Diyanet's tables for its cities.
 */
export function isDiyanetSource(id: PrayerDataProviderId | null | undefined): boolean {
  return id === 'diyanet' || id === 'igmg';
}

/** Calculation-method picker does not apply (provider uses fixed rules/tables). */
export function providerHidesCalculationMethod(
  id: PrayerDataProviderId,
): boolean {
  return (
    id === 'islamiska_forbundet' ||
    id === 'habous' ||
    id === 'marw' ||
    id === 'muis' ||
    id === 'jakim' ||
    id === 'kemenag' ||
    // London's timetable is its own; the Hanafi toggle picks its second Asr.
    id === 'london' ||
    id === 'kmdb' ||
    // The calendar is its own method; the Hanafi Asr toggle still applies
    // (it picks the calendar's Asr-ı sânî).
    id === 'namazvakti' ||
    // Diyanet's method is fixed; its Asr-ı sânî is the Hanafi toggle.
    id === 'diyanet' ||
    // IGMG's calendar is Diyanet's tables: the same method, the same toggle.
    id === 'igmg'
  );
}

/**
 * Hanafi Asr toggle is hidden: the authority publishes a single schedule, with
 * one (Shafi'i) Asr, and the source serves it as printed — Settings says so
 * where the reader's school is Hanafi. Sweden's, Morocco's and Algeria's are
 * computed on the phone, but each reproduces a ministry's printed table, and
 * every path of those sources (the listed city, and the stand-in beyond it)
 * keeps the printed, standard Asr on purpose. Kemenag is not among them: its
 * times are the ministry's method computed on the phone, which takes the
 * Hanafi shadow as Diyanet's does. Nor London's: its timetable prints both
 * Asr times, and the toggle picks the second.
 */
export function providerHidesHanafiAsr(id: PrayerDataProviderId): boolean {
  return (
    id === 'islamiska_forbundet' ||
    id === 'habous' ||
    id === 'marw' ||
    id === 'muis' ||
    id === 'jakim' ||
    // Kyrgyzstan's prints one Asr too — the Hanafi one (`providerPrintsHanafiAsrOnly`).
    id === 'kmdb'
  );
}

/**
 * The one Asr the source prints is the Hanafi one (two shadow lengths):
 * Kyrgyzstan's. The screens then say "Hanafi Asr" whatever the reader's
 * school is set to, and Settings tells a reader of another school so.
 */
export function providerPrintsHanafiAsrOnly(id: PrayerDataProviderId | null | undefined): boolean {
  return id === 'kmdb';
}
