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
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { linearDown, radialGlow, withAlpha } from '../screens/home/skyPaint';

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

type Props = Colors & {
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

function MinimalPreview(c: Colors) {
  return (
    <View
      style={[styles.preview, { backgroundImage: linearDown([[c.skyTop, 0], [c.skyFoot, 0.72], [c.page, 1]]) }]}>
      {/* The hour's light, where Today's sun stands of a morning. */}
      <View style={[styles.glow, { backgroundImage: radialGlow(c.skyFoot, 0.9) }]} />
      <View style={styles.minimalMiddle}>
        <Countdown color={c.text} size={24} />
        <Line w={30} color={withAlpha(c.text, 0.5)} style={styles.minimalName} />
        <Rail ink={c.text} at={0.55} />
      </View>
      <Line w={44} color={withAlpha(c.text, 0.4)} style={styles.footer} />
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={[styles.dot, { backgroundColor: withAlpha(c.text, i === 0 ? 0.85 : 0.28) }]} />
        ))}
      </View>
    </View>
  );
}

function LayoutPickerImpl({ value, onChange, testID, ...colors }: Props) {
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
              {o.key === 'full' ? <FullPreview {...colors} /> : <MinimalPreview {...colors} />}
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
  glow: { position: 'absolute', width: 120, height: 120, top: -30, right: -30 },
  minimalMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingTop: 16 },
  minimalName: { marginTop: 5 },
  footer: { alignSelf: 'center', marginBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
