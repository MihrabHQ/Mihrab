/**
 * Carry on, shuffle, or what is recommended now — the listening page when
 * nothing is playing, or the last session has gone stale.
 *
 * Laid out to be read at a glance rather than as a list:
 *
 *   [ ▶  Continue Al-Baqarah · 120 ]  [ ⤨ ]     one row: the two ways on
 *   ✦ Recommended now
 *   [ Al-Kahf      ] [ As-Sajdah   ]             a grid of small cards,
 *   [ reason…      ] [ reason…     ]             name and why
 *
 * Continue picks the listen up where it reached (`listenProgress`) — the
 * listening place, never the reading marker. Shuffle starts a surah at
 * random with shuffle left on. The cards are what the sunnah attaches to
 * this hour (`listenSuggestions`).
 *
 * Shown while idle (after a reload, or once a listen has been stopped) and
 * while a listen has sat paused for longer than `STALE_AFTER_MS`.
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
import { PlayIcon, ShuffleIcon, SparkIcon } from '../../quran/audio/PlaybackIcons';
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
  const shuffleLabel = t('quran.listenAgain.shuffle', 'Shuffle');

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        {progress ? (
          <Pressable
            testID="listen-again-continue"
            accessibilityRole="button"
            accessibilityLabel={`${t('quran.listenAgain.resume', {
              defaultValue: 'Continue {{surah}}',
              surah: surahName(progress.surah),
            })} — ${t('quran.listenAgain.resumeSub', {
              defaultValue: 'From ayah {{ayah}}, where you stopped listening',
              ayah: progress.ayah,
            })}`}
            onPress={onContinue}
            style={({ pressed }) => [
              styles.continueBtn,
              { backgroundColor: palette.accentSolid },
              pressed && styles.pressed,
            ]}>
            <PlayIcon color={String(palette.onAccent)} size={16} />
            <Text
              style={[styles.continueText, { color: palette.onAccent }]}
              numberOfLines={1}>
              {t('quran.listenAgain.resume', {
                defaultValue: 'Continue {{surah}}',
                surah: surahName(progress.surah),
              })}
            </Text>
            <Text
              style={[styles.continueAyah, { color: palette.onAccent }]}
              numberOfLines={1}>
              {`· ${progress.ayah}`}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="listen-again-shuffle"
          accessibilityRole="button"
          accessibilityLabel={`${shuffleLabel} — ${t(
            'quran.listenAgain.shuffleSub',
            'A surah at random, then another',
          )}`}
          onPress={onShuffle}
          style={({ pressed }) => [
            progress ? styles.shuffleBtn : styles.shuffleWide,
            { backgroundColor: palette.controlBg },
            pressed && styles.pressed,
          ]}>
          <ShuffleIcon color={String(palette.accentSolid)} size={18} />
          {progress ? null : (
            <Text style={[styles.shuffleText, { color: palette.text }]} numberOfLines={1}>
              {shuffleLabel}
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.suggestHead}>
        <SparkIcon color={String(palette.accentSolid)} size={12} />
        <Text style={[styles.suggestLabel, { color: palette.muted }]}>
          {t('quran.listenAgain.suggested', 'Recommended now')}
        </Text>
      </View>
      <View style={styles.grid}>
        {suggestions.map(s => {
          const title = s.titleKey ? t(s.titleKey, s.titleDefault ?? '') : surahName(s.surah);
          const reason = t(s.reasonKey, s.reasonDefault);
          return (
            <Pressable
              key={s.id}
              testID={`listen-again-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${title} — ${reason}`}
              onPress={() => onSuggestion(s)}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.tileTitle, { color: palette.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.tileReason, { color: palette.muted }]} numberOfLines={2}>
                {reason}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const ListenAgainPanel = memo(ListenAgainPanelImpl);

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.md, gap: SPACING.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  continueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: SPACING.md,
  },
  continueText: { flexShrink: 1, fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  continueAyah: { fontSize: TYPE.callout.fontSize, fontWeight: '500', opacity: 0.85 },
  shuffleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 44,
    borderRadius: 22,
  },
  shuffleText: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  suggestHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  suggestLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  // Two to a row; an odd last one takes the row.
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
    gap: 2,
  },
  tileTitle: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  tileReason: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.6 },
});
