/**
 * THE ROTATION FADE — after a turn of the phone, the page fades back in.
 *
 * A rotation already hides the page: the pager's item width changes at
 * once and its offset a frame later, so both readers cover it in the page
 * colour until the two agree again (`phoneGeometryFits`,
 * `spreadGeometryFits`, and readerRotationCover.test.tsx). That cover was
 * a cut at both ends, and at the end a cut read as the page arriving late:
 * the window turned, went blank, and then the page was simply there.
 *
 * So the end is the fullscreen veil's end (`fullscreenVeil.ts`): once the
 * new geometry fits, give the page a frame or two to draw at it, and fade
 * the page colour away over it. One vocabulary for "the page changed
 * shape": fullscreen and rotation both come back the same way.
 *
 * ── AND THE START IS THE PLATFORM'S, WHERE IT CAN BE ─────────────────
 *
 * The first version of this was all React, and tried on a phone it came in
 * late (2026-09-28): the platform resizes the window and draws the old
 * layout into the new shape — page stretched, rail the wrong width —
 * before JavaScript even learns the new size, so the choppy frames showed
 * and THEN the cover went up. No JavaScript can be earlier than that.
 *
 * So on Android and iOS the reader ARMS a native cover with its page
 * colour (`src/native/RotationCover.ts`), and the platform raises it over
 * the whole window at the turn itself — inside the configuration change
 * on Android, in `viewWillTransition` on iOS, before either draws or
 * animates anything at the new size. This hook then only says when it
 * comes down: the same moment, and the same fade, as before.
 *
 * The React sheet stays for everything the platform does not cover: the
 * Mac, whose window is resized rather than turned; a window that changes
 * size without turning; and a build without the native half. For those it
 * is raised while the reader's own hard cover is up — there is a hundred
 * milliseconds of quiet before the geometry settles, far longer than it
 * takes to reach the native side — so it is already opaque when the hard
 * cover unmounts, and fades from there.
 *
 * NOT ON OPENING. The first geometry is not a rotation: the reader is
 * arriving under the push transition, and the page appears as it always
 * has. Only a cover after a page has been shown fades out.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { VEIL_OUT_MS, VEIL_SETTLE_MS } from './fullscreenVeil';
import {
  armRotationCover,
  disarmRotationCover,
  liftRotationCover,
  rotationCoverAvailable,
} from '../native/RotationCover';

export type RotationFadeInput = {
  /** The reader's own cover is up: its geometry does not fit the window. */
  covered: boolean;
  /** The window is wider than it is tall. */
  landscape: boolean;
  /** The page colour, which is what either cover is painted in. */
  color: string;
  /** The reader is in front — the only time the platform cover is armed. */
  active: boolean;
};

/**
 * The opacity of the React sheet over the pager, and the lift of the
 * platform's. See the note at the top of this file.
 */
export function useRotationFade({
  covered,
  landscape,
  color,
  active,
}: RotationFadeInput): Animated.Value {
  const opacity = useRef(new Animated.Value(0)).current;
  /** Has a page been shown yet? Until it has, a cover is the opening. */
  const shown = useRef(false);
  /** Which way up the window was when a page was last shown. */
  const shownLandscape = useRef(landscape);
  /** Whether the React sheet went up for the cover now in progress. */
  const sheetUp = useRef(false);

  // The platform raises its cover only while this reader is in front, and
  // in this reader's colour.
  useEffect(() => {
    if (!active) return undefined;
    armRotationCover(color);
    return disarmRotationCover;
  }, [active, color]);

  useLayoutEffect(() => {
    if (covered) {
      if (!shown.current) return undefined;
      // A turn is the platform's to cover, where it can; anything else,
      // and anywhere it cannot, is ours.
      const turned = landscape !== shownLandscape.current;
      if (!(turned && rotationCoverAvailable())) {
        sheetUp.current = true;
        opacity.stopAnimation();
        opacity.setValue(1);
      }
      return undefined;
    }
    shownLandscape.current = landscape;
    if (!shown.current) {
      shown.current = true;
      return undefined;
    }
    // The geometry fits again: one or two frames for the page to draw at
    // it, then the fade. Re-covered in the meantime (a second turn, a
    // window still being dragged) and the timer goes with the effect.
    const id = setTimeout(() => {
      // A no-op when the platform raised nothing.
      liftRotationCover(VEIL_OUT_MS);
      if (sheetUp.current) {
        sheetUp.current = false;
        Animated.timing(opacity, {
          toValue: 0,
          duration: VEIL_OUT_MS,
          useNativeDriver: true,
        }).start();
      }
    }, VEIL_SETTLE_MS);
    return () => clearTimeout(id);
  }, [covered, landscape, opacity]);

  return opacity;
}
