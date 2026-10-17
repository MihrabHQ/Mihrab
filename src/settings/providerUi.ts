import type { PrayerDataProviderId } from './types';

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
    // The calendar is its own method; the Hanafi Asr toggle still applies
    // (it picks the calendar's Asr-ı sânî).
    id === 'namazvakti' ||
    // Diyanet's method is fixed; its Asr-ı sânî is the Hanafi toggle.
    id === 'diyanet'
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
 * Hanafi shadow as Diyanet's does.
 */
export function providerHidesHanafiAsr(id: PrayerDataProviderId): boolean {
  return (
    id === 'islamiska_forbundet' ||
    id === 'habous' ||
    id === 'marw' ||
    id === 'muis' ||
    id === 'jakim'
  );
}
