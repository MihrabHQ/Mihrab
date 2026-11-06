/**
 * Today's two faces, offered in the walkthrough by showing them: the full
 * page (the default, so first and chosen until changed) and Minimal. Each
 * is a small picture of Today in the reader's own colours — the sky of
 * the hour under the Sky theme, the page's paper and accent otherwise —
 * and the chosen one wears the accent's ring, as the sky strips beside it
 * do. Drawn with views and native gradients, no bitmaps (skyPaint.ts).
 *
 * The pictures are sketches, not screenshots: lines where the words are,
 * so they read the same in every language and at every text size, and
 * only the countdown in type, because the countdown is what the two
 * faces share and what tells them apart (a line among rows, or the page).
 *
 * Minimal is drawn as it opens (`enteringMinimal`): the Sky theme in its
 * Realistic colours at this hour, and the Track — the day's arc with the
 * horizon across the middle and the path carried on under it, the sun on
 * it, the ring at the next prayer, the stretch between them drawn
 * stronger — over the countdown, the line under it, the footer and the
 * tab bar's icons. Not the reader's current colours: whatever they are,
 * this is what turning Minimal on gives them. The callers pass that sky
 * as `minimalSky`; without it the picture falls back to the page's own.
 */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { linearDown, withAlpha } from '../screens/home/skyPaint';

export type LayoutChoice = 'full' | 'minimal';

type Colors = {
  /** The hero's sky, top to foot. */
  skyTop: string;
  skyFoot: string;
  /** The page under the full face's hero. */
  page: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
};

/** The sky Minimal opens in: the Realistic sky of this hour (a `SkyMood`). */
export type MinimalSky = {
  top: string;
  mid: string;
  foot: string;
  /** The sun's (or by night the moon's) colour. */
  sun: string;
  text: string;
  /** Night: the sun is under the horizon, the ring at the coming Fajr. */
  isDark: boolean;
};

type Props = Colors & {
  /** Minimal's own sky; the page's colours stand in where it is absent. */
  minimalSky?: MinimalSky | null;
  value: LayoutChoice;
  onChange: (v: LayoutChoice) => void;
  testID?: string;
};

const PREVIEW_H = 188;
const COUNTDOWN = '1h 15m';

/** A line of words, as a bar. */
function Line({ w, color, h = 3, style }: { w: number | `${number}%`; color: string; h?: number; style?: object }) {
  return <View style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }, style]} />;
}

function Countdown({ color, size }: { color: string; size: number }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{ color, fontSize: size, fontWeight: '300', letterSpacing: -0.5, includeFontPadding: false }}>
      {COUNTDOWN}
    </Text>
  );
}

/** The day's rail: the line, the passed part in ink, the head. */
function Rail({ ink, at }: { ink: string; at: number }) {
  return (
    <View style={styles.rail}>
      <View style={[styles.railTrack, { backgroundColor: withAlpha(ink, 0.25) }]} />
      <View style={[styles.railTrack, { width: `${at * 100}%`, backgroundColor: ink }]} />
      <View style={[styles.railHead, { left: `${at * 100}%`, backgroundColor: ink }]} />
    </View>
  );
}

function FullPreview(c: Colors) {
  return (
    <View style={[styles.preview, { backgroundColor: c.page }]}>
      <View style={[styles.fullHero, { backgroundImage: linearDown([[c.skyTop, 0], [c.skyFoot, 1]]) }]}>
        <View style={styles.heroTop}>
          <Line w={22} color={withAlpha(c.text, 0.55)} />
          <Line w={14} color={withAlpha(c.text, 0.35)} />
        </View>
        <Line w={26} color={withAlpha(c.text, 0.45)} style={styles.eyebrow} />
        <Countdown color={c.text} size={17} />
        <Rail ink={c.text} at={0.55} />
      </View>
      <View style={styles.dayBar}>
        <Line w={34} color={withAlpha(c.text, 0.6)} />
      </View>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={[styles.row, i === 3 && { backgroundColor: withAlpha(c.accent, 0.12) }]}>
          <View style={[styles.check, { borderColor: withAlpha(c.muted, 0.7) }]} />
          <Line w={i === 1 ? 20 : 26} color={withAlpha(i === 3 ? c.accent : c.text, 0.55)} />
          <View style={styles.flex} />
          <Line w={14} color={withAlpha(i === 3 ? c.accent : c.text, 0.55)} />
        </View>
      ))}
      <View style={styles.flex} />
      <View style={[styles.tabBar, { borderTopColor: c.border }]}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View
            key={i}
            style={[styles.tabIcon, { backgroundColor: i === 0 ? c.accent : withAlpha(c.muted, 0.5) }]}
          />
        ))}
      </View>
    </View>
  );
}

/** "1h 15m" with the units small, as Minimal sets its figures. */
function MinimalCountdown({ color }: { color: string }) {
  const unit = { fontSize: 10, fontWeight: '300' as const };
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{ color, fontSize: 26, fontWeight: '200', letterSpacing: -0.5, includeFontPadding: false }}>
      1<Text style={unit}>h </Text>15<Text style={unit}>m</Text>
    </Text>
  );
}

/** Where the horizon sits, and how far the path runs under it, in the picture's height. */
const HORIZON_AT = 0.38;
const APEX_AT = 0.07;

