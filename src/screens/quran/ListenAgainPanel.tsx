/**
 * "Carry on, or start something new" — the listening page when nothing is
 * playing, or the last session has gone stale.
 *
 * Three ways in, in the order people reach for them:
 *
 *   1. Carry on: the listen picks up at the ayah it reached
 *      (`listenProgress`) — the listening place, never the reading marker.
 *   2. Shuffle: a surah at random, then another, with shuffle left on.
 *   3. Recommended now: what the sunnah attaches to this hour
 *      (`listenSuggestions`), each with its reason.
 *
 * Shown while idle (after a reload, or once a listen has been stopped) and
 * while a listen has sat paused for longer than `STALE_AFTER_MS`. A pause
 * of a moment keeps the plain player: the play button is the answer then.
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SURAHS } from '../../quran/quran';
import type { ListenProgress } from '../../quran/audio/listenProgress';
import {
  listenSuggestions,
  type ListenSuggestion,
} from '../../quran/audio/listenSuggestions';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

function surahName(n: number): string {
  return SURAHS.find(s => s.number === n)?.romanized ?? String(n);
}

function ListenAgainPanelImpl({
  progress,
  maghrib,
  onContinue,
  onShuffle,
  onSuggestion,
}: {
  /** Where the last listen got to; null if nothing has been listened to. */
  progress: ListenProgress | null;
  /** Today's maghrib, if known — when the evening's suggestions begin. */
  maghrib: Date | null;
  onContinue: () => void;
  onShuffle: () => void;
  onSuggestion: (s: ListenSuggestion) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // Worked out when the panel is drawn: it is drawn when someone arrives
  // at an idle player, which is the moment the hour matters.
  const suggestions = useMemo(
    () => listenSuggestions(new Date(), maghrib),
    [maghrib],
  );

  const row = (
    key: string,
    title: string,
    sub: string,
    onPress: () => void,
    strong?: boolean,
  ) => (
    <Pressable
      key={key}
      testID={`listen-again-${key}`}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        strong
          ? { backgroundColor: palette.accentBg, borderColor: palette.accentSolid }
          : { borderColor: palette.border ?? palette.muted },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <Text
          style={[styles.rowTitle, { color: strong ? palette.accentSolid : palette.text }]}
          numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.rowSub, { color: palette.muted }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: palette.accentSolid }]}>›</Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
      ]}>
      <Text style={[styles.heading, { color: palette.muted }]}>
        {t('quran.listenAgain.heading', 'Carry on, or start something new')}
      </Text>
      {progress
        ? row(
            'continue',
            t('quran.listenAgain.resume', {
              defaultValue: 'Continue {{surah}}',
              surah: surahName(progress.surah),
            }),
            t('quran.listenAgain.resumeSub', {
              defaultValue: 'From ayah {{ayah}}, where you stopped listening',
              ayah: progress.ayah,
            }),
            onContinue,
            true,
          )
        : null}
      {row(
        'shuffle',
        t('quran.listenAgain.shuffle', 'Shuffle'),
        t('quran.listenAgain.shuffleSub', 'A surah at random, then another'),
        onShuffle,
      )}
      <Text style={[styles.subheading, { color: palette.muted }]}>
        {t('quran.listenAgain.suggested', 'Recommended now')}
      </Text>
      {suggestions.map(s =>
        row(
          s.id,
          s.titleKey ? t(s.titleKey, s.titleDefault ?? '') : surahName(s.surah),
          t(s.reasonKey, s.reasonDefault),
          () => onSuggestion(s),
        ),
      )}
    </View>
  );
}

export const ListenAgainPanel = memo(ListenAgainPanelImpl);

// Compact: these are choices, not cards. One line of title and one of
// reason, so the whole question fits on the screen with the player above.
const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    gap: 6,
    marginTop: SPACING.md,
  },
  heading: {
    fontSize: TYPE.caption.fontSize,
    fontWeight: '600',
    paddingHorizontal: SPACING.xs,
  },
  subheading: {
    fontSize: TYPE.caption.fontSize,
    fontWeight: '600',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: SPACING.sm + 2,
    gap: SPACING.sm,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  rowSub: { fontSize: 12, lineHeight: 16, marginTop: 1 },
  chevron: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
