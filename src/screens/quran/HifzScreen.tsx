/**
 * Hifz — the page (#121).
 *
 * Reached from the Hifz row on the Qur'an tab. It holds what the row does
 * not: the whole stock ("By heart", each portion with when it is next due,
 * a tap into the reader, and Remove), adding surahs by tapping them on a
 * 114-surah grid — Juz' 30 and 29 as one tap each, since that is where
 * most memorisation starts — and the two settings: how long any portion
 * may wait between recitations (7, 14 or 30 days) and how many portions a
 * day's revision asks for. Today's revision is here too, the same rows as
 * on the tab, so the page is complete on its own.
 *
 * A stretch of a surah rather than a whole one is marked from the reader
 * ("Memorised up to here" in the ayah sheet); the grid is whole surahs
 * only, because a grid of 6,236 ayahs is not a thing to tap.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { useBreakpoint } from '../../responsive/breakpoints';
import { useTabBarInset } from '../../navigation/tabBarInset';
import { ChoiceSheet } from '../../components/ui/ChoiceSheet';
import { SectionHead } from '../../components/controls';
import {
  budgetOf,
  capOf,
  dayOf,
  EMPTY_HIFZ,
  HIFZ_CAPS,
  HIFZ_COLOR,
  hifzStock,
  markSurah,
  portionSpan,
  recitedToday,
  removePortion,
  setBudget,
  setCap,
  surahMemorised,
  todaysRevision,
  unmarkSurah,
  type HifzPortion,
} from '../../quran/hifz';
import { hifzDueLabel, hifzPortionName } from '../../quran/hifzLabels';
import { findPageForAyah } from '../../quran/pages';
import { SURAHS } from '../../quran/quran';
import { updateHifz, useQuranState } from '../../quran/quranState';
import { resolveRiwayah } from '../../quran/riwayat';
import { CheckIcon } from '../../theme/icons';
import { cardEdgeStyle } from '../../theme/chrome';
import { TYPE } from '../../theme/typography';
import { RADIUS, SPACING } from '../../theme/tokens';
import { recite, useHifzGradeChoices } from './HifzEntry';

const BUDGETS = [1, 2, 3, 5, 10] as const;

/** The surahs that make up a juz' from its first surah on — only the two whole-surah juz' are offered. */
const JUZ_SURAHS: Record<number, [number, number]> = { 30: [78, 114], 29: [67, 77] };

