/**
 * The way to the khatmah — and, until there is one, to Tilāwah beside it.
 *
 * The Qur'an tab used to carry the whole khatmah card: the book's bar,
 * the day's bar, the pace, the options menu, and with no plan a row of
 * chips for starting one. Above a list of 114 surahs that is a wall, and
 * a reader who came for Al-Kahf scrolled past the same wall every
 * Friday. The card is its own page now (`KhatmahScreen`); the tab keeps
 * one row that says where the plan stands and leads there.
 *
 * With no plan, "Start a khatmah" and "Tilāwah" are two half-width
 * buttons on one row — both are a tap into their own screen, neither has
 * anything to say yet, and a row each was two rows of furniture. Once a
 * plan is live the khatmah has a bar and a sentence, and Tilāwah goes
 * back to its own row with its transport (`TilawahRow`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';
import { activeKhatmah, khatmahReachAyah, KHATMAH_TOTAL_AYAHS } from '../../quran/khatmahProgress';
import { khatmahDatePassed, khatmahDeadline, planDays } from '../../quran/khatmahSchedule';
import { khatmahDay, khatmahDaysLeft, khatmahPages } from '../../quran/khatmahStatus';
import { useQuranState } from '../../quran/quranState';
import { QuranBookIcon } from '../../theme/icons';
import { cardEdgeStyle } from '../../theme/chrome';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

export function KhatmahEntry() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const quran = useQuranState();
  const plan = activeKhatmah(quran);

  if (!plan) {
    return (
      <View style={styles.pair}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.startKhatmah', 'Start a khatmah')}
          onPress={() => navigation.navigate('Khatmah')}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.mark, { backgroundColor: palette.accentBg }]}>
            <QuranBookIcon color={palette.accentSolid} size={18} />
          </View>
          <Text style={[styles.buttonLabel, { color: palette.text }]} numberOfLines={2}>
            {t('quran.startKhatmah', 'Start a khatmah')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('quran.listenTitle', 'Tilawah')} — ${t('quran.tilawahDoorSub', 'Listen to the Quran')}`}
          onPress={() => navigation.navigate('QuranListen')}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.mark, { backgroundColor: palette.accentBg }]}>
            <TilawahIcon color={palette.accentSolid} size={18} />
          </View>
          <Text style={[styles.buttonLabel, { color: palette.text }]} numberOfLines={2}>
            {t('quran.listenTitle', 'Tilawah')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const day = khatmahDay(plan);
  const pages = khatmahPages(plan, quran.prefs.riwayah);
  const deadline = khatmahDeadline(plan);
  const passed = khatmahDatePassed(plan);
  const progress = Math.max(
    0,
    Math.min(1, (khatmahReachAyah(plan) - day.extra) / KHATMAH_TOTAL_AYAHS),
  );
  // The row is titled "Khatmah"; the sentence beside it is the plan's
  // whole account in one line — pages, day — the same one the plan's
  // page says under its bar.
  const dayLine = t('quran.khatmahPageProgress', {
    defaultValue: '{{pages}} pages left · day {{day}} of {{days}}',
    pages: pages.remaining,
    day: day.portion.day,
    days: planDays(plan),
  });
  // The one line the row has: what today asks for, or that it is done —
  // the same sentence the Home door says, so the two agree.
  const status = passed
    ? t('quran.khatmahDatePassed', {
        defaultValue: 'Date passed — {{count}} pages left',
        count: pages.remaining,
      })
    : day.done
      ? t('home.readingDone', "Today's reading done")
      : t('home.pagesLeftToday', {
          defaultValue: '{{count}} pages left today',
          count: Math.max(1, pages.leftToday),
        });
  const daysLine =
    deadline && !passed
      ? null
      : t('home.khatmahDaysToGo', {
          defaultValue: '{{count}} days to go',
          count: khatmahDaysLeft(plan),
        });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('quran.khatmah', 'Khatmah')} · ${dayLine} · ${status}`}
      onPress={() => navigation.navigate('Khatmah')}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.mark, { backgroundColor: palette.accentBg }]}>
        <QuranBookIcon color={palette.accentSolid} size={18} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t('quran.khatmah', 'Khatmah')}
          </Text>
          <Text
            style={[styles.trailing, { color: day.done && !passed ? palette.accentSolid : palette.muted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {status}
          </Text>
        </View>
        <Text
          style={[styles.sub, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {[dayLine, daysLine].filter(Boolean).join(' · ')}
        </Text>
        <View style={[styles.track, { backgroundColor: palette.accentBg }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: palette.accentSolid, width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.chevron, { color: palette.muted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: SPACING.md },
  button: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  buttonLabel: { flex: 1, minWidth: 0, fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingStart: SPACING.md,
    paddingEnd: SPACING.sm,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '700', flexShrink: 1 },
  trailing: { fontSize: TYPE.caption.fontSize, fontWeight: '600', flexShrink: 1 },
  sub: { fontSize: TYPE.footnote.fontSize, marginTop: 1 },
  track: { height: 3, borderRadius: 2, marginTop: SPACING.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  chevron: { fontSize: TYPE.title3.fontSize, fontWeight: '600', paddingHorizontal: SPACING.xs },
  pressed: { opacity: 0.6 },
});
