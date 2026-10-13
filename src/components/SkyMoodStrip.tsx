/**
 * The Sky theme, shown before it is chosen: the six moods of the day as
 * a row of small skies, night to sunset, each its own three-stop gradient
 * (theme/skyMoods.ts). Tapping the strip picks the theme — a look is
 * offered by showing it, not by naming it — and the selected state is a
 * ring in the accent, as a swatch in the accent shelf is.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { RADIUS, SPACING } from '../theme/tokens';
import { SKY_MOODS, type SkyMood } from '../theme/skyMoods';

const ORDER: ReadonlyArray<SkyMood['name']> = ['night', 'dawn', 'morning', 'midday', 'golden', 'sunset'];
const TILE_H = 44;
const MID_AT = 0.62;

type Props = {
  selected: boolean;
  accent: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
};

function Tile({ mood, id }: { mood: SkyMood; id: string }) {
  return (
    <View style={styles.tile}>
      <Svg width="100%" height={TILE_H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={mood.heroTop} />
            <Stop offset={String(MID_AT)} stopColor={mood.heroMid} />
            <Stop offset="1" stopColor={mood.heroFoot} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={TILE_H} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function SkyMoodStripImpl({ selected, accent, accessibilityLabel, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.strip,
        { borderColor: selected ? accent : 'transparent', opacity: pressed ? 0.85 : 1 },
      ]}>
      {ORDER.map(name => (
        <Tile key={name} mood={SKY_MOODS[name]} id={`skyMoodStrip-${name}`} />
      ))}
    </Pressable>
  );
}

export const SkyMoodStrip = memo(SkyMoodStripImpl);

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: SPACING.xs,
    padding: 3,
    borderWidth: 2,
    borderRadius: RADIUS.md + 3,
  },
  tile: { flex: 1, height: TILE_H, borderRadius: RADIUS.md, overflow: 'hidden' },
});