export function HifzScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const wide = useBreakpoint() !== 'compact';
  const tabBarInset = useTabBarInset();
  const quran = useQuranState();
  const hifz = quran.hifz ?? EMPTY_HIFZ;
  const riwayah = resolveRiwayah(quran.prefs.riwayah);
  const today = dayOf(Date.now());
  const { shown, more } = todaysRevision(hifz, today);
  const done = recitedToday(hifz, today).length;
  const stock = hifzStock(hifz);
  const cap = capOf(hifz);
  const budget = budgetOf(hifz);
  const known = useMemo(() => new Set(SURAHS.filter(s => surahMemorised(hifz, s.number)).map(s => s.number)), [hifz]);
  const [grading, setGrading] = useState<HifzPortion | null>(null);
  const gradeChoices = useHifzGradeChoices(grade => {
    if (grading) recite(grading.id, grade);
    setGrading(null);
  });

  const toggleSurah = (n: number) => {
    const now = Date.now();
    updateHifz(prev => (surahMemorised(prev, n) ? unmarkSurah(prev, n, now) : markSurah(prev, n, dayOf(now), now)));
  };
  const toggleJuz = (juz: number) => {
    const [from, to] = JUZ_SURAHS[juz];
    const all = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const every = all.every(n => known.has(n));
    const now = Date.now();
    updateHifz(prev =>
      all.reduce((s, n) => (every ? unmarkSurah(s, n, now) : surahMemorised(s, n) ? s : markSurah(s, n, dayOf(now), now)), prev),
    );
  };
  const open = (p: HifzPortion) => {
    const span = portionSpan(p);
    navigation.navigate('QuranSurah', {
      surahNumber: span.surah,
      scrollToAyah: span.from,
      initialPage: findPageForAyah(span.surah, span.from, riwayah),
    });
  };

  const chip = (on: boolean) => [
    styles.chip,
    on ? { backgroundColor: HIFZ_COLOR, borderColor: HIFZ_COLOR } : { borderColor: palette.border },
  ];
  const chipText = (on: boolean) => [styles.chipText, { color: on ? '#fff' : palette.text }];
  const sorted = [...hifz.portions].sort((a, b) => a.start - b.start);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarInset + SPACING.xl },
        wide ? styles.contentWide : null,
      ]}>
      {hifz.portions.length === 0 ? (
        <Text style={[styles.intro, { color: palette.text }]}>
          {t(
            'hifz.empty',
            'Mark the surahs you know by heart, and Mihrab will say when to recite each one again — every day at first, then every few days, and never less than once a month.',
          )}
        </Text>
      ) : null}

      {hifz.portions.length > 0 ? (
        <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
          <SectionHead label={t('hifz.today', 'Revise today')} tight />
          {shown.length === 0 ? (
            <Text style={[styles.note, { color: palette.muted }]}>
              {done > 0 ? t('hifz.allDone', "Today's revision done") : t('hifz.nothingDue', 'Nothing to revise today')}
            </Text>
          ) : (
            shown.map(p => {
              const name = hifzPortionName(p, t);
              return (
                <View key={p.id} style={styles.portion}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name} — ${t('hifz.openReader', 'Open in the reader')}`}
                    onPress={() => open(p)}
                    style={({ pressed }) => [styles.portionBody, pressed && styles.pressed]}>
                    <Text style={[styles.portionName, { color: palette.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.note, { color: palette.muted }]} numberOfLines={1}>
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
                    style={({ pressed }) => [styles.tick, { borderColor: HIFZ_COLOR }, pressed && styles.pressed]}>
                    <CheckIcon color={HIFZ_COLOR} size={18} />
                  </Pressable>
                </View>
              );
            })
          )}
          {more > 0 ? (
            <Text style={[styles.note, { color: palette.muted }]}>
              {t('hifz.more', { defaultValue: '{{count}} more tomorrow', count: more })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hifz.portions.length > 0 ? (
        <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
          <SectionHead label={t('hifz.known', 'By heart')} tight />
          <Text style={[styles.note, { color: palette.muted }]}>
            {t('hifz.stock', {
              defaultValue: '{{surahs}} surahs · {{ayahs}} ayahs by heart',
              surahs: stock.surahs,
              ayahs: stock.ayahs,
            })}
          </Text>
          {sorted.map(p => {
            const name = hifzPortionName(p, t);
            return (
              <View key={p.id} style={styles.portion}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${name} — ${t('hifz.openReader', 'Open in the reader')}`}
                  onPress={() => open(p)}
                  style={({ pressed }) => [styles.portionBody, pressed && styles.pressed]}>
                  <Text style={[styles.portionName, { color: palette.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.note, { color: palette.muted }]} numberOfLines={1}>
                    {hifzDueLabel(p, today, t)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('hifz.remove', 'Remove')} — ${name}`}
                  hitSlop={8}
                  onPress={() => updateHifz(prev => removePortion(prev, p.id, Date.now()))}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                  <Text style={[styles.removeText, { color: palette.danger }]}>{t('hifz.remove', 'Remove')}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
        <SectionHead
          label={hifz.portions.length === 0 ? t('hifz.whichSurahs', 'Which surahs do you know by heart?') : t('hifz.add', 'Add what you know')}
          tight
        />
        <Text style={[styles.note, { color: palette.muted }]}>
          {t(
            'hifz.addHint',
            'Tap the surahs you know by heart. A stretch of a surah is marked from any ayah in the reader: "Memorised up to here".',
          )}
        </Text>
        <View style={styles.chips}>
          {[30, 29].map(juz => {
            const [from, to] = JUZ_SURAHS[juz];
            const on = Array.from({ length: to - from + 1 }, (_, i) => from + i).every(n => known.has(n));
            return (
              <Pressable
                key={juz}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t('hifz.juz', { defaultValue: "Juz' {{number}}", number: juz })}
                onPress={() => toggleJuz(juz)}
                style={({ pressed }) => [...chip(on), pressed && styles.pressed]}>
                <Text style={chipText(on)}>{t('hifz.juz', { defaultValue: "Juz' {{number}}", number: juz })}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.grid}>
          {SURAHS.map(s => {
            const on = known.has(s.number);
            return (
              <Pressable
                key={s.number}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.number} ${s.romanized}`}
                onPress={() => toggleSurah(s.number)}
                style={({ pressed }) => [
                  styles.cell,
                  on ? { backgroundColor: HIFZ_COLOR, borderColor: HIFZ_COLOR } : { borderColor: palette.border },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.cellNumber, on ? styles.onCell : { color: palette.muted }]}>{s.number}</Text>
                <Text style={[styles.cellName, on ? styles.onCell : { color: palette.text }]} numberOfLines={1}>
                  {s.romanized}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
        <SectionHead label={t('hifz.capTitle', 'Recite everything at least every')} tight />
        <View style={styles.chips}>
          {HIFZ_CAPS.map(c => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: c === cap }}
              onPress={() => {
                const now = Date.now();
                updateHifz(prev => setCap(prev, c, dayOf(now), now));
              }}
              style={({ pressed }) => [...chip(c === cap), pressed && styles.pressed]}>
              <Text style={chipText(c === cap)}>{t('hifz.capDays', { defaultValue: '{{count}} days', count: c })}</Text>
            </Pressable>
          ))}
        </View>
        <SectionHead label={t('hifz.budgetTitle', "A day's revision")} tight />
        <View style={styles.chips}>
          {BUDGETS.map(b => (
            <Pressable
              key={b}
              accessibilityRole="button"
              accessibilityState={{ selected: b === budget }}
              onPress={() => updateHifz(prev => setBudget(prev, b, Date.now()))}
              style={({ pressed }) => [...chip(b === budget), pressed && styles.pressed]}>
              <Text style={chipText(b === budget)}>
                {t('hifz.budgetPortions', { defaultValue: '{{count}} portions', count: b })}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ChoiceSheet
        visible={grading !== null}
        onClose={() => setGrading(null)}
        title={t('hifz.gradeTitle', { defaultValue: 'How did {{name}} go?', name: grading ? hifzPortionName(grading, t) : '' })}
        choices={gradeChoices}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  contentWide: { maxWidth: 640, alignSelf: 'center', width: '100%' },
  intro: { fontSize: TYPE.body.fontSize, lineHeight: 22 },
  card: { padding: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.sm },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  portion: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xs },
  portionBody: { flex: 1, minWidth: 0 },
  portionName: { fontSize: TYPE.callout.fontSize },
  tick: { width: 36, height: 36, borderRadius: RADIUS.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  remove: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  removeText: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 1 },
  chipText: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  cell: { width: '23%', flexGrow: 1, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs },
  cellNumber: { fontSize: TYPE.caption.fontSize, fontVariant: ['tabular-nums'] },
  cellName: { fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  onCell: { color: '#fff' },
  pressed: { opacity: 0.6 },
});
