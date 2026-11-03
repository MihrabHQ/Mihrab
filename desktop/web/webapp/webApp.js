/**
 * src/config/webApp.ts as Mihrab Web has it — swapped in by
 * desktop/webpack.config.js when built with `--env web`.
 */
/* global __MIHRAB_WEB_BASE__ */
export const IS_WEB_APP = true;
export const WEB_BASE_PATH = __MIHRAB_WEB_BASE__;
export const WEB_APP_RECITER_ID = 'husary';
/** A touch screen the size of a phone: the phone's page, not the desktop's. */
export const WEB_APP_PHONE =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches === true &&
  Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) < 600;

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