function MinimalPreview({ sky }: { sky: MinimalSky }) {
  const [w, setW] = useState(0);
  const H = PREVIEW_H;
  const horizon = H * HORIZON_AT;
  const x0 = w * 0.13;
  const x1 = w * 0.87;
  // A quadratic whose top is at APEX_AT: the control point is twice as
  // far above the horizon as the apex.
  const cy = 2 * H * APEX_AT - horizon;
  const at = (s: number) => {
    const u = 1 - s;
    return { x: u * u * x0 + 2 * u * s * (w / 2) + s * s * x1, y: u * u * horizon + 2 * u * s * cy + s * s * horizon };
  };
  const path = (from: number, to: number, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => at(from + ((to - from) * i) / n))
      .map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
      .join(' ');
  // By day the sun a third of the way along and the ring at the top
  // (Dhuhr); by night the sun under the horizon and the ring where it
  // will rise.
  const sunAt = sky.isDark ? -0.07 : 0.3;
  const ringAt = sky.isDark ? 0 : 0.5;
  const sun = at(sunAt);
  const ring = at(ringAt);
  const ink = sky.text;
  return (
    <View
      onLayout={e => setW(e.nativeEvent.layout.width)}
      style={[styles.preview, { backgroundImage: linearDown([[sky.top, 0], [sky.mid, 0.62], [sky.foot, 1]]) }]}>
      {w > 0 ? (
        <Svg width={w} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* The night's share of the path, under the horizon, faint. */}
          <Path d={path(-0.16, 0, 6)} stroke={ink} strokeWidth={0.75} strokeOpacity={0.25} fill="none" />
          <Path d={path(1, 1.16, 6)} stroke={ink} strokeWidth={0.75} strokeOpacity={0.25} fill="none" />
          <Path d={path(0, 1)} stroke={ink} strokeWidth={0.75} strokeOpacity={0.45} fill="none" />
          <Path
            d={path(Math.min(sunAt, ringAt), Math.max(sunAt, ringAt), 8)}
            stroke={ink}
            strokeWidth={1.25}
            strokeOpacity={0.8}
            fill="none"
            strokeLinecap="round"
          />
          <SvgLine x1={0} y1={horizon} x2={w} y2={horizon} stroke={ink} strokeWidth={0.75} strokeOpacity={0.35} />
          <Circle cx={sun.x} cy={sun.y} r={4.5} fill={sky.sun} />
          <Circle cx={ring.x} cy={ring.y} r={2.5} stroke={ink} strokeWidth={1} strokeOpacity={0.9} fill="none" />
        </Svg>
      ) : null}
      <View style={styles.minimalMiddle}>
        <MinimalCountdown color={ink} />
        <Line w={34} color={withAlpha(ink, 0.5)} style={styles.minimalName} />
      </View>
      <View style={[styles.chevron, { borderColor: withAlpha(ink, 0.45) }]} />
      <Line w={50} color={withAlpha(ink, 0.4)} style={styles.footer} />
      <View style={styles.tabs}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={[styles.tabIcon, { backgroundColor: withAlpha(ink, i === 0 ? 0.85 : 0.35) }]} />
        ))}
      </View>
    </View>
  );
}

function LayoutPickerImpl({ value, onChange, testID, minimalSky, ...colors }: Props) {
  const { t } = useTranslation();
  const options: ReadonlyArray<{ key: LayoutChoice; label: string }> = [
    { key: 'full', label: t('onboarding.personalise.layoutFull', 'Full') },
    { key: 'minimal', label: t('settings.minimalUi', 'Minimal') },
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
              {o.key === 'full' ? (
                <FullPreview {...colors} />
              ) : (
                <MinimalPreview
                  sky={
                    minimalSky ?? {
                      top: colors.skyTop,
                      mid: colors.skyFoot,
                      foot: colors.page,
                      sun: colors.accent,
                      text: colors.text,
                      isDark: false,
                    }
                  }
                />
              )}
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

export const LayoutPicker = memo(LayoutPickerImpl);

const styles = StyleSheet.create({
  list: { flexDirection: 'row', gap: SPACING.md },
  option: { flex: 1, alignItems: 'center' },
  pressed: { opacity: 0.85 },
  frame: { alignSelf: 'stretch', padding: 3, borderWidth: 2, borderRadius: RADIUS.lg + 3 },
  preview: { height: PREVIEW_H, borderRadius: RADIUS.lg, overflow: 'hidden' },
  label: { marginTop: SPACING.xs, textAlign: 'center' },
  flex: { flex: 1 },
  fullHero: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 9 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  eyebrow: { marginBottom: 4 },
  rail: { height: 6, justifyContent: 'center', marginTop: 6, alignSelf: 'stretch' },
  railTrack: { position: 'absolute', left: 0, right: 0, height: 1.5, borderRadius: 1 },
  railHead: { position: 'absolute', width: 6, height: 6, marginLeft: -3, borderRadius: 3 }, // rtl-safe: centred on its `left`, which the rail also sets
  dayBar: { alignItems: 'center', paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 15 },
  check: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabIcon: { width: 6, height: 6, borderRadius: 1.5 },
  // Minimal: the figures a little under the middle, as Today sets them
  // under the Track, the footer and the tab bar's icons at the foot.
  minimalMiddle: {
    position: 'absolute',
    top: PREVIEW_H * 0.56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  minimalName: { marginTop: 6 },
  chevron: {
    position: 'absolute',
    bottom: 31,
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  footer: { position: 'absolute', bottom: 22, alignSelf: 'center' },
  tabs: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 9,
  },
});
