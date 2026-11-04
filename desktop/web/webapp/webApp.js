/**
 * src/config/webApp.ts as Mihrab Web has it — swapped in by
 * desktop/webpack.config.js when built with `--env web`.
 */
/* global __MIHRAB_WEB_BASE__ */
export const IS_WEB_APP = true;
export const WEB_BASE_PATH = __MIHRAB_WEB_BASE__;
export const WEB_APP_RECITER_ID = 'husary';
/**
 * A phone: the phone's page, not the desktop's. A touch screen the size of
 * one — or a phone's browser saying so, since not every phone answers the
 * pointer query with `coarse` (Android's WebView, some in-app browsers).
 */
export const WEB_APP_PHONE = (() => {
  if (typeof window === 'undefined') return false;
  const small = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) < 600;
  const touch = window.matchMedia?.('(pointer: coarse)').matches === true || navigator.maxTouchPoints > 0;
  const phoneUa = /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent);
  return phoneUa || (touch && small);
})();

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const touchMac = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);

/** The browser's own pieces Mihrab Web uses (see src/config/webApp.ts). */
export const webApp = {
  platform: () =>
    /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : 'other',
  standalone: () =>
    window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true,
  // index.js holds the event from page load: it fires once, before the app is up.
  canInstall: () => window.__mihrabInstallPrompt != null,
  install: async () => {
    const prompt = window.__mihrabInstallPrompt;
    if (!prompt) return false;
    window.__mihrabInstallPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    return choice?.outcome === 'accepted';
  },
  keepStorage: () => {
    void navigator.storage?.persist?.().catch(() => undefined);
  },
};
