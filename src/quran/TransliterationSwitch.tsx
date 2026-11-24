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
import { QURAN_TRANSLITERATION, translationSizeLabel } from './translations';
import {
  TRANSLITERATION_ID,
  hasWholeTransliteration,
  transliterationFits,
} from './transliteration';

export function TransliterationSwitch({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const prefs = useQuranPrefs();
  const on = prefs.transliteration === true;
  const riwayah = resolveRiwayah(prefs.riwayah);
  const fits = transliterationFits(riwayah);
  const dl = useQuranDownloadRun();
  const downloading =
    dl.running?.kind === 'translation' && dl.running.editionId === TRANSLITERATION_ID;
  const pct = dl.progress.total > 0 ? Math.round((dl.progress.done / dl.progress.total) * 100) : 0;
  /** On this device in full? Null while the disk is answering. */
  const [whole, setWhole] = useState<boolean | null>(null);
  useEffect(() => {
    if (!on || downloading) return;
    let cancelled = false;
    setWhole(null);
    void hasWholeTransliteration().then(w => {
      if (!cancelled) setWhole(w);
    });
    return () => {
      cancelled = true;
    };
    // The run ending flips `downloading` back — look again.
  }, [on, downloading]);

  const label = t('quran.transliteration', 'Transliteration');
  return (
    <View style={[styles.block, style]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <Switch
          accessibilityLabel={label}
          value={on}
          onValueChange={next => setQuranPrefs({ transliteration: next })}
          trackColor={{ true: palette.accentSolid, false: String(palette.border) }}
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
            queueQuranDownload({ kind: 'translation', editionId: TRANSLITERATION_ID });
          }}>
          <Text style={[styles.get, { color: palette.accentSolid }]}>
            {t('quran.transliterationGet', {
              defaultValue: 'Read online for now. Download for offline · {{size}}',
              size: translationSizeLabel(QURAN_TRANSLITERATION.approxBytes ?? 0),
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
  get: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.sm, fontWeight: '500' },
});
