/**
 * The Qur'an tab's recommendations, above the surah list: what to read
 * now, and what of the hifz to practise before it is due.
 *
 *   ✦ Recommended now
 *   [ Al-Kahf      ] [ Al-Mulk     ]     what the sunnah attaches to the
 *   [ reason…      ] [ reason…     ]     hour (`readSuggestions`), with
 *                                        Al-Kahf and Al-Mulk always there
 *   ♥ Practise before it's due
 *   [ An-Naba      ] [ Al-Mursalat ]     the portions coming up
 *   [ Tomorrow     ] [ In 3 days   ]     (`practiseAhead`)
 *
 * Each is a heading that opens and closes, closed to begin with: two rows
 * of cards each are a lot to scroll past on the way to the surah list
 * every time. Closed, the heading still says what is in it — the first
 * names, the count — and the reader's choice is kept (`QuranPrefs`
 * `recommendedOpen`, `practiseOpen`), each on its own.
 *
 * The same small cards as the listening page's "Recommended now"
 * (ListenAgainPanel), so the two read as one idea. A reading card opens
 * the reader there; a practice card opens the portion to recite from
 * memory, its ayahs hidden, in the reader's practice mode — which records
 * nothing, so practising ahead never moves the schedule or takes a place
 * in today's revision.
 */
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { todaysMaghrib } from '../../hijri/islamicDay';
import { SparkIcon } from '../../quran/audio/PlaybackIcons';
import type { ListenSuggestion } from '../../quran/audio/listenSuggestions';
import { dayOf, EMPTY_HIFZ, hifzInk, neededHelpLast, practiseAhead, type HifzPortion } from '../../quran/hifz';
import { hifzDueLabel, hifzPortionName, hifzSurahName } from '../../quran/hifzLabels';
import { setQuranPrefs, useQuranState } from '../../quran/quranState';
import { readSuggestions } from '../../quran/readSuggestions';
import { HifzIcon } from '../../theme/icons';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Props = {
  /** Open the reader at a surah and ayah. */
  onRead: (surah: number, ayah: number) => void;
  /** Open a hifz portion to practise from memory. */
  onPractise: (p: HifzPortion) => void;
};

function ReadRecommendationsImpl({ onRead, onPractise }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();
  const hifz = quran.hifz ?? EMPTY_HIFZ;
  const recommendedOpen = quran.prefs.recommendedOpen;
  const practiseOpen = quran.prefs.practiseOpen;
  // Worked out when the header is drawn — arriving on the tab, which is
  // when the hour matters.
  const now = new Date();
  const suggestions = readSuggestions(now, todaysMaghrib());
  const today = dayOf(now.getTime());
  const practise = practiseAhead(hifz, today);
  const ink = hifzInk(Boolean(palette.isDark));
  const tile = [styles.tile, { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted }];

  const card = (key: string, title: string, sub: string, onPress: () => void, testID: string) => (
    <Pressable
      key={key}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [...tile, pressed && styles.pressed]}>
      <Text style={[styles.tileTitle, { color: palette.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.tileReason, { color: palette.muted }]} numberOfLines={2}>
        {sub}
      </Text>
    </Pressable>
  );

  const titleOf = (s: ListenSuggestion) => (s.titleKey ? t(s.titleKey, s.titleDefault ?? '') : hifzSurahName(s.surah));

  /** A heading that opens and closes its cards; closed, what is in it follows the label. */
  const heading = (
    icon: ReactNode,
    label: string,
    summary: string,
    open: boolean,
    toggle: () => void,
    testID: string,
  ) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? label : `${label} — ${summary}`}
      onPress={toggle}
      hitSlop={6}
      style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
      {icon}
      <Text style={[styles.label, { color: palette.muted }]} numberOfLines={1}>
        {label}
      </Text>
      {open ? <View style={styles.fill} /> : (
        <Text style={[styles.summary, { color: palette.muted }]} numberOfLines={1}>
          {`· ${summary}`}
        </Text>
      )}
      <Text style={[styles.chevron, { color: palette.muted }]}>{open ? '⌃' : '⌄'}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {heading(
        <SparkIcon color={String(palette.accentSolid)} size={12} />,
        t('quran.listenAgain.suggested', 'Recommended now'),
        suggestions.map(titleOf).join(', '),
        recommendedOpen,
        () => setQuranPrefs({ recommendedOpen: !recommendedOpen }),
        'read-now-toggle',
      )}
      {recommendedOpen ? (
        <View style={styles.grid}>
          {suggestions.map(s =>
            card(s.id, titleOf(s), t(s.reasonKey, s.reasonDefault), () => onRead(s.surah, s.ayah), `read-now-${s.id}`),
          )}
        </View>
      ) : null}
      {practise.length > 0 ? (
        <>
          {heading(
            <HifzIcon color={ink} size={13} />,
            t('hifz.practiseAhead', "Practise before it's due"),
            practise.map(p => hifzPortionName(p, t)).join(', '),
            practiseOpen,
            () => setQuranPrefs({ practiseOpen: !practiseOpen }),
            'practise-toggle',
          )}
          {practiseOpen ? (
          <View style={styles.grid}>
            {practise.map(p => {
              const due = hifzDueLabel(p, today, t);
              const sub = neededHelpLast(p) ? `${due} · ${t('hifz.neededHelpLast', 'needed help last time')}` : due;
              return card(p.id, hifzPortionName(p, t), sub, () => onPractise(p), `practise-${p.id}`);
            })}
          </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export const ReadRecommendations = memo(ReadRecommendationsImpl);

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.sm, gap: SPACING.xs },
  // A heading row is a touch target: tall enough to hit, its chevron at the end.
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.xs, minHeight: 32 },
  label: { fontSize: TYPE.footnote.fontSize, fontWeight: '400', flexShrink: 0 },
  summary: { flex: 1, minWidth: 0, fontSize: TYPE.footnote.fontSize, fontWeight: '400', opacity: 0.75 },
  fill: { flex: 1 },
  chevron: { fontSize: TYPE.footnote.fontSize },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  // Two to a row; an odd last one takes the row — as the listening page's.
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
    gap: 2,
  },
  tileTitle: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  tileReason: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.6 },
});
