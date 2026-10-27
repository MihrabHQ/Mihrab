/**
 * The muṣḥaf is in one reading and the voice recites another.
 *
 * Switching the page to Warsh, Qālūn or Shuʿbah leaves the reciter as it
 * was — a Ḥafṣ voice reading words the page does not have. The picker
 * lists the reader's own reading first, but nothing pointed there. This
 * does, in one line, where recitation is chosen: the voices of the page's
 * reading, a tap each. It goes away once they match, or when put away for
 * that reading — some readers listen in Ḥafṣ on purpose.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING, RADIUS } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { setQuranPrefs, useQuranState } from '../quranState';
import { readingOf, resolveRiwayah, riwayahById, type RiwayahId } from '../riwayat';
import { findReciter, playableReciters, reciterRiwayah, sortedReciters } from './reciters';

const DISMISSED_KEY = 'mihrab.voiceHint.dismissed';
/** At most this many voices on the line; the picker has the rest. */
const OFFERED = 3;

/** The voices of a reading, best first: ones with word timings, then the alphabet. */
export function voicesFor(reading: RiwayahId) {
  const all = sortedReciters(playableReciters()).filter(r => reciterRiwayah(r) === reading);
  return [...all.filter(r => r.hasTimings), ...all.filter(r => !r.hasTimings)];
}

export function ReadingVoiceHint() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(v => alive && setDismissed(v))
      .catch(() => alive && setDismissed(null));
    return () => {
      alive = false;
    };
  }, []);

  const pageReading = readingOf(resolveRiwayah(prefs.riwayah)) as RiwayahId;
  const reciter = findReciter(prefs.reciterId);
  const voiceReading = reciterRiwayah(reciter);
  const offered = useMemo(() => voicesFor(pageReading).slice(0, OFFERED), [pageReading]);

  if (dismissed === undefined) return null; // not read yet: say nothing rather than flash
  if (voiceReading === pageReading || offered.length === 0 || dismissed === pageReading) {
    return null;
  }

  const name = (id: RiwayahId) => t(riwayahById(id).nameKey);

  return (
    <View style={[styles.wrap, { borderColor: palette.border }]}>
      <View style={styles.head}>
        <Text style={[styles.text, { color: palette.text }]}>
          {t('quran.voiceHint', {
            defaultValue: 'The muṣḥaf is {{page}}; {{name}} recites {{voice}}. Hear it in {{page}}:',
            page: name(pageReading),
            voice: name(voiceReading),
            name: reciter.name,
          })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.voiceHintDismiss', 'Keep this voice')}
          hitSlop={10}
          onPress={() => {
            setDismissed(pageReading);
            void AsyncStorage.setItem(DISMISSED_KEY, pageReading).catch(() => undefined);
          }}>
          <Text style={[styles.close, { color: palette.muted }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.voices}>
        {offered.map(r => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => setQuranPrefs({ reciterId: r.id })}
            style={({ pressed }) => [
              styles.voice,
              { borderColor: palette.accent, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Text style={[styles.voiceText, { color: palette.accentSolid }]} numberOfLines={1}>
              {r.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  text: { flex: 1, fontSize: TYPE.footnote.fontSize, fontWeight: '400' },
  close: { fontSize: TYPE.callout.fontSize },
  voices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  voice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    maxWidth: '100%',
  },
  voiceText: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
});
