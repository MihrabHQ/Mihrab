/**
 * Hifz on the Qur'an tab (#121).
 *
 * Before anything is marked by heart it is one row — a door into the Hifz
 * page, where the surahs are chosen. Once something is, the tab draws the
 * day's revision itself: the portions due today, each with a ✓ that means
 * "recited, it went fine" (a long press asks how it went instead), the
 * count still to come, and the stock. The day's work is done from here
 * without opening anything; the page is for adding, removing and the two
 * settings.
 *
 * Reads the Qur'an blob (`QuranState.hifz`) through the same store the
 * khatmah card does, so a recitation marked on another device arrives
 * here with the next sync.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { ChoiceSheet } from '../../components/ui/ChoiceSheet';
import { ayahIndexOf } from '../../quran/ayahIndex';
import { clearDrillOffer, useLastDrill } from '../../quran/hifzDrill';
import {
  capOf,
  dayOf,
  EMPTY_HIFZ,
  HIFZ_COLOR,
  hifzInk,
  nextInterval,
  hifzStock,
  markRange,
  portionAt,
  portionSpan,
  recitedToday,
  reviewPortion as recordReview,
  todaysRevision,
  type HifzGrade,
  type HifzPortion,
} from '../../quran/hifz';
import { hifzDueLabel, hifzPortionName, hifzStockLine, hifzSurahName } from '../../quran/hifzLabels';
import { updateHifz, useQuranState } from '../../quran/quranState';
import { CheckIcon, HifzIcon } from '../../theme/icons';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * The three grades as sheet choices; shared with the Hifz page and the
 * review. Each says what it will do to the portion — "Next in 7 days",
 * "Again tomorrow" — so a grade is a choice about the schedule, not a
 * mood.
 */
export function useHifzGradeChoices(onGrade: (grade: HifzGrade) => void, portion?: HifzPortion | null) {
  const { t } = useTranslation();
  const hifz = useQuranState().hifz;
  const cap = capOf(hifz ?? EMPTY_HIFZ);
  const after = (grade: HifzGrade) => {
    if (!portion) return undefined;
    const days = nextInterval(portion.interval, grade, cap);
    return days <= 1
      ? t('hifz.nextTomorrow', 'Again tomorrow')
      : t('hifz.nextIn', { defaultValue: 'Next in {{count}} days', count: days });
  };
  return [
    { id: 'fluent', title: t('hifz.gradeFluent', 'Fluent'), subtitle: after('fluent'), onPress: () => onGrade('fluent') },
    { id: 'fine', title: t('hifz.gradeFine', 'Fine'), subtitle: after('fine'), onPress: () => onGrade('fine') },
    { id: 'again', title: t('hifz.gradeAgain', 'Needed help'), subtitle: after('again'), onPress: () => onGrade('again') },
  ];
}

/**
 * Open a portion in the reader to recite it from memory: its ayahs hidden
 * until checked, and a Done that asks how it went (#121).
 */
export function reviewPortion(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  p: HifzPortion,
) {
  const span = portionSpan(p);
  navigation.navigate('QuranSurah', {
    surahNumber: span.surah,
    scrollToAyah: span.from,
    hifzReview: p.id,
  });
}

/** Record a recitation of `id` with `grade`, dated now. */
export function recite(id: string, grade: HifzGrade) {
  const now = Date.now();
  updateHifz(prev => recordReview(prev, id, grade, dayOf(now), now));
}

/**
 * The drill that just finished, as a row: its range, and Mark — the one
 * step from learning a range to keeping it (#121).
 */
