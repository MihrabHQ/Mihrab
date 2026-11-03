/**
 * Mihrab Web — the app built for a browser (mihrabhq.github.io).
 *
 * Every Qur'an asset is already in place there (the muṣḥaf's page fonts,
 * the tajwīd colours, the four riwāyāt, the hard-word meanings, one
 * reciter's word timings), served beside the page, so the download
 * manager has nothing to manage and is not shown, and the one reciter
 * whose words are timed is the only one offered.
 *
 * This file is what every app build gets. The web build swaps it for
 * `desktop/web/webapp/webApp.js` (desktop/webpack.config.js, `--env web`),
 * so nothing here can switch the web app on in a phone or desktop app.
 */
export const IS_WEB_APP: boolean = false;

/**
 * A path the web app is served under, when it is not the site's root, so
 * the app's own paths — `/quran`, `/settings` — sit beneath it. Empty
 * everywhere else.
 */
export const WEB_BASE_PATH: string = '';

/**
 * The web app opened on a phone (a touch screen, phone-sized): shown the
 * phone's page rather than the desktop's. False everywhere else.
 */
export const WEB_APP_PHONE: boolean = false;

/** The reciter the web app carries word timings for, and so offers alone. */
export const WEB_APP_RECITER_ID: string = 'husary';

/** Where the visitor is reading from, for how to keep the page close. */
export type WebPlatform = 'ios' | 'android' | 'mac' | 'other';

/** The browser's own pieces Mihrab Web uses. Inert everywhere else. */
export const webApp = {
  platform: (): WebPlatform => 'other',
  /** Opened from the home screen or as an installed app, not in a tab. */
  standalone: (): boolean => false,
  /** The browser has offered to install the page (Chrome, Edge). */
  canInstall: (): boolean => false,
  /** Show the browser's install dialog; true when the visitor accepted. */
  install: async (): Promise<boolean> => false,
  /** Ask the browser not to clear this site's storage under pressure. */
  keepStorage: (): void => undefined,
};
