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

/** Hanafi Asr toggle is hidden (organization publishes a single schedule). */
export function providerHidesHanafiAsr(id: PrayerDataProviderId): boolean {
  // Both publish a single schedule; there is no madhab to choose within it.
  return id === 'islamiska_forbundet' || id === 'habous' || id === 'marw' || id === 'muis' || id === 'jakim' || id === 'kemenag';
}
