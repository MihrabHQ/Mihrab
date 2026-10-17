/**
 * The calculation methods this build knows, without their translated
 * names — so a reader of the id alone (settings/storage.ts, which runs in
 * the widget's and notifications' headless tasks too) does not pull every
 * locale in with i18n. The names are read through `methods.ts`.
 */
export type CalculationMethodOption = {
  id: number | 'auto';
  /** English fallback name (used when no translation key resolves). */
  name: string;
  /** i18next key path under `methods.<id>` — translated name. */
  nameKey: string;
};

export const CALCULATION_METHODS: CalculationMethodOption[] = [
  { id: 'auto', name: 'Automatic (by location)', nameKey: 'methods.auto' },
  { id: 0, name: 'Shia — Ithna Ashari', nameKey: 'methods.0' },
  {
    id: 1,
    name: 'University of Islamic Sciences, Karachi',
    nameKey: 'methods.1',
  },
  {
    id: 2,
    name: 'Islamic Society of North America (ISNA)',
    nameKey: 'methods.2',
  },
  { id: 3, name: 'Muslim World League', nameKey: 'methods.3' },
  { id: 4, name: 'Umm Al-Qura University, Makkah', nameKey: 'methods.4' },
  { id: 5, name: 'Egyptian General Authority of Survey', nameKey: 'methods.5' },
  {
    id: 7,
    name: 'Institute of Geophysics, University of Tehran',
    nameKey: 'methods.7',
  },
  { id: 8, name: 'Gulf Region', nameKey: 'methods.8' },
  { id: 9, name: 'Kuwait', nameKey: 'methods.9' },
  { id: 10, name: 'Qatar', nameKey: 'methods.10' },
  { id: 11, name: 'Singapore', nameKey: 'methods.11' },
  { id: 12, name: 'France', nameKey: 'methods.12' },
  // Diyanet's method, computed on the phone as its tables are (`diyanetMethod.ts`).
  { id: 13, name: 'Turkey (Diyanet)', nameKey: 'methods.13' },
  { id: 14, name: 'Russia', nameKey: 'methods.14' },
  { id: 15, name: 'Moonsighting Committee Worldwide', nameKey: 'methods.15' },
  // AlAdhan already auto-selects this for Moroccan coordinates, so the
  // gap was only ever visible to someone who had picked a method by
  // hand — there was no right one to pick — or who was offline. Issue #10.
  { id: 21, name: 'Morocco', nameKey: 'methods.21' },
  // The Ministry of Religious Affairs and Wakfs: 18° / 17° with Maghrib held
  // three minutes past sunset, and — for the published Hijri year — the
  // Ministry's own table at the nearest listed place. AlAdhan has an id 19
  // "Algeria" too, but without the Maghrib margin, so the app computes this
  // one itself. Issue #70.
  { id: 19, name: 'Algeria', nameKey: 'methods.19' },
  // The rest of AlAdhan's national conventions, so that nobody is left
  // picking a neighbour's. Each is computed on the phone too.
  { id: 16, name: 'Dubai', nameKey: 'methods.16' },
  { id: 17, name: 'Malaysia (JAKIM)', nameKey: 'methods.17' },
  { id: 20, name: 'Indonesia (Kemenag)', nameKey: 'methods.20' },
  { id: 18, name: 'Tunisia', nameKey: 'methods.18' },
  { id: 22, name: 'Portugal', nameKey: 'methods.22' },
  { id: 23, name: 'Jordan', nameKey: 'methods.23' },
  // The Congress method Diyanet computes Islamiska Förbundet's tables by (congressMethod.ts); no AlAdhan id.
  { id: 24, name: 'Sweden (Islamiska Förbundet)', nameKey: 'methods.24' },
  // The user's own angles, set in Settings under the method — AlAdhan's 99.
  { id: 99, name: 'Custom angles', nameKey: 'methods.99' },
];
