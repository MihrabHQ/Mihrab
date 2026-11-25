/**
 * What a Hadith list shows in place of its rows while the packs it reads
 * are not on the device: what it needs, what that weighs, and the button
 * that fetches it — or how far along the fetch is, or that it failed.
 *
 * Nothing downloads without this tap. The size comes from our manifest;
 * offline it is left out rather than guessed.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { PackSummary } from '../../hadith/useHadith';
import { cancelPack, ensurePacks, fetchManifest, manifestBytes } from '../../hadith/packs';
import type { Manifest } from '../../hadith/packTypes';
import { inlineSize, ProgressTrack, TextAction } from '../../quran/downloadsUi';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

export function useManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => {
    let live = true;
    fetchManifest().then(x => {
      if (live) setM(x);
    });
    return () => {
      live = false;
    };
  }, []);
  return m;
}

export function packsBytes(m: Manifest | null, packs: PackSummary): number | null {
  let sum = 0;
  for (const k of packs.missing) {
    const b = manifestBytes(m, k);
    if (b == null) return null;
    sum += b;
  }
  return sum;
}

export function PackGate({ packs, body }: { packs: PackSummary; body?: string }) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const manifest = useManifest();
  const bytes = packsBytes(manifest, packs);
  // "1.0 MB" kept whole in an Arabic sentence: it read "MB 1.0 · تنزيل".
  const rtl = i18n.dir() === 'rtl';

  if (packs.downloading) {
    return (
      <View style={styles.box}>
        <Text style={[styles.body, { color: palette.text }]}>{t('hadith.downloading')}</Text>
        <ProgressTrack progress={packs.progress} />
        <View style={styles.actions}>
          <TextAction
            label={t('common.cancel')}
            color={palette.muted}
            onPress={() => packs.missing.forEach(cancelPack)}
          />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={[styles.body, { color: palette.text }]}>{body ?? t('hadith.needsDownload')}</Text>
      {packs.failed ? (
        <Text style={[styles.note, { color: palette.danger }]}>{t('hadith.downloadFailed')}</Text>
      ) : null}
      <Button
        label={
          bytes != null
            ? t('hadith.downloadSize', { size: inlineSize(bytes, rtl) })
            : t('hadith.download')
        }
        onPress={() => void ensurePacks(packs.missing)}
      />
      <Text style={[styles.note, { color: palette.muted }]}>{t('hadith.downloadSourceNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: SPACING.lg, gap: SPACING.md },
  body: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
