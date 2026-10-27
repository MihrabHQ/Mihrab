/**
 * The Sky theme, shown before it is chosen: the six moods of the day as
 * a row of small skies, night to sunset, each Today's sky at that hour in
 * small (theme/skyMoods.ts). Tapping the strip picks the theme — a look is
 * offered by showing it, not by naming it — and the selected state is a
 * ring in the accent, as a swatch in the accent shelf is.
 *
 * `variant` picks whose six skies: Realistic's or Vibrant's.
 *
 * Without `onPress` it is only the picture: what Sky does, shown under
 * Sky once it is the theme (the walkthrough's Look group), with no ring
 * and nothing to press.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../theme/tokens';
import { DEFAULT_SKY_VARIANT, SKY_MOODS_BY_VARIANT, type SkyMood, type SkyVariant } from '../theme/skyMoods';
import { linearDown, radialGlow } from '../screens/home/skyPaint';

const ORDER: ReadonlyArray<SkyMood['name']> = ['night', 'dawn', 'morning', 'midday', 'golden', 'sunset'];
const TILE_H = 44;
const MID_AT = 0.62;

/**
 * Each tile is Today's sky at that hour in small, drawn as Today draws it:
 * the gradient, the body in the hour's light with its halo, and by night
 * the moon and the stars. The tiles used to be the gradient alone — the
 * sky before the sun, the moon and the halo were put in it — so the
 * preview showed less than the page it offers. Views, not an <Svg>: on
 * Android every <Svg> is a bitmap of its size (skyPaint.ts).
 *
 * Where the body stands, as fractions of the tile: up the dawn's sky from
 * the horizon on the left, over the middle at noon, down to it on the
 * right at sunset. At dawn and at sunset it is half under the horizon, as
 * it is on Today at sunrise and at Maghrib.
 */
const HORIZON = 0.84;
type Scene = { x: number; y: number; moon?: boolean };
const SCENES: Record<SkyMood['name'], Scene> = {
  night: { x: 0.68, y: 0.3, moon: true },
  dawn: { x: 0.3, y: HORIZON },
  morning: { x: 0.3, y: 0.46 },
  midday: { x: 0.5, y: 0.26 },
  golden: { x: 0.7, y: 0.5 },
  sunset: { x: 0.72, y: HORIZON },
};
/** The night's stars, as fractions of the tile: a scatter clear of the moon. */
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [0.18, 0.2, 1.6],
  [0.36, 0.48, 1.2],
  [0.14, 0.62, 1.2],
  [0.86, 0.6, 1.4],
  [0.46, 0.14, 1.2],
];
type Props = {
  selected: boolean;
  accent: string;
  accessibilityLabel: string;
  onPress?: () => void;
  testID?: string;
  variant?: SkyVariant;
};

const SUN_R = 5;
const MOON_R = 4.5;
const GLOW_R = 17;

function Tile({ mood }: { mood: SkyMood }) {
  const scene = SCENES[mood.name];
  const r = scene.moon ? MOON_R : SUN_R;
  const cy = scene.y * TILE_H;
  const left = `${scene.x * 100}%` as const;
  return (
    <View
      style={[
        styles.tile,
        { backgroundImage: linearDown([[mood.heroTop, 0], [mood.heroMid, MID_AT], [mood.heroFoot, 1]]) },
      ]}>
      {scene.moon
        ? STARS.map(([x, y, d], i) => (
            <View
              key={i}
              style={[
                styles.star,
                { left: `${x * 100}%`, top: y * TILE_H, width: d, height: d, borderRadius: d / 2, backgroundColor: mood.starGlow },
              ]}
            />
          ))
        : null}
      <View
        style={{
          position: 'absolute',
          left,
          top: cy - GLOW_R,
          width: GLOW_R * 2,
          height: GLOW_R * 2,
          marginLeft: -GLOW_R, // rtl-safe: a picture of the sky, not mirrored, as Today's is not
          backgroundImage: radialGlow(mood.bodyLight, scene.moon ? 0.35 : 0.6),
        }}
      />
      {/* The body, cut at the horizon when it stands on it. */}
      <View style={[styles.sky, { height: scene.y >= HORIZON ? HORIZON * TILE_H : TILE_H }]}>
        <View
          style={{
            position: 'absolute',
            left,
            top: cy - r,
            width: r * 2,
            height: r * 2,
            marginLeft: -r, // rtl-safe: a picture of the sky, not mirrored, as Today's is not
            borderRadius: r,
            backgroundColor: mood.bodyLight,
          }}
        />
        {scene.moon ? (
          // A crescent: the night's sky laid over the disc, a little aside.
          <View
            style={{
              position: 'absolute',
              left,
              top: cy - r - 1,
              width: r * 2,
              height: r * 2,
              marginLeft: -r + 2.5, // rtl-safe: a picture of the sky, not mirrored, as Today's is not
              borderRadius: r,
              backgroundColor: mood.heroTop,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function SkyMoodStripImpl({ selected, accent, accessibilityLabel, onPress, testID, variant = DEFAULT_SKY_VARIANT }: Props) {
  const moods = SKY_MOODS_BY_VARIANT[variant];
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[styles.strip, { borderColor: 'transparent' }]}>
        {ORDER.map(name => (
          <Tile key={name} mood={moods[name]} />
        ))}
      </View>
    );
  }
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
        <Tile key={name} mood={moods[name]} />
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
  sky: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  star: { position: 'absolute', opacity: 0.9 },
});
