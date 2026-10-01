/**
 * The khatmah on the Qur'an tab — and, until there is one, Tilāwah beside it.
 *
 * With no plan, "Start a khatmah" and "Tilāwah" are two half-width
 * buttons on one row: both are a tap into their own screen, neither has
 * anything to say yet, and a row each was two rows of furniture. Starting
 * one is its own page (`KhatmahScreen`). Once a plan is live the tab
 * draws the plan's own card — its bars, the day's reading done, the ⋯
 * menu (`KhatmahCard`) — and Tilāwah goes back to its own row with its
 * transport (`TilawahRow`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';
import { activeKhatmah } from '../../quran/khatmahProgress';
import { useQuranState } from '../../quran/quranState';
import { QuranBookIcon } from '../../theme/icons';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { KhatmahCard } from './KhatmahCard';

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

  return <KhatmahCard />;
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
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
