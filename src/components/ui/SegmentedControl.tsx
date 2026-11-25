import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * SegmentedControl — one container, several segments, one selected
 * (docs/design/redesign-plan.md §2.7).
 *
 * Replaces the three-outlined-buttons pattern (Appearance's Theme and
 * Time format rows) and the hand-rolled segment on the Quran tab. The
 * container is the control's recessed track; the selected segment is a
 * surface set into it, with the page's ink for its label; the rest are
 * plain, in `muted`. Equal widths, because a segmented control is a
 * choice between peers.
 *
 * ── WHY THE SELECTED SEGMENT IS NOT THE LIGHT ACCENT ANY MORE ──────────
 *
 * It was `accentBg` on `controlBg`, with the label in the accent. Both
 * are a light tint of the same ground: under the Sky theme the fill
 * stood under 1.2 : 1 from its track at every hour of the day (1.00–1.03
 * in the default variant), and at night the accent label stood 1.2 : 1
 * from the muted one beside it. On a phone at night neither side of
 * "Learn | Look up" looked chosen.
 *
 * Now the fill is the surface furthest from the track on each polarity —
 * the page's ground in the dark, the card in the light — with a hairline,
 * and the label is `text` against `muted`, which is the difference the
 * eye actually reads. No accent: a page can
 * stack three of these (Appearance), and three lit segments would be the
 * loudest thing on it. `__tests__/segmentedControlVisible.test.ts` holds
 * both floors on every palette the app can build.
 */
export type Segment<K extends string> = { key: K; label: string; accessibilityLabel?: string };

type Props<K extends string> = {
  segments: ReadonlyArray<Segment<K>>;
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  testID?: string;
};

function SegmentedControlImpl<K extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: Props<K>) {
  const { palette, isDark } = useAppPalette();
  const chosen = [cardEdgeStyle(palette), { backgroundColor: selectedSegmentFill(palette, isDark) }];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.track, { backgroundColor: palette.controlBg }]}>
      {segments.map(seg => {
        const selected = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={seg.accessibilityLabel ?? seg.label}
            onPress={() => onChange(seg.key)}
            style={[styles.segment, selected && chosen]}>
            <Text
              style={[
                typeStyle('headline'),
                styles.label,
                { color: selected ? palette.text : palette.muted },
              ]}
              numberOfLines={1}
              // Last resort for a long word in a narrow window: shrink the
              // type a little rather than cut the word.
              adjustsFontSizeToFit
              minimumFontScale={0.85}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const SegmentedControl = memo(SegmentedControlImpl) as typeof SegmentedControlImpl;

/** The selected segment's surface: the one that stands furthest from `controlBg`. */
export function selectedSegmentFill<P extends { bg: unknown; card: unknown }>(palette: P, isDark: boolean): P['bg'] | P['card'] {
  return isDark ? palette.bg : palette.card;
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
    gap: 2,
  },
  segment: {
    // Grow from the label's own width, not from zero: three equal thirds
    // clipped "Bookmarks" to "Bookmar…" beside "Juz" on a phone. Each
    // segment takes what its word needs and the spare is shared evenly.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 38,
    borderRadius: RADIUS.md - 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  label: { textAlign: 'center' },
});
