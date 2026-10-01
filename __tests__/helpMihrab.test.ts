/**
 * Settings → About → Help Mihrab: rate, tell people, share the month.
 *
 * What it must get right: the page hangs off About; the rating button
 * says where it goes and goes there (the App Store's review page on iOS,
 * not the rationed in-app sheet that can silently show nothing); the
 * month row opens the month screen on its printable sheet.
 */
import { readFileSync } from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');

const load = (os: 'ios' | 'android', distribution?: string, failFirst = 0) => {
  jest.resetModules();
  let calls = 0;
  const openURL = jest.fn(() =>
    calls++ < failFirst ? Promise.reject(new Error('no handler')) : Promise.resolve(),
  );
  const requestReview = jest.fn();
  jest.doMock('react-native', () => ({
    Platform: { OS: os },
    NativeModules: {
      PrayerBuildInfo: distribution ? { distribution } : undefined,
      RateApp: { requestReview },
    },
    Linking: { openURL },
  }));
  const mod = require('../src/polish/rateApp');
  return { ...mod, openURL, requestReview };
};

describe('where a rating goes', () => {
  it.each([
    ['ios', undefined, 'appStore'],
    ['android', 'play', 'play'],
    ['android', 'github', 'github'],
    ['android', 'fdroid', 'github'],
  ] as const)('%s %s → %s', (os, dist, expected) => {
    expect(load(os, dist).ratingDestination()).toBe(expected);
  });

  it('opens the App Store review page on iOS', async () => {
    const { rateApp, openURL, requestReview } = load('ios');
    await rateApp();
    expect(openURL).toHaveBeenCalledWith(
      'itms-apps://itunes.apple.com/app/id6762085256?action=write-review',
    );
    expect(requestReview).not.toHaveBeenCalled();
  });

  it('falls back to the web listing, then to the in-app sheet', async () => {
    const web = load('ios', undefined, 1);
    await web.rateApp();
    expect(web.openURL).toHaveBeenLastCalledWith(
      'https://apps.apple.com/app/id6762085256?action=write-review',
    );
    expect(web.requestReview).not.toHaveBeenCalled();

    const sheet = load('ios', undefined, 2);
    await sheet.rateApp();
    expect(sheet.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe('the page', () => {
  const subpages = read('src/screens/settings/subpages.tsx');
  const page = read('src/screens/settings/pages/HelpMihrabSettingsScreen.tsx');

  it('hangs off About, before the attributions', () => {
    const about = subpages.slice(subpages.indexOf("route: 'SettingsAbout'"));
    const help = about.indexOf("route: 'SettingsHelpMihrab'");
    expect(help).toBeGreaterThan(0);
    expect(help).toBeLessThan(about.indexOf("route: 'SettingsAttributions'"));
  });

  it('is the only rating button — About no longer carries its own', () => {
    expect(read('src/screens/settings/AboutCard.tsx')).not.toMatch(/rateApp\(/);
    expect(page).toMatch(/rateApp\(\)/);
  });

  it('shares the website, and opens the month on its sheet', () => {
    expect(page).toMatch(/MIHRAB_WEBSITE/);
    expect(page).toMatch(/navigate\('MonthTimes', \{ share: true \}\)/);
    expect(read('src/screens/MonthTimesScreen.tsx')).toMatch(
      /useState\(route\.params\?\.share === true\)/,
    );
  });

  it('has its words in every language', () => {
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const json = JSON.parse(read(`src/i18n/locales/${l}.json`));
      expect(json.settings.helpMihrab).toBeTruthy();
      expect(json.helpMihrab.shareMessage).toContain('{{url}}');
    }
  });
});
