import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useSkyTheme } from '../theme/skyTheme';
import { mixHexOklab, PALETTE_STEPS, skyMoodFor } from '../theme/skyMoods';
import { SPACING } from '../theme/tokens';

/**
 * The strip behind the system status bar, on a page that has no title bar
 * to cover it.
 *
 * ── WHY ───────────────────────────────────────────────────────────────
 *
 * No tab draws a header any more, and the app is edge to edge, so a tab's
 * content owns the window from the very top down. At rest that is fine —
 * every tab pads its content clear of the status bar. Scroll, though, and
 * whatever is at the top of the page rides up behind the clock and the
 * status icons and is drawn straight through them: reported first on
 * Today, where the location chip crossed the clock, and then on every
 * other tab and the pages inside them.
 *
 * ── WHY IT IS ALWAYS THERE, AND NOT A FADE ────────────────────────────
 *
 * On these pages the strip already IS the page's colour: the content
 * starts below it. So a band of exactly that colour is invisible at rest
 * — there is nothing for it to fade in from — and the only thing it ever
 * does is hide what scrolls under it. That buys the fix without wiring a
 * scroll offset through six screens and the pages inside them, and
 * without a frame of the wrong colour on any of them.
 *
 * ── UNDER THE SKY THEME, A BREATH OF SKY ──────────────────────────────
 *
 * The hour lived in one view on one screen — the hero — and every other
 * tab opened on a flat page (2.33). Under the Sky theme the strip is a
 * sliver of the hour's sky instead: the mood's own top colour under the
 * status bar, running into the page over the page's own top padding, so
 * it ends exactly where the content begins and nothing is drawn over the
 * content. The same mood the palette wears, so it moves with the hour
 * and turns with the page at sunrise and Maghrib; the reader, the duas
 * and the translations are not tabs and carry none of it.
 *
 * Today is the exception and does not use this: its sky runs up under the
 * status bar on purpose and nothing is drawn over it there
 * (`HomeStatusBand` only sets the glyphs' ink).
 *
 * The pushed subpages do not use it either: they carry a real header,
 * which is the surface that covers the strip there.
 */
export function StatusBarBand({ color }: { color: ColorValue }) {
  const insets = useSafeAreaInsets();
  const { settings } = usePrayerSettings();
  const skyOn = settings.appearance === 'sky';
  const sky = useSkyTheme(skyOn);
  // Nothing to cover on a window with no status bar over it — a Mac, or a
  // phone in landscape on some platforms.
  if (insets.top <= 0) return null;
  if (!skyOn) {
    return <View pointerEvents="none" style={[styles.band, { height: insets.top, backgroundColor: color }]} />;
  }
  const mood = skyMoodFor(sky.passage, sky.t, PALETTE_STEPS, undefined, sky.light);
  const height = insets.top + SPACING.md;
  // The sky's top, then its colour halfway to the page, then the page.
  const mid = mixHexOklab(mood.heroTop, mood.bg, 0.55);
  return (
    <View pointerEvents="none" style={[styles.band, { height }]}>
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="skycap" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={mood.heroTop} />
            <Stop offset={insets.top / height} stopColor={mid} />
            <Stop offset="1" stopColor={mood.bg} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#skycap)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    // Over the page, and over nothing else: the tab bar is at the other
    // end of the window and a modal is a window of its own.
    zIndex: 2,
  },
});
