import { useEffect, useState } from 'react';
import { Animated, StatusBar } from 'react-native';
import { INK_SWITCH_LUMINANCE, luminance } from './skyModel';
import { useHeroSkyBand } from './heroSkyBand';
import { SPACING } from '../../theme/tokens';

/**
 * The status bar's glyphs on the phone's Today screen, once the page has
 * scrolled past the sky.
 *
 * NOTHING IS DRAWN BEHIND THE STATUS BAR. The sky runs up under the clock
 * and the battery, and the page scrolls up under them too. A strip used to
 * appear there on scroll, coloured to match the sky under its foot; it
 * could only match a two-stop gradient, and the hero's sky has a middle
 * stop and the sun's glow, so on a larger display size it showed as a slab
 * of another colour across the top of the sky (2.28). It is gone.
 *
 * What stays is the ink: while the sky is under the glyphs the hero sets
 * them from the sky it draws (TodayCard); once the page is what they sit
 * on, they take the page's — without that, a night sky in a light app left
 * white glyphs on a white page.
 */
export function HomeStatusBand({
  scrollY,
  insetTop,
  pageColor,
}: {
  /** The Today page's scroll offset, in dp. */
  scrollY: Animated.Value;
  /** The status bar's height. */
  insetTop: number;
  /** What the page under the hero is coloured. */
  pageColor: string;
}) {
  const sky = useHeroSkyBand();
  const [overPage, setOverPage] = useState(false);

  /** The scroll at which the status bar leaves the sky for the page. */
  const skyGone = Math.max(SPACING.md + 1, (sky?.skyH ?? 0) - insetTop);

  useEffect(() => {
    if (!sky) {
      setOverPage(false);
      return;
    }
    const id = scrollY.addListener(({ value }) => {
      setOverPage(value >= skyGone);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, skyGone, sky]);

  // Only once the page is what the glyphs sit on. Before that the hero owns
  // the bar, from the sky it is drawing — see TodayCard.
  if (!sky || insetTop <= 0 || !overPage) return null;
  return (
    <StatusBar
      barStyle={
        luminance(pageColor) < INK_SWITCH_LUMINANCE
          ? 'light-content'
          : 'dark-content'
      }
      animated
    />
  );
}
