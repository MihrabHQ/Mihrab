/**
 * "Rate Mihrab" — distribution-aware review prompt.
 *
 *   iOS            → the App Store's own "Write a Review" page for the app.
 *                    This is a button, and Apple's in-app sheet
 *                    (SKStoreReviewController, the native RateApp module)
 *                    is rationed by the system: past a few showings a year
 *                    it silently shows nothing, which on a button reads as
 *                    a button that does nothing. Apple's guidance for a
 *                    rating button is this link. The sheet stays as the
 *                    fallback for a device that cannot open the store.
 *   Android play   → Play Store listing deep link (market://, with an
 *                    https fallback for devices without the Play app).
 *   Android fdroid → the project's GitHub page — F-Droid has no ratings,
 *                    so stars/issues are the equivalent signal. Keeps the
 *                    F-Droid build 100% Google-free.
 *   Android github → the same GitHub page. The Releases APK is what
 *                    Obtainium installs, often on a phone with no Play
 *                    Store, and it is not the Play listing's install.
 */
import { Linking, NativeModules, Platform } from 'react-native';
import { getAndroidDistribution } from '../distribution';

const PLAY_MARKET_URL = 'market://details?id=com.prayer_times';
const PLAY_WEB_URL =
  'https://play.google.com/store/apps/details?id=com.prayer_times';
const GITHUB_URL = 'https://github.com/MihrabHQ/Mihrab';
/** The App Store listing's id — the one in the README's badge. */
const APP_STORE_ID = '6762085256';
const APP_STORE_REVIEW_URL = `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const APP_STORE_REVIEW_WEB_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;

/** Where a rating goes from this build — what the button should say. */
export type RatingDestination = 'appStore' | 'play' | 'github';

export function ratingDestination(): RatingDestination {
  if (Platform.OS === 'ios') return 'appStore';
  return getAndroidDistribution() === 'play' ? 'play' : 'github';
}

type RateAppNative = { requestReview?: () => void };

export async function rateApp(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      await Linking.openURL(APP_STORE_REVIEW_URL);
      return;
    } catch {
      // No App Store app (a Mac without it, a restricted device): the web
      // listing, and failing that Apple's in-app sheet.
    }
    try {
      await Linking.openURL(APP_STORE_REVIEW_WEB_URL);
      return;
    } catch {
      const native = NativeModules.RateApp as RateAppNative | undefined;
      native?.requestReview?.();
    }
    return;
  }

  if (getAndroidDistribution() !== 'play') {
    await Linking.openURL(GITHUB_URL).catch(() => undefined);
    return;
  }

  try {
    await Linking.openURL(PLAY_MARKET_URL);
  } catch {
    await Linking.openURL(PLAY_WEB_URL).catch(() => undefined);
  }
}
