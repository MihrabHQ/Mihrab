/**
 * Settings → Widgets, and the ways in.
 *
 * The widget once had a section of its own, lost it when #127 left it a
 * single slider, and sat at the bottom of Appearance. It has a page again
 * now that the prayer-times widget has options of its own (text colour,
 * what is shown, the size of the times), and the page draws a line between
 * the two kinds of setting: what EVERY widget follows, and what only the
 * prayer-times widgets read.
 *
 * The links that point at it are pinned too. The onboarding Ready screen
 * once pointed at a route that was never registered on iOS — the section
 * was Android-only, the row was not — so a first-run tap on "Widgets" did
 * nothing on an iPhone.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const SUBPAGES = read('src/screens/settings/subpages.tsx');
const TYPES = read('src/navigation/types.ts');
const APPEARANCE = read('src/screens/settings/pages/AppearanceSettingsScreen.tsx');
const PAGE = read('src/screens/settings/pages/WidgetsSettingsScreen.tsx');
const CARD = read('src/screens/settings/WidgetCard.tsx');
const PRAYER_CARD = read('src/screens/settings/PrayerWidgetCard.tsx');
const READY = read('src/onboarding/screens/ReadyScreen.tsx');

describe('the widgets have a page of their own', () => {
  it('is on the index and on the stack, on Android only', () => {
    expect(SUBPAGES).toMatch(
      /route: 'SettingsWidgets',[\s\S]{0,200}component: WidgetsSettingsScreen,\s*platforms: \['android'\]/,
    );
    expect(TYPES).toMatch(/\bSettingsWidgets: undefined/);
  });

  it('holds both cards, the general one first', () => {
    const general = PAGE.indexOf('<WidgetCard />');
    const prayer = PAGE.indexOf('<PrayerWidgetCard />');
    expect(general).toBeGreaterThan(-1);
    expect(prayer).toBeGreaterThan(general);
  });

  it('took them off Appearance', () => {
    expect(APPEARANCE).not.toContain('<WidgetCard />');
    expect(APPEARANCE).not.toContain('<PrayerWidgetCard />');
    expect(SUBPAGES).not.toContain('sectionAppearanceBlurbAndroid');
  });
});

describe('the two kinds of setting are told apart', () => {
  it('names the general card as the one every widget follows', () => {
    expect(CARD).toMatch(/title=\{t\('settings\.widgetsAllTitle'/);
  });

  it('says at the top of its own card that it is the prayer-times widget only', () => {
    expect(PRAYER_CARD).toMatch(/title=\{t\('settings\.prayerWidgetTitle'/);
    expect(PRAYER_CARD).toMatch(/styles\.banner[\s\S]{0,400}settings\.prayerWidgetOnly/);
  });

  it('draw nothing off Android', () => {
    expect(CARD).toMatch(/Platform\.OS !== 'android'[\s\S]{0,60}return null/);
    expect(PRAYER_CARD).toMatch(/Platform\.OS !== 'android'\) return null/);
  });
});

describe('the onboarding links land somewhere', () => {
  /** Every settings route the Ready screen offers to open. */
  const linked = [...READY.matchAll(/goTo\('(Settings\w+)'\)/g)].map(m => m[1]);

  it('offers at least the three it promises', () => {
    expect(linked.length).toBeGreaterThanOrEqual(3);
  });

  it('opens only routes the stack actually registers', () => {
    for (const route of linked) {
      expect(SUBPAGES).toContain(`route: '${route}'`);
      expect(TYPES).toMatch(new RegExp(`\\b${route}:`));
    }
  });

  it('sends the widgets row to the Widgets page, and shows it only where that page exists', () => {
    expect(READY).toMatch(/onboarding-ready-widgets[\s\S]{0,200}goTo\('SettingsWidgets'\)/);
    expect(READY).toMatch(
      /Platform\.OS === 'android' \? \([\s\S]{0,300}?onboarding-ready-widgets/,
    );
  });
});
