/**
 * The transliteration's one switch, with what it is and is not said under
 * it, and its download beside it (`transliteration.ts`).
 *
 * It lives at the top of "Under each verse" (CompanionTextControls), which
 * is reached from the surah reader, the Qur'an tab and Settings → Quran —
 * so the aid is switched on where the reader chooses what they read with —
 * and under the translation in the ayah sheet, which is the one place a
 * reader of the muṣḥaf meets any text beside the page.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IS_WEB_APP } from '../config/webApp';
import { useAppPalette } from '../hooks/useAppPalette';
import { SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import { useQuranDownloadRun } from './QuranDownloadStrip';
import { queueQuranDownload, riwayahLabel } from './quranDownloadManager';
import { setQuranPrefs, useQuranPrefs } from './quranState';
import { resolveRiwayah } from './riwayat';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { RADIUS } from '../theme/tokens';
import { QURAN_TRANSLITERATIONS, translationSizeLabel } from './translations';
import {
  TRANSLITERATION_SAMPLES,
  hasWholeTransliteration,
  resolveTransliteration,
  transliterationFits,
} from './transliteration';
import { solidColor } from '../theme/appPalette';

export function TransliterationSwitch({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  // Left as written, not compiled: while rendering this reads what React
  // cannot see change — resolveRiwayah() (pageCache); riwayahLabel() (i18n.t  [src/i18n/index.ts)
  // (tools/compiler-impure.js; babel.reactCompiler.js has why that matters).
  'use no memo';
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const prefs = useQuranPrefs();
  const on = prefs.transliteration === true;
  const riwayah = resolveRiwayah(prefs.riwayah);
  const fits = transliterationFits(riwayah);
  const { settings } = usePrayerSettings();
  // The spelling in use: the reader's choice, or their language's own.
  const edition = resolveTransliteration(prefs.transliterationStyle, settings.language);
  const dl = useQuranDownloadRun();
  const downloading =
    dl.running?.kind === 'translation' && dl.running.editionId === edition.id;
  const pct = dl.progress.total > 0 ? Math.round((dl.progress.done / dl.progress.total) * 100) : 0;
  /** On this device in full? Null while the disk is answering. */
  const [whole, setWhole] = useState<boolean | null>(null);
  useEffect(() => {
    if (!on || downloading) return;
    let cancelled = false;
    setWhole(null);
    void hasWholeTransliteration(edition).then(w => {
      if (!cancelled) setWhole(w);
    });
    return () => {
      cancelled = true;
    };
    // The run ending flips `downloading` back — look again.
  }, [on, downloading, edition]);

  const label = t('quran.transliteration', 'Transliteration');
  return (
    <View style={[styles.block, style]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <Switch
          accessibilityLabel={label}
          value={on}
          onValueChange={next => setQuranPrefs({ transliteration: next })}
          trackColor={{ true: palette.accentSolid, false: solidColor(palette, 'border') }}
          thumbColor="#ffffff" // tokens-ok-line: a Switch thumb stays light in both states so it reads against an accent track
        />
      </View>
      <Text style={[styles.sub, { color: palette.muted }]}>
        {t(
          'quran.transliterationSub',
          'The ayah in Latin letters, under the Arabic. A help while learning to read: it cannot show tajwīd, and the Qur’an is recited from the Arabic.',
        )}
      </Text>
      {on && !fits ? (
        <Text style={[styles.sub, { color: palette.muted }]}>
          {t('quran.transliterationHafsOnly', {
            defaultValue:
              'It spells the Ḥafṣ reading, so it is shown with Ḥafṣ only, not with {{riwayah}}.',
            riwayah: riwayahLabel(riwayah),
          })}
        </Text>
      ) : null}
      {on ? (
        // Which spelling. Each choice is named in its own language and shows
        // a word or two in itself, so it needs no translating to be chosen.
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('quran.transliterationStyle', 'Spelling')}
          style={styles.styles}>
          {QURAN_TRANSLITERATIONS.map(e => {
            const selected = e.id === edition.id;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${e.label}, ${TRANSLITERATION_SAMPLES[e.id] ?? ''}`}
                onPress={() => setQuranPrefs({ transliterationStyle: e.id })}
                style={[
                  styles.style,
                  { borderColor: selected ? palette.accentSolid : palette.border },
                  selected && { backgroundColor: palette.accentBg },
                ]}>
                <Text
                  style={[styles.styleName, { color: selected ? palette.accentSolid : palette.text }]}>
                  {e.label}
                </Text>
                <Text style={[styles.styleSample, { color: palette.muted }]}>
                  {TRANSLITERATION_SAMPLES[e.id] ?? ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {!on || IS_WEB_APP ? null : downloading ? (
        <Text style={[styles.sub, { color: palette.muted }]}>
          {t('quran.transliterationDownloading', {
            defaultValue: 'Downloading · {{pct}}%',
            pct,
          })}
        </Text>
      ) : whole === false ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => {
            queueQuranDownload({ kind: 'translation', editionId: edition.id });
          }}>
          <Text style={[styles.get, { color: palette.accentSolid }]}>
            {t('quran.transliterationGet', {
              defaultValue: 'Read online for now. Download for offline · {{size}}',
              size: translationSizeLabel(edition.approxBytes ?? 0),
            })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  label: { fontSize: TYPE.body.fontSize, flexShrink: 1 },
  sub: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.xs },
  styles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  style: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  styleName: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  // Latin letters in every app language: never laid out right to left.
  styleSample: { fontSize: TYPE.caption.fontSize, fontStyle: 'italic', writingDirection: 'ltr' },
  get: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.sm, fontWeight: '500' },
});
