/**
 * The hero's two looks, offered by showing them, as the layouts are
 * (LayoutPicker): a small picture of the hero in the reader's own colours
 * — the sky of the hour under the Sky theme, the page's paper otherwise —
 * with the chosen one in the accent's ring.
 *
 * Painted is the sky as it is: the sun with its glow over the countdown.
 * Track is the same band as a chart (screens/home/trackModel.ts): the
 * horizon as a hairline over the eyebrow, the day's arc, the sun on it
 * and the ring where it will be at the next prayer, the stretch between
 * them drawn stronger. Sketches, not screenshots: lines where the words
 * are, so they read the same in every language and at every text size,
 * and only the countdown in type.
 *
 * Under Minimal the Track has no rail and carries on below the horizon
 * (TodayCard `trackDepth`), so its picture does too when `minimal` is set.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { linearDown, radialGlow, withAlpha } from '../screens/home/skyPaint';
import type { HeroLook } from '../settings/types';

type Colors = {
  /** The hero's sky, top to foot. */
  skyTop: string;
  skyFoot: string;
  /** The sun's colour. */
  sun: string;
  text: string;
  muted: string;
  accent: string;
  /** Minimal's Track: no rail, the path drawn on under the horizon. */
  minimal?: boolean;
};

type Props = Colors & {
  value: HeroLook;
  onChange: (v: HeroLook) => void;
  testID?: string;
};

const PREVIEW_H = 124;
const PREVIEW_W = 150;
const COUNTDOWN = '1h 15m';
/** The sky band the bodies live in: the picture's top, down to the eyebrow. */
const BAND_H = 56;
/** Minimal's band: the same horizon, with room under it for the night. */
const DEEP_BAND_H = 74;

function Bar({ w, color, h = 3, style }: { w: number; color: string; h?: number; style?: object }) {
  return <View style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }, style]} />;
}

function Countdown({ color }: { color: string }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{ color, fontSize: 17, fontWeight: '300', letterSpacing: -0.5, includeFontPadding: false }}>
      {COUNTDOWN}
    </Text>
  );
}

/** The eyebrow, the countdown and the rail: the same under both looks. */
function Words({ text, rail = true }: { text: string; rail?: boolean }) {
  return (
    <View style={styles.words}>
      <Bar w={26} color={withAlpha(text, 0.45)} style={styles.eyebrow} />
      <Countdown color={text} />
      {rail ? (
        <View style={styles.rail}>
          <View style={[styles.railTrack, { backgroundColor: withAlpha(text, 0.25) }]} />
          <View style={[styles.railTrack, { width: '55%', backgroundColor: text }]} />
          <View style={[styles.railHead, { left: '55%', backgroundColor: text }]} />
        </View>
      ) : null}
    </View>
  );
}

function PaintedPreview(c: Colors) {
  return (
    <View style={[styles.preview, { backgroundImage: linearDown([[c.skyTop, 0], [c.skyFoot, 1]]) }]}>
      {/* The sun of a morning, its glow on the sky, over the words. */}
      <View style={[styles.glow, { backgroundImage: radialGlow(c.sun, 0.85) }]} />
      <View style={[styles.sun, { backgroundColor: c.sun }]} />
      <Words text={c.text} rail={!c.minimal} />
    </View>
  );
}

