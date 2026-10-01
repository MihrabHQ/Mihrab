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
 *                    so stars/issues are the equivalent signal — and, as
 *                    a second choice on the rating page, the Play listing
 *                    (`ratingPlaces`). Both are plain links: the build
 *                    stays free of any Google library.
 *   Android github → the same two. The Releases APK is what Obtainium
 *                    installs, often on a phone with no Play Store, and it
 *                    is not the Play listing's install.
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

/** A place a rating can be left. */
export type RatingPlace = 'appStore' | 'play' | 'github';

/**
 * Where to ask for a rating from this build, most useful first.
 *
 * The builds outside Google Play — F-Droid, and the GitHub APK that
 * Obtainium installs — are offered Google Play FIRST and GitHub second.
 * Many of the people on them still have a Google account, and the Play
 * listing is where most people find the app: a rating there helps it
 * whichever store the rater installed from. GitHub has no ratings; a
 * star is its nearest equivalent and the signal open-source users read.
 */
export function ratingPlaces(): RatingPlace[] {
  if (Platform.OS === 'ios') return ['appStore'];
  return getAndroidDistribution() === 'play' ? ['play'] : ['play', 'github'];
}

type RateAppNative = { requestReview?: () => void };

async function openAppStoreReview(): Promise<void> {
  try {
    await Linking.openURL(APP_STORE_REVIEW_URL);
    return;
  } catch {
    // No App Store app (a Mac without it, a restricted device): the web
    // listing, and failing that Apple's in-app sheet.
  }
  try {
    await Linking.openURL(APP_STORE_REVIEW_WEB_URL);
  } catch {
    const native = NativeModules.RateApp as RateAppNative | undefined;
    native?.requestReview?.();
  }
}

/**
 * The Play listing. `market://` opens the Play Store app where there is
 * one; a phone without it — common on F-Droid and Obtainium builds, and
 * not a Google dependency of this build either way: it is only a link —
 * gets the web listing, where a signed-in browser can rate as well.
 */
async function openPlayListing(): Promise<void> {
  try {
    await Linking.openURL(PLAY_MARKET_URL);
  } catch {
    await Linking.openURL(PLAY_WEB_URL).catch(() => undefined);
  }
}

export async function openRatingPlace(place: RatingPlace): Promise<void> {
  if (place === 'appStore') return openAppStoreReview();
  if (place === 'play') return openPlayListing();
  await Linking.openURL(GITHUB_URL).catch(() => undefined);
}

/**
 * The one-button version: the App Store on iOS, the Play listing on the
 * Play build, GitHub on the others (the rating page offers Play to those
 * as well, as its own row).
 */
export async function rateApp(): Promise<void> {
  if (Platform.OS === 'ios') return openRatingPlace('appStore');
  return openRatingPlace(getAndroidDistribution() === 'play' ? 'play' : 'github');
}
