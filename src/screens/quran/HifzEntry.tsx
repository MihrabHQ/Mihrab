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
import {
  dayOf,
  EMPTY_HIFZ,
  HIFZ_COLOR,
  hifzStock,
  recitedToday,
  reviewPortion,
  todaysRevision,
  type HifzGrade,
  type HifzPortion,
} from '../../quran/hifz';
import { hifzDueLabel, hifzPortionName } from '../../quran/hifzLabels';
import { updateHifz, useQuranState } from '../../quran/quranState';
import { CheckIcon, HifzIcon } from '../../theme/icons';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/** The three grades as sheet choices; shared with the Hifz page. */
export function useHifzGradeChoices(onGrade: (grade: HifzGrade) => void) {
  const { t } = useTranslation();
  return [
    { id: 'fluent', title: t('hifz.gradeFluent', 'Fluent'), onPress: () => onGrade('fluent') },
    { id: 'fine', title: t('hifz.gradeFine', 'Fine'), onPress: () => onGrade('fine') },
    { id: 'again', title: t('hifz.gradeAgain', 'Needed help'), onPress: () => onGrade('again') },
  ];
}

/** Record a recitation of `id` with `grade`, dated now. */
export function recite(id: string, grade: HifzGrade) {
  const now = Date.now();
  updateHifz(prev => reviewPortion(prev, id, grade, dayOf(now), now));
}

export function HifzEntry() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hifz = useQuranState().hifz ?? EMPTY_HIFZ;
  const [grading, setGrading] = useState<HifzPortion | null>(null);
  const gradeChoices = useHifzGradeChoices(grade => {
    if (grading) recite(grading.id, grade);
    setGrading(null);
  });

  if (hifz.portions.length === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('hifz.door', 'Hifz')} — ${t('hifz.doorSub', 'What you know by heart')}`}
        onPress={() => navigation.navigate('Hifz')}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          pressed && styles.pressed,
        ]}>
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
    );
  }

  const today = dayOf(Date.now());
  const { due, shown, more } = todaysRevision(hifz, today);
  const done = recitedToday(hifz, today).length;
  const stock = hifzStock(hifz);
  const subtitle =
    due.length === 0
      ? done > 0
        ? t('hifz.allDone', "Today's revision done")
        : t('hifz.nothingDue', 'Nothing to revise today')
      : t('hifz.doneOf', { defaultValue: '{{done}} of {{total}} recited', done, total: done + due.length });

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
              accessibilityLabel={name}
              onPress={() => navigation.navigate('Hifz')}
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
                { borderColor: HIFZ_COLOR },
                pressed && styles.pressed,
              ]}>
              <CheckIcon color={HIFZ_COLOR} size={18} />
            </Pressable>
          </View>
        );
      })}
      <Text style={[styles.foot, { color: palette.muted }]} numberOfLines={1}>
        {more > 0
          ? t('hifz.more', { defaultValue: '{{count}} more tomorrow', count: more })
          : t('hifz.stock', {
              defaultValue: '{{surahs}} surahs · {{ayahs}} ayahs by heart',
              surahs: stock.surahs,
              ayahs: stock.ayahs,
            })}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
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
