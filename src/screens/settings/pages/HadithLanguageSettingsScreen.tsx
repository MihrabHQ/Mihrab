// hover-ok: rows of a settings card — the pressed opacity is the
// affordance, as on every other row of these pages.
/**
 * Settings → Hadith → Hadith language.
 *
 * Hadith were read in the app's language and no other. HadeethEnc
 * translates into seventy-two languages and the app is written in
 * thirteen, so a reader of Hausa or Bosnian had the hadith in English.
 * Here they choose: "Same as the app" (the default, and what everyone had
 * before) or any language our copy of the packs holds.
 *
 * A language is listed when the manifest of our copy names its pack —
 * so a build that knows a language our copy does not carry yet does not
 * offer a download that cannot be had — or when its pack is already on
 * this device, or it is one of the app's own thirteen (which need no
 * manifest to be known). Each is named in its own words, as HadeethEnc
 * names it, with how many hadith it has translated so far.
 *
 * Choosing downloads nothing: the Hadith tab asks for the pack the first
 * time a list is opened in the language, as it does for the app's own.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppearanceSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { HADITH_LANGS, HADITH_LANGUAGES, WHOLE_PACK, hencPackKey, type HadithLanguage } from '../../../hadith/catalog';
import { HADITH_LANGUAGE_AUTO, knownHadithLanguage } from '../../../hadith/hadithLang';
import { fetchManifest, manifestEntry, usePackStatuses } from '../../../hadith/packs';
import type { Manifest } from '../../../hadith/packTypes';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';
import { SettingsGroup } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

/** The languages to offer: named by our copy's manifest, already here, or the app's own. */
export function offeredHadithLanguages(
  manifest: Manifest | null,
  here: (code: string) => boolean,
  all: readonly HadithLanguage[] = HADITH_LANGUAGES,
): HadithLanguage[] {
  return all.filter(
    l =>
      (HADITH_LANGS as readonly string[]).includes(l.code) ||
      here(l.code) ||
      manifestEntry(manifest, hencPackKey(WHOLE_PACK, l.code)) != null,
  );
}

export function HadithLanguageSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { slice: settings, update } = useAppearanceSettings();
  const statuses = usePackStatuses();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    let live = true;
    void fetchManifest().then(m => {
      if (live) setManifest(m);
    });
    return () => {
      live = false;
    };
  }, []);

  const chosen = knownHadithLanguage(settings.hadithLanguage);
  const offered = offeredHadithLanguages(manifest, code => statuses[hencPackKey(WHOLE_PACK, code)]?.state === 'ready');
  const rows: Array<{ code: string; title: string; count: number | null; rtl: boolean }> = [
    { code: HADITH_LANGUAGE_AUTO, title: t('hadith.language.auto'), count: null, rtl: false },
    ...offered.map(l => ({
      code: l.code,
      title: l.native,
      count: manifestEntry(manifest, hencPackKey(WHOLE_PACK, l.code))?.count ?? null,
      rtl: l.rtl === true,
    })),
  ];

  return (
    <SettingsPage>
      <SettingsGroup footer={t('hadith.language.note')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('hadith.language.title')}>
          {rows.map((row, i) => {
            const on = row.code === chosen;
            return (
              <Pressable
                key={row.code}
                accessibilityRole="radio"
                accessibilityLabel={row.title}
                accessibilityState={{ selected: on, checked: on }}
                onPress={() => update({ hadithLanguage: row.code })}
                testID={`settings-hadith-language-${row.code}`}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border ?? palette.muted },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.title, { color: on ? palette.accentSolid : palette.text }]}>{row.title}</Text>
                {row.count != null ? <Text style={[styles.count, { color: palette.muted }]}>{row.count}</Text> : null}
                {on ? <Text style={[styles.tick, { color: palette.accentSolid }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  // Every name against the row's leading edge, whichever way its own
  // script runs: left to themselves the Arabic-script names cross to the
  // far side and the list reads as two columns. `left` is the leading
  // edge on both platforms in both layouts (`i18n/foreignText.ts`).
  title: { flex: 1, fontSize: TYPE.body.fontSize, fontWeight: '400', textAlign: 'left' },
  count: { fontSize: TYPE.body.fontSize, fontVariant: ['tabular-nums'] },
  tick: { fontSize: TYPE.body.fontSize, fontWeight: '500' },
  pressed: { opacity: 0.6 },
});
