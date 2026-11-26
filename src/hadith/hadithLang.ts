/**
 * The language hadith are read in.
 *
 * It was the app's language and nothing else, which is right for the
 * thirteen languages the app is written in and leaves out everyone who
 * reads one of the fifty-nine others HadeethEnc translates into: an app
 * in English can now show its hadith in Hausa, Bosnian or Tamil.
 *
 * `'auto'` is the app's language, as before, and is the default: nothing
 * changes for anyone who never opens the setting. A chosen language is a
 * pack language (`HADITH_LANGUAGES`, catalog.ts); English still stands in
 * for an entry that language has no translation of (`packLangs`).
 *
 * The preference is a setting (`hadithLanguage`), mirrored here beside
 * `i18n` the way the clock format is (`utils/activeClock.ts`), because
 * the notifications that carry a hadith's heading are scheduled outside
 * React. `PrayerSettingsProvider` sets it.
 */
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

export const HADITH_LANGUAGE_AUTO = 'auto';

let chosen: string = HADITH_LANGUAGE_AUTO;
const listeners = new Set<() => void>();

/**
 * A stored value as a language code, or `auto`. By its shape only: this
 * module is read at launch and must not pull the hadith catalog in with
 * it, and a code no pack answers to reads as English (`packLangs`).
 */
export function knownHadithLanguage(value: unknown): string {
  return typeof value === 'string' && /^[a-z]{2,3}$/.test(value) ? value : HADITH_LANGUAGE_AUTO;
}

export function setHadithLanguage(value: unknown): void {
  const next = knownHadithLanguage(value);
  if (next === chosen) return;
  chosen = next;
  for (const l of listeners) l();
}

export function chosenHadithLanguage(): string {
  return chosen;
}

/** The language hadith are read in, given the app's. */
export function hadithLanguageFor(appLang: string | null | undefined): string {
  return chosen === HADITH_LANGUAGE_AUTO ? appLang || 'en' : chosen;
}

export const subscribeHadithLanguage = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The same, in React: follows the setting and the app's language. */
export function useHadithLanguage(): string {
  const { i18n } = useTranslation();
  const mine = useSyncExternalStore(subscribeHadithLanguage, chosenHadithLanguage, chosenHadithLanguage);
  return mine === HADITH_LANGUAGE_AUTO ? i18n.language || 'en' : mine;
}
