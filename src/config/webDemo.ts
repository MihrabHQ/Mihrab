/**
 * The website's demo — the app built for a browser.
 *
 * Every Qur'an asset is already in place there (the muṣḥaf's page fonts,
 * the tajwīd colours, the four riwāyāt, the hard-word meanings, one
 * reciter's word timings), served beside the page, so the download
 * manager has nothing to manage and is not shown, and the one reciter
 * whose words are timed is the only one offered.
 *
 * This file is what every app build gets. The demo build swaps it for
 * `desktop/web/demo/webDemo.js` (desktop/webpack.config.js, `--env demo`),
 * so nothing here can switch the demo on in a phone or desktop app.
 */
export const IS_WEB_DEMO: boolean = false;

/**
 * The path the demo is served under (`/mihrab-demo` on GitHub Pages), so
 * the app's own paths — `/quran`, `/settings` — sit beneath it. Empty
 * everywhere else.
 */
export const WEB_BASE_PATH: string = '';

/**
 * The demo opened on a phone (a touch screen, phone-sized): shown the
 * phone's page rather than the desktop's. False everywhere else.
 */
export const WEB_DEMO_PHONE: boolean = false;

/** The reciter the demo carries word timings for, and so offers alone. */
export const WEB_DEMO_RECITER_ID: string = 'husary';
