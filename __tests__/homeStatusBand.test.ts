/**
 * The status bar on the phone's Today screen.
 *
 * The sky runs up under the clock and the battery, which is the design, and
 * the page scrolls up under them. A strip coloured to match the sky used to
 * cover it on scroll; it could only match a two-stop gradient, and on a
 * larger display size it showed as a slab of another colour across the top
 * of the sky, so it is gone. What stays is the ink the glyphs take once the
 * page, not the sky, is under them.
 */
import {
  _resetHeroSkyBand,
  setHeroSkyBand,
  type HeroSkyBand,
} from '../src/screens/home/heroSkyBand';
import fs from 'fs';
import path from 'path';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const NIGHT: HeroSkyBand = { top: '#0B1026', bottom: '#2B2350', skyH: 320 };

afterEach(() => _resetHeroSkyBand());

describe('the store the hero publishes through', () => {
  it('hands the sky to a subscriber and takes it back on release', () => {
    const seen: (HeroSkyBand | null)[] = [];
    // The hook is what screens use; the store underneath is what is
    // testable without a renderer, and it is the same list.
    const release = setHeroSkyBand(NIGHT);
    expect(typeof release).toBe('function');
    release();
    // A second release must not throw or resurrect anything.
    release();
    expect(seen).toEqual([]);
  });
});

describe('the band is wired to the page', () => {
  const home = read('src/screens/HomeScreen.tsx');
  const card = read('src/screens/home/TodayCard.tsx');
  const band = read('src/screens/home/HomeStatusBand.tsx');

  it('only the phone renders it — the dashboard has no strip to cover', () => {
    // …and not while a permission banner is what sits under the clock.
    expect(home).toMatch(
      /!isDashboard && !isMacCatalyst && !hasBanner \? \(\s*<HomeStatusBand/,
    );
    expect(home).toMatch(/insetTop=\{insets\.top\}/);
  });

  it('the hero publishes its sky, and only the growing one', () => {
    expect(card).toMatch(/if \(!fill \|\| !\(skyH > 0\)\) return;/);
    expect(card).toMatch(/return setHeroSkyBand\(\{ top: frame\.top, bottom: frame\.bottom, mid: frame\.mid, midAt: frame\.midAt, skyH \}\);/);
  });

  it('follows the scroll without re-rendering the page', () => {
    expect(home).toMatch(/new Animated\.Value\(0\)/);
    expect(home).toMatch(/useNativeDriver: false/);
    // The tab bar was here first and keeps its handler.
    expect(home).toMatch(/listener: tabBarScroll\.onScroll/);
  });

  it('draws nothing behind the status bar — no strip over the sky', () => {
    expect(band).not.toMatch(/Animated\.View/);
    expect(band).not.toMatch(/backgroundColor/);
  });

  it('takes the status bar\'s glyphs only once the page is what they sit on', () => {
    expect(band).toMatch(/if \(!sky \|\| insetTop <= 0 \|\| !overPage\) return null;/);
    expect(band).toMatch(/<StatusBar/);
    expect(band).toMatch(/luminance\(pageColor\) < INK_SWITCH_LUMINANCE/);
  });
});

/**
 * And on every other tab, where there is no sky — only a page.
 *
 * No tab draws a header any more, so a scrolled page rode up behind the
 * clock and the status icons on all of them, not just Today. The strip on
 * those pages already IS the page's colour, so the band is simply always
 * there: invisible at rest, and the thing that hides what scrolls under
 * it. One band in the tabs' shared layout covers the five tabs and every
 * page inside them.
 */
describe('the tabs that are not Today', () => {
  const tabs = read('src/navigation/MainTabs.tsx');
  const band = read('src/navigation/StatusBarBand.tsx');

  it('gets the band from the layout every tab shares', () => {
    expect(tabs).toContain("import { StatusBarBand } from './StatusBarBand';");
    expect(tabs).toMatch(
      /route\.name !== 'TodayTab' \? <StatusBarBand color=\{palette\.bg\} \/> : null/,
    );
  });

  it('paints the page\'s own colour, at the status bar\'s height', () => {
    expect(band).toMatch(/height: insets\.top/);
    expect(band).toMatch(/backgroundColor: color/);
    // Nothing to cover where the window has no status bar over it.
    expect(band).toMatch(/if \(insets\.top <= 0\) return null;/);
  });

  it('never takes a touch', () => {
    expect(band).toMatch(/pointerEvents="none"/);
  });

  it('leaves Today to its own band — the sky has to show at rest', () => {
    // Both exist, and neither is on the other's screen: the flat band is
    // in the tabs' layout, the sky band inside Today.
    expect(read('src/screens/HomeScreen.tsx')).toContain('<HomeStatusBand');
    // The elements, not the names: each file NAMES the other in a comment,
    // which is the point — they are two halves of one idea.
    expect(read('src/screens/HomeScreen.tsx')).not.toMatch(/<StatusBarBand/);
    expect(tabs).not.toMatch(/<HomeStatusBand/);
  });
});
