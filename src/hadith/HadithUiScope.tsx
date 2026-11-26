/**
 * The Hadith tab in Arabic while the rest of the app is not.
 *
 * Settings → Hadith has its own language. Someone who reads hadith in
 * Arabic and keeps the app in English or Swedish had Arabic hadith under
 * English headings, buttons and grades — two languages on every page of
 * the one tab that is, for them, an Arabic book. With the hadith language
 * set to Arabic, every Hadith page is now Arabic and laid out right to
 * left, exactly as it is when the whole app is in Arabic; the tab bar and
 * the other tabs stay in the app's language.
 *
 * HOW, AND WHY NOT A `t` PASSED DOWN. Everything under these pages asks
 * `useTranslation()` — for its words, and (`useLayoutRtl`, `foreignText`)
 * for which way the page runs. So the pages are given an i18n of their
 * own, a clone fixed to Arabic that shares the app's resources, through
 * react-i18next's provider, and a `direction: 'rtl'` on their root, which
 * is how the app mirrors itself anyway (`layoutDirection.ts`). Nothing
 * under them needs to know.
 *
 * Arabic only. Another hadith language (English under a Swedish app) is
 * usually chosen because the reader's own has no hadith yet, not because
 * they want the tab to change language.
 */
import React, { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import baseI18n, { ensureLanguage } from '../i18n';
import { isRtlLanguage } from '../i18n/layoutDirection';
import { chosenHadithLanguage, subscribeHadithLanguage } from './hadithLang';

let arabic: I18n | null = null;
/** The app's i18n, fixed to Arabic. Made once, on first use. */
export function arabicI18n(): I18n {
  if (!arabic) {
    ensureLanguage('ar');
    arabic = baseI18n.cloneInstance({ lng: 'ar' });
    void arabic.changeLanguage('ar');
  }
  return arabic;
}

/** Whether the Hadith pages are in Arabic over an app in `appLanguage`. */
export function hadithUiIsArabic(chosen: string, appLanguage: string | null | undefined): boolean {
  return chosen === 'ar' && (appLanguage || 'en').split('-')[0] !== 'ar';
}

export function HadithUiScope({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const chosen = useSyncExternalStore(subscribeHadithLanguage, chosenHadithLanguage, chosenHadithLanguage);
  if (!hadithUiIsArabic(chosen, i18n.language)) return <>{children}</>;
  // Urdu is mirrored already: only the words change.
  const mirrored = isRtlLanguage(i18n.language);
  return (
    <I18nextProvider i18n={arabicI18n()}>
      <View style={mirrored ? styles.fill : styles.rtl}>{children}</View>
    </I18nextProvider>
  );
}

/** A Hadith screen, inside the scope. */
export function withHadithUi<P extends object>(Screen: React.ComponentType<P>, name: string): React.ComponentType<P> {
  const Scoped = (props: P) => (
    <HadithUiScope>
      <Screen {...props} />
    </HadithUiScope>
  );
  Scoped.displayName = name;
  return Scoped;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  rtl: { flex: 1, direction: 'rtl' },
});