function DrillOffer() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const drill = useLastDrill();
  const hifz = useQuranState().hifz;
  // Marked meanwhile, by the sheet or the grid: nothing left to offer.
  const kept =
    drill != null &&
    hifz != null &&
    portionAt(hifz, drill.surah, drill.from) != null &&
    portionAt(hifz, drill.surah, drill.to) != null;
  if (!drill || kept) return null;
  const range = t('hifz.range', {
    defaultValue: '{{surah}} {{from}}–{{to}}',
    surah: hifzSurahName(drill.surah),
    from: drill.from,
    to: drill.to,
  });
  const label = t('hifz.drilled', { defaultValue: 'Drilled {{range}} — memorised', range });
  return (
    <View style={styles.portion}>
      <Text style={[styles.sub, styles.portionBody, { color: palette.muted }]} numberOfLines={2}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${t('hifz.sheetMark', 'Mark')}`}
        hitSlop={8}
        onPress={() => {
          const now = Date.now();
          updateHifz(prev =>
            markRange(
              prev,
              ayahIndexOf(drill.surah, drill.from),
              ayahIndexOf(drill.surah, drill.to),
              dayOf(now),
              now,
            ),
          );
          clearDrillOffer();
        }}
        style={({ pressed }) => [styles.markChip, { backgroundColor: HIFZ_COLOR }, pressed && styles.pressed]}>
        <Text style={styles.markChipText}>{t('hifz.sheetMark', 'Mark')}</Text>
      </Pressable>
    </View>
  );
}

export function HifzEntry() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hifz = useQuranState().hifz ?? EMPTY_HIFZ;
  const ink = hifzInk(Boolean(palette.isDark));
  const [grading, setGrading] = useState<HifzPortion | null>(null);
  const gradeChoices = useHifzGradeChoices(grade => {
    if (grading) recite(grading.id, grade);
    setGrading(null);
  }, grading);

  if (hifz.portions.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('hifz.door', 'Hifz')} — ${t('hifz.doorSub', 'What you know by heart')}`}
          onPress={() => navigation.navigate('Hifz')}
          style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
          <View style={[styles.mark, { backgroundColor: `${HIFZ_COLOR}26` }]}>
            <HifzIcon color={HIFZ_COLOR} size={18} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {t('hifz.door', 'Hifz')}
            </Text>
            <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={1}>
              {t('hifz.doorSub', 'What you know by heart')}
            </Text>
          </View>
        </Pressable>
        <DrillOffer />
      </View>
    );
  }

  const today = dayOf(Date.now());
  const { shown, more } = todaysRevision(hifz, today);
  const done = recitedToday(hifz, today).length;
  const stock = hifzStock(hifz);
  const subtitle =
    shown.length === 0
      ? done > 0
        ? t('hifz.allDone', "Today's revision done")
        : t('hifz.nothingDue', 'Nothing to revise today')
      : t('hifz.doneOf', { defaultValue: '{{done}} of {{total}} recited', done, total: done + shown.length });

  return (
    <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('hifz.today', 'Revise today')} — ${subtitle}`}
        onPress={() => navigation.navigate('Hifz')}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <View style={[styles.mark, { backgroundColor: `${HIFZ_COLOR}26` }]}>
          <HifzIcon color={HIFZ_COLOR} size={18} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t('hifz.today', 'Revise today')}
          </Text>
          <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      {shown.map(p => {
        const name = hifzPortionName(p, t);
        return (
          <View key={p.id} style={styles.portion}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name} — ${t('hifz.reciteFromMemory', 'Recite from memory')}`}
              onPress={() => reviewPortion(navigation, p)}
              style={({ pressed }) => [styles.portionBody, pressed && styles.pressed]}>
              <Text style={[styles.portionName, { color: palette.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={1}>
                {hifzDueLabel(p, today, t)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('hifz.recitedA11y', { defaultValue: 'Recited {{name}}', name })}
              accessibilityHint={t('hifz.gradeTitle', { defaultValue: 'How did {{name}} go?', name })}
              hitSlop={8}
              onPress={() => recite(p.id, 'fine')}
              onLongPress={() => setGrading(p)}
              style={({ pressed }) => [
                styles.tick,
                { borderColor: ink },
                pressed && styles.pressed,
              ]}>
              <CheckIcon color={ink} size={18} />
            </Pressable>
          </View>
        );
      })}
      <DrillOffer />
      <Text style={[styles.foot, { color: palette.muted }]} numberOfLines={1}>
        {more > 0
          ? t('hifz.more', { defaultValue: '{{count}} more tomorrow', count: more })
          : hifzStockLine(stock, t)}
      </Text>
      <ChoiceSheet
        visible={grading !== null}
        onClose={() => setGrading(null)}
        title={t('hifz.gradeTitle', {
          defaultValue: 'How did {{name}} go?',
          name: grading ? hifzPortionName(grading, t) : '',
        })}
        choices={gradeChoices}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  markChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  markChipText: { color: '#fff', fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  card: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minWidth: 0 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '500' },
  sub: { fontSize: TYPE.footnote.fontSize, marginTop: 1 },
  portion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingStart: 36 + SPACING.md,
  },
  portionBody: { flex: 1, minWidth: 0 },
  portionName: { fontSize: TYPE.callout.fontSize },
  tick: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: { fontSize: TYPE.footnote.fontSize, paddingStart: 36 + SPACING.md },
  pressed: { opacity: 0.6 },
});
