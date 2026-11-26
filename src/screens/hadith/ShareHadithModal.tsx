/**
 * A hadith as a picture, for the system's share sheet — the hadith's
 * counterpart of the ayah card (`quran/mushaf/ShareAyahModal.tsx`), which
 * it follows: one dark card, drawn the same whatever the app's theme,
 * captured with react-native-view-shot.
 *
 * What a picture of a hadith must carry is what the text share carries
 * (`hadithShareText`): the Arabic, its meaning, WHO REPORTED IT AND HOW IT
 * IS GRADED in the source's own words — or, for al-Bukhari's and Muslim's
 * own rows, the reference it is cited by — and where the text is from. A
 * picture travels without the app around it; a hadith passed on with no
 * grade and no source is how weak ones spread.
 *
 * THE TEXT IS WHOLE OR THERE IS NO PICTURE (docs/hadith-policy.md §4:
 * texts are republished unmodified). A hadith too long for a card
 * (`fitsACard`) is not cut to fit one: the reader does not offer the
 * picture, and Share sends the text as before.
 */
// tokens-ok: an exported image, deterministic whatever the in-app theme
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { MODAL_ORIENTATIONS } from '../../components/modalOrientations';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { useBookPaneInset } from '../../native/FoldPosture';

/** The most a card holds, Arabic and meaning together, in characters: about a phone screen and a half of card. */
export const CARD_MAX_CHARS = 1200;

/** Whether a hadith can be shown whole on a card. */
export function fitsACard(item: { arabic: string; text: string | null }): boolean {
  const length = item.arabic.length + (item.text?.length ?? 0);
  return length > 0 && length <= CARD_MAX_CHARS;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  arabic: string;
  meaning: string | null;
  /** The meaning's language reads right to left (Urdu). */
  meaningRtl?: boolean;
  /** Under the text, in order: who reported it and its grade, its reference, its source. */
  lines: string[];
};

const CARD_BG = '#14231c';
const CARD_ORNAMENT = '#c9b47a';
const CARD_INK = '#f4efe2';

export function ShareHadithModal({ visible, onClose, arabic, meaning, meaningRtl, lines }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // On one page of a folded book, and clear of an iPhone's vertical bar: as the ayah card.
  const bookInset = useBookPaneInset(SPACING.xl);
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);

  const doShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await RNShare.open({ url: uri.startsWith('file://') ? uri : `file://${uri}`, type: 'image/png', failOnCancel: false });
    } catch (e) {
      console.warn('ShareHadithModal: share failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent supportedOrientations={MODAL_ORIENTATIONS} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, bookInset, { backgroundColor: palette.overlay }]}>
        {/* The card can be taller than the screen: it scrolls here, and is captured whole. */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View ref={cardRef} collapsable={false} style={styles.card} testID="hadith-share-card">
            {arabic ? <Text style={styles.arabic}>{arabic}</Text> : null}
            {meaning ? (
              <Text style={[styles.meaning, meaningRtl ? styles.rtl : null]}>{meaning}</Text>
            ) : null}
            <View style={styles.rule} />
            {lines.filter(Boolean).map((line, i) => (
              <Text key={i} style={i === 0 ? styles.cite : styles.source}>
                {line}
              </Text>
            ))}
            <Text style={styles.wordmark}>Mihrab</Text>
          </View>
        </ScrollView>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onClose}
            style={[styles.btn, { backgroundColor: palette.card }]}>
            <Text style={{ color: palette.text, fontWeight: '400' }}>{t('common.cancel', 'Cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.share', 'Share')}
            onPress={doShare}
            testID="hadith-share-card-send"
            style={[styles.btn, { backgroundColor: '#0a7c30' }]}>
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '500' }}>{t('common.share', 'Share')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.lg },
  scroll: { flexGrow: 0, width: '100%' },
  scrollContent: { alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    gap: SPACING.lg,
    alignItems: 'center',
  },
  arabic: {
    color: CARD_INK,
    ...arabicTextStyle('body'),
    fontSize: TYPE.title2.fontSize,
    lineHeight: 44,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  meaning: { color: 'rgba(244,239,226,0.82)', fontSize: TYPE.callout.fontSize, lineHeight: 22, textAlign: 'center' },
  rtl: { writingDirection: 'rtl' },
  rule: { width: 48, height: StyleSheet.hairlineWidth, backgroundColor: CARD_ORNAMENT, marginTop: SPACING.xs },
  cite: { color: CARD_ORNAMENT, fontSize: TYPE.footnote.fontSize, fontWeight: '500', textAlign: 'center' },
  source: { color: 'rgba(244,239,226,0.6)', fontSize: TYPE.caption.fontSize, textAlign: 'center' },
  wordmark: { color: 'rgba(244,239,226,0.4)', fontSize: TYPE.caption.fontSize },
  buttons: { flexDirection: 'row', gap: SPACING.md },
  btn: { minWidth: 110, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
});
