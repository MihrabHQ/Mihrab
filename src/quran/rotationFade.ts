/**
 * THE ROTATION FADE — after a turn of the phone, the page fades back in.
 *
 * A rotation already hides the page: the pager's item width changes at
 * once and its offset a frame later, so both readers cover it in the page
 * colour until the two agree again (`phoneGeometryFits`,
 * `spreadGeometryFits`, and readerRotationCover.test.ts). That cover was
 * a cut at both ends. It had to be at the start — the old layout is
 * wrong the moment the window turns, and the platform has already shown
 * its stretched frame before any of our code runs. But at the end it only
 * had to be SOMETHING, and a cut there read as the page arriving late:
 * the window turned, went blank, and then the page was simply there.
 * Nothing was wrong with it; it just looked choppy.
 *
 * So the end is the fullscreen veil's end (`fullscreenVeil.ts`): once the
 * new geometry fits, give the page a frame or two to draw at it, and fade
 * the page colour away over it. One vocabulary for "the page changed
 * shape": fullscreen and rotation both come back the same way.
 *
 * The hard cover stays, and this sits on top of it. The cover is mounted
 * in the same commit that stops the pages drawing, which an Animated value
 * set from an effect cannot promise; so this is raised while the cover is
 * up — there is a hundred milliseconds of quiet before the geometry
 * settles, far longer than it takes to reach the native side — and is
 * already opaque when the cover unmounts. The fade is all this does.
 *
 * NOT ON OPENING. The first geometry is not a rotation: the reader is
 * arriving under the push transition, and the page appears as it always
 * has. Only a cover after a page has been shown fades out.
 */
import { useLayoutEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { VEIL_OUT_MS, VEIL_SETTLE_MS } from './fullscreenVeil';

/**
 * The opacity of a sheet of page colour over the pager: 1 while `covered`
 * (after the first page), fading to 0 once it is not.
 */
export function useRotationFade(covered: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(0)).current;
  /** Has a page been shown yet? Until it has, a cover is the opening. */
  const shown = useRef(false);

  useLayoutEffect(() => {
    if (covered) {
      if (shown.current) {
        opacity.stopAnimation();
        opacity.setValue(1);
      }
      return undefined;
    }
    if (!shown.current) {
      shown.current = true;
      return undefined;
    }
    // The geometry fits again: one or two frames for the page to draw at
    // it, then the fade. Re-covered in the meantime (a second turn, a
    // window still being dragged) and the timer goes with the effect.
    const id = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: VEIL_OUT_MS,
        useNativeDriver: true,
      }).start();
    }, VEIL_SETTLE_MS);
    return () => clearTimeout(id);
  }, [covered, opacity]);

  return opacity;
}
