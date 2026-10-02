/**
 * Starting a khatmah — its own page.
 *
 * Reached from the "Start a khatmah" button on the Qur'an tab, which is
 * there only while no plan runs; once one does, the tab draws the plan's
 * card (`KhatmahCard`) and this page is not offered. It says what a
 * khatmah is, then the ways to start one: a length, a date to finish
 * by, or a length of your own — from the opening, or from the page you
 * are already on. Starting one goes back to the tab, where the plan now
 * is.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useAppPalette } from '../../hooks/useAppPalette';
import { KhatmahPacingSheet, type PacingKind } from '../../quran/KhatmahPacingSheet';
import { MUSHAF_TOTAL_PAGES } from '../../quran/mushafImages';
import { totalPagesForRiwayah } from '../../quran/pages';
import { useQuranState } from '../../quran/quranState';
import { activeKhatmah } from '../../quran/khatmahProgress';
import { startKhatmah } from '../../quran/khatmahActions';
import type { RootStackParamList } from '../../navigation/types';
import { useBreakpoint } from '../../responsive/breakpoints';
import { useTabBarInset } from '../../navigation/tabBarInset';
import { cardEdgeStyle } from '../../theme/chrome';
import { TYPE } from '../../theme/typography';
import { RADIUS, SPACING } from '../../theme/tokens';

export function KhatmahScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const keyboardInset = useKeyboardInset();
  const quran = useQuranState();
  const wide = useBreakpoint() !== 'compact';
  const tabBarInset = useTabBarInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Custom khatmah length (v2.7.31) — the 30/60/90 presets plus a
  // free-form day count entered in a small modal.
  const [customDaysVisible, setCustomDaysVisible] = useState(false);
  /**
   * The pacing sheet, opened on a date: `kind` is only where it OPENS —
   * the segment inside it switches freely, so a reader who tapped "By a
   * date…" can still come out having chosen a length, and the chips are
   * the same choice made without opening anything.
   */
  const [pacingSheet, setPacingSheet] = useState<{ kind: PacingKind } | null>(null);
  const [customDaysText, setCustomDaysText] = useState('');
  // Blank means "from the opening", which is what most khatmahs are.
  const [customFromText, setCustomFromText] = useState('');

  // The plan now exists — the tab is where it is drawn. Also covers a
  // plan arriving by sync while this page is open.
  const plan = activeKhatmah(quran);
  useEffect(() => {
    if (!plan) return;
    // Opened from a link with nothing under it (a cold start), there is no
    // back to go to, and "Start a khatmah" would sit over a running plan:
    // the Qur'an tab, where the plan's card is, takes its place.
    if (navigation.canGoBack()) navigation.goBack();
    // (StackActions: the stack's types give Home no params, but the tab
    // navigator inside it takes `screen` like any nested navigator.)
    else navigation.dispatch(StackActions.replace('Home', { screen: 'QuranTab' }));
  }, [plan, navigation]);

  /**
   * Start the plan the sheet describes.
   *
   * A blank or unusable page means "from the opening" rather than an
   * error: the field is an addition to the sheet, not a hurdle in front
   * of it, and a khatmah nobody could start because they typed the wrong
   * thing in an optional box is worse than one that starts at page one.
   */
  const startCustomKhatmah = useCallback(() => {
    const n = Number(customDaysText);
    if (!Number.isFinite(n) || n < 1) return;
    const total = totalPagesForRiwayah(quran.prefs.riwayah);
    const raw = Number(customFromText);
    const from =
      customFromText.trim() !== '' && Number.isFinite(raw) && raw >= 2
        ? { page: Math.min(total, Math.round(raw)), riwayah: quran.prefs.riwayah }
        : undefined;
    // A khatmah can't be shorter than a day per page-set beyond the
    // mushaf itself — clamp to 1..604 days.
    startKhatmah(Math.min(604, Math.round(n)), from);
    setCustomDaysVisible(false);
  }, [customDaysText, customFromText, quran.prefs.riwayah]);

  return (
    <>
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      // iOS: the header is transparent (blur), so the scroll view starts
      // under it; "automatic" insets the content below the bar, as every
      // other pushed page does. Without it the intro sat under the title
      // and the back chevron.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarInset + SPACING.xl },
        wide ? styles.contentWide : null,
      ]}>
      <Text style={[styles.intro, { color: palette.text }]}>
        {t('quran.khatmahIntro', {
          defaultValue:
            'A khatmah is a reading of the whole muṣḥaf, cut into a portion a day. The app keeps your place, counts the pages, and says each day what is left.',
        })}
      </Text>
      <View
        style={[
          styles.khatmahCard,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
          <>
            <Text style={[styles.khatmahTitle, { color: palette.text }]}>
              {t('quran.startKhatmah', 'Start a khatmah')}
            </Text>
            <View style={styles.khatmahChips}>
              {[30, 60, 90].map(days => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityLabel={t('quran.khatmahDays', {
                    defaultValue: '{{count}} days',
                    count: days,
                  })}
                  onPress={() => startKhatmah(days)}
                  style={[styles.chip, { borderColor: palette.border }]}>
                  <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                    {t('quran.khatmahDays', {
                      defaultValue: '{{count}} days',
                      count: days,
                    })}
                  </Text>
                </Pressable>
              ))}
              {/* The other way to say how long: a date rather than a
                  number of days, re-pacing itself as days are missed
                  (issue #53). Beside the durations, not instead of them. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahByDateTitle', 'Finish by a date')}
                onPress={() => setPacingSheet({ kind: 'date' })}
                style={[styles.chip, { borderColor: palette.border }]}>
                <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                  {t('quran.khatmahByDateChip', 'By a date…')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahCustom', 'Custom…')}
                onPress={() => {
                  setCustomDaysText('');
                  setCustomFromText('');
                  setCustomDaysVisible(true);
                }}
                style={[styles.chip, { borderColor: palette.border }]}>
                <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                  {t('quran.khatmahCustom', 'Custom…')}
                </Text>
              </Pressable>
            </View>
          </>
      </View>
      <Text style={[styles.help, { color: palette.muted }]}>
        {t('quran.khatmahPacingHelp', {
          defaultValue:
            'A khatmah is paced either by a length — the portions wait for you — or by a date, which re-cuts what is left over the days that remain. You can move between the two at any point; nothing you have read is affected.',
        })}
      </Text>
    </ScrollView>

      {/* MOUNTED ONLY WHILE IT IS OPEN: the sheet seeds its date in
          `useState`, which runs when it mounts. */}
      {pacingSheet ? (
      <KhatmahPacingSheet
        visible
        mode="start"
        initialKind={pacingSheet.kind}
        current={null}
        unreadPages={MUSHAF_TOTAL_PAGES}
        onClose={() => setPacingSheet(null)}
        onChoose={choice => {
          setPacingSheet(null);
          if (choice.kind === 'days') {
            startKhatmah(choice.days);
            return;
          }
          const by = choice.deadline;
          /**
           * A plan made from a date still carries a LENGTH, and it is
           * the length that date implies rather than a default thirty:
           * it is what the outgrown-pace line is measured against, and
           * what the plan falls back to if the date is ever taken off
           * by an older build.
           */
          const span = Math.max(
            1,
            Math.min(604, Math.round((Date.parse(`${by}T12:00:00`) - Date.now()) / 86_400_000) + 1),
          );
          startKhatmah(span, undefined, by);
        }}
      />
      ) : null}

      <Modal
        visible={customDaysVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomDaysVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setCustomDaysVisible(false)}
        />
        <View
          style={[
            styles.menuCard,
            { backgroundColor: palette.card },
            // Top-anchored, so padding cannot lift it. Re-anchoring to
            // `bottom` puts the card just above the keyboard rather than
            // leaving an autoFocus field underneath it — a Modal on
            // Android does not resize. See useKeyboardInset.
            keyboardInset > 0
              ? { bottom: keyboardInset + SPACING.xl }
              : styles.menuCardResting,
          ]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {t('quran.khatmahSetUpTitle', 'Start a khatmah')}
          </Text>
          <Text style={[styles.customFieldLabel, { color: palette.muted }]}>
            {t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
          </Text>
          <TextInput
            value={customDaysText}
            onChangeText={setCustomDaysText}
            keyboardType="number-pad"
            autoFocus
            maxLength={3}
            accessibilityLabel={t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
            placeholder="1–604"
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={startCustomKhatmah}
          />
          {/* Issue #17. A khatmah already under way has a place in it, and
              without somewhere to say so the tracker can only be started
              by someone at page one. Blank is the ordinary case, and the
              placeholder says so rather than making the reader work it
              out. The page is theirs — of the muṣḥaf they are reading —
              which is why the count beside it is `total`. */}
          <Text style={[styles.customFieldLabel, { color: palette.muted }]}>
            {t('quran.khatmahFromPageTitle', 'Already reading? Start at page')}
          </Text>
          <TextInput
            value={customFromText}
            onChangeText={setCustomFromText}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel={t(
              'quran.khatmahFromPageTitle',
              'Already reading? Start at page',
            )}
            placeholder={t('quran.khatmahFromPageHint', {
              defaultValue: 'From the beginning',
            })}
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={startCustomKhatmah}
          />
          <View style={styles.customDaysRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
              onPress={() => setCustomDaysVisible(false)}
              style={styles.menuCancel}>
              <Text style={{ color: palette.muted, fontWeight: '600' }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.khatmahStartCta', 'Start')}
              onPress={startCustomKhatmah}
              style={styles.menuCancel}>
              <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
                {t('quran.khatmahStartCta', 'Start')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  contentWide: { maxWidth: 640, alignSelf: 'center', width: '100%' },
  intro: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  help: { fontSize: TYPE.caption.fontSize, lineHeight: 17, paddingHorizontal: SPACING.xs },
  khatmahCard: { padding: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.sm },
  khatmahTitle: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  khatmahChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  customDaysInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.title3.fontSize,
    fontVariant: ['tabular-nums'],
    marginTop: SPACING.xs,
  },
  customFieldLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginTop: SPACING.md,
  },
  customDaysRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
  },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menuCard: {
    position: 'absolute',
    // rtl-safe: a dialog pinned to both edges — symmetric, direction-agnostic
    left: 24,
    right: 24,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  menuCardResting: { top: '25%' },
  menuTitle: { fontSize: TYPE.title3.fontSize, fontWeight: '700', marginBottom: SPACING.xs },
  menuCancel: { alignItems: 'center', paddingVertical: SPACING.sm },
});
