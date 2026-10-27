import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/**
 * ── ONE LANGUAGE IN MEMORY, NOT THIRTEEN ─────────────────────────────
 *
 * Every translation used to be imported at the top of this file, so all
 * thirteen were built into the JS heap at startup — a megabyte and a half
 * of JSON as objects, the Urdu and the Bengali and the Chinese included,
 * for a reader who will only ever see one of them. English stays (it is
 * every other language's fallback); the rest are loaded the moment one is
 * chosen. A `require` inside a function is not run until it is called:
 * the bundle still carries every language, but none of them is turned
 * into objects until it is wanted.
 */
const LOADERS: Readonly<Record<string, () => ResourceKey>> = {
  sv: () => require('./locales/sv.json'),
  ar: () => require('./locales/ar.json'),
  bn: () => require('./locales/bn.json'),
  ur: () => require('./locales/ur.json'),
  hi: () => require('./locales/hi.json'),
  fr: () => require('./locales/fr.json'),
  es: () => require('./locales/es.json'),
  de: () => require('./locales/de.json'),
  tr: () => require('./locales/tr.json'),
  id: () => require('./locales/id.json'),
  ru: () => require('./locales/ru.json'),
  zh: () => require('./locales/zh.json'),
};

/** Synchronous: `changeLanguage` has the language before it resolves. */
const lazyLanguages: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read: (language, _namespace, callback) => {
    const load = LOADERS[language];
    if (!load) {
      callback(null, {});
      return;
    }
    try {
      callback(null, load());
    } catch (e) {
      callback(e as Error, false);
    }
  },
};

/**
 * Make `language` available without switching to it — for a translator
 * fixed to another language than the app's (the shared month's sheet,
 * `getFixedT`). Harmless to call for one already loaded, or for English.
 */
export function ensureLanguage(language: string, instance: typeof i18n = i18n): void {
  if (instance.hasResourceBundle(language, 'translation')) return;
  const load = LOADERS[language];
  if (load) instance.addResourceBundle(language, 'translation', load(), true, true);
}

void i18n
  .use(lazyLanguages)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    // Only English is given here; the backend brings the rest.
    partialBundledLanguages: true,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

export default i18n;
