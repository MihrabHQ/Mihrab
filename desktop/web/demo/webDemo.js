/**
 * src/config/webDemo.ts as the website demo has it — swapped in by
 * desktop/webpack.config.js when built with `--env demo`.
 */
/* global __MIHRAB_DEMO_BASE__ */
export const IS_WEB_DEMO = true;
export const WEB_BASE_PATH = __MIHRAB_DEMO_BASE__;
export const WEB_DEMO_RECITER_ID = 'husary';
/** A touch screen the size of a phone: the phone's page, not the desktop's. */
export const WEB_DEMO_PHONE =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches === true &&
  Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) < 600;
