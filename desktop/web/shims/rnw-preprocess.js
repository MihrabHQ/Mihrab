/**
 * react-native-web's style preprocessing, with `start`/`end` winning over
 * `left`/`right` as they do in React Native.
 *
 * A style can name both: the hero's sky is `absoluteFill` (left: 0,
 * right: 0) plus `start`/`end` set to minus the bleed, so it runs out past
 * the hero's padding to the edges. Yoga lets the logical side win. The
 * browser gets `left`/`right` and `inset-inline-start`/`-end` and lets the
 * physical ones win — so the sky stopped at the content edge, a band of the
 * page on either side of it, and anything else placed this way (the moon,
 * a row's time, the countdown's rail) sat where `left`/`right` put it.
 *
 * Both logical sides given: the physical pair is dropped and the browser
 * resolves start/end against the element's own direction. One given: the
 * physical side it overrides is the app's start side — right in Arabic and
 * Urdu, where the app's root is laid out right-to-left.
 */
import * as base from 'react-native-web/dist/exports/StyleSheet/preprocess.js';

export * from 'react-native-web/dist/exports/StyleSheet/preprocess.js';

const appIsRtl = () =>
  typeof document !== 'undefined' && document.querySelector('#root div[dir="rtl"]') != null;

export function preprocess(style, options) {
  const out = base.preprocess(style, options);
  const s = out.insetInlineStart != null;
  const e = out.insetInlineEnd != null;
  if (!s && !e) return out;
  if (out.left == null && out.right == null) return out;
  if (s && e) {
    delete out.left;
    delete out.right;
    return out;
  }
  const rtl = appIsRtl();
  if (s) delete out[rtl ? 'right' : 'left'];
  else delete out[rtl ? 'left' : 'right'];
  return out;
}

export default preprocess;