function TrackPreview(c: Colors) {
  // The day's arc across the band, a sun a third of the way along it, the
  // ring at its top (Dhuhr), the stretch between them stronger, the
  // horizon under it all. Drawn once; the preview never animates.
  const horizon = BAND_H - 2;
  const d = `M 14 ${horizon} Q ${PREVIEW_W / 2} ${-horizon * 0.55} ${PREVIEW_W - 14} ${horizon}`;
  // Points on that quadratic at t = 0.3 (the sun) and 0.5 (the ring).
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * 14 + 2 * u * t * (PREVIEW_W / 2) + t * t * (PREVIEW_W - 14),
      y: u * u * horizon + 2 * u * t * -horizon * 0.55 + t * t * horizon,
    };
  };
  const sun = at(0.3);
  const ring = at(0.5);
  const stretch = (() => {
    // The arc from the sun to the ring, as a run of short lines.
    const pts = [0.3, 0.35, 0.4, 0.45, 0.5].map(at);
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  })();
  // Minimal: the same curve carried on past both ends, under the horizon,
  // faint — the night's share of the path, as the hero draws it.
  const under = (from: number, to: number) =>
    [0, 1, 2, 3, 4]
      .map(i => at(from + ((to - from) * i) / 4))
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  const bandH = c.minimal ? DEEP_BAND_H : BAND_H;
  return (
    <View style={[styles.preview, { backgroundImage: linearDown([[c.skyTop, 0], [c.skyFoot, 1]]) }]}>
      <Svg width={PREVIEW_W} height={bandH} viewBox={`0 0 ${PREVIEW_W} ${bandH}`} style={styles.band} pointerEvents="none">
        {c.minimal ? (
          <>
            <Path d={under(-0.14, 0)} stroke={c.sun} strokeWidth={0.75} strokeOpacity={0.3} fill="none" />
            <Path d={under(1, 1.14)} stroke={c.sun} strokeWidth={0.75} strokeOpacity={0.3} fill="none" />
          </>
        ) : null}
        <Path d={d} stroke={c.sun} strokeWidth={0.75} strokeOpacity={0.7} fill="none" />
        <Path d={stretch} stroke={c.text} strokeWidth={1.25} strokeOpacity={0.6} fill="none" strokeLinecap="round" />
        <Line x1={0} y1={horizon} x2={PREVIEW_W} y2={horizon} stroke={c.text} strokeWidth={0.75} strokeOpacity={0.5} />
        <Circle cx={sun.x} cy={sun.y} r={4} fill={c.sun} />
        <Circle cx={ring.x} cy={ring.y} r={2.5} stroke={c.text} strokeWidth={1} strokeOpacity={0.95} fill="none" />
      </Svg>
      <Words text={c.text} rail={!c.minimal} />
    </View>
  );
}

function HeroLookPickerImpl({ value, onChange, testID, ...colors }: Props) {
  const { t } = useTranslation();
  const options: ReadonlyArray<{ key: HeroLook; label: string }> = [
    { key: 'sky', label: t('settings.heroLookSky', 'Painted') },
    { key: 'track', label: t('settings.heroLookTrack', 'Track') },
  ];
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={styles.list}>
      {options.map(o => {
        const selected = value === o.key;
        return (
          <Pressable
            key={o.key}
            testID={testID ? `${testID}-${o.key}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <View style={[styles.frame, { borderColor: selected ? colors.accent : 'transparent' }]}>
              {o.key === 'sky' ? <PaintedPreview {...colors} /> : <TrackPreview {...colors} />}
            </View>
            <Text
              style={[typeStyle('footnote'), styles.label, { color: selected ? colors.text : colors.muted }]}
              numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const HeroLookPicker = memo(HeroLookPickerImpl);

const styles = StyleSheet.create({
  list: { flexDirection: 'row', gap: SPACING.md },
  option: { flex: 1, alignItems: 'center' },
  pressed: { opacity: 0.85 },
  frame: { alignSelf: 'stretch', padding: 3, borderWidth: 2, borderRadius: RADIUS.lg + 3 },
  preview: { height: PREVIEW_H, borderRadius: RADIUS.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  label: { marginTop: SPACING.xs, textAlign: 'center' },
  // The band is drawn at a fixed width and centred, so the picture reads
  // the same in a narrow column and a wide one.
  band: { position: 'absolute', top: 0, alignSelf: 'center' },
  glow: { position: 'absolute', width: 96, height: 96, top: -24, right: -8 },
  sun: { position: 'absolute', width: 10, height: 10, borderRadius: 5, top: 22, right: 36 },
  words: { paddingHorizontal: 10, paddingBottom: 9 },
  eyebrow: { marginBottom: 4 },
  rail: { height: 6, justifyContent: 'center', marginTop: 6, alignSelf: 'stretch' },
  railTrack: { position: 'absolute', left: 0, right: 0, height: 1.5, borderRadius: 1 },
  railHead: { position: 'absolute', width: 6, height: 6, marginLeft: -3, borderRadius: 3 }, // rtl-safe: centred on its `left`, which the rail also sets
});
