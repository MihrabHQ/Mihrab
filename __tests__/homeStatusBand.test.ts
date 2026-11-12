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
import { todayCardSource } from './fixtures/todayCardSource';

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
  const card = todayCardSource();
  const band = read('src/screens/home/HomeStatusBand.tsx');

  it('only the phone renders it — the dashboard has no strip to cover', () => {
    // …and not while a permission banner is what sits under the clock.
    expect(home).toMatch(
      /!isDashboard && !desktopLayout && !bannerInFlow \? \(\s*<HomeStatusBand/,
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

describe('nothing stands between the screen’s top and the sky', () => {
  it('mounts the notices only when one is drawn — an empty one still took the column’s gap', () => {
    const home = read('src/screens/HomeScreen.tsx');
    expect(home).toMatch(/\{permissionBannersShown\(\{[\s\S]{0,260}\}\) && !floatBanners \? \(\s*<View/);
    // The banners decide by the same rule, so the two cannot disagree.
    expect(read('src/screens/home/PermissionBanners.tsx')).toMatch(/!permissionBannersShown\(\{/);
  });
});


describe('a notice is a card over the page, not a row of it (the phone)', () => {
  const fs = require('fs');
  const path = require('path');
  const home: string = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'), 'utf8');
  const banners: string = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'PermissionBanners.tsx'), 'utf8');

  it('floats on the phone, under the status bar, and the page does not move for it', () => {
    expect(home).toMatch(/const floatBanners = !isDashboard && !desktopLayout && !isRoomy && !book;/);
    expect(home).toMatch(/const bannerInFlow = hasBanner && !floatBanners;/);
    // out of the column…
    expect(home).toMatch(/\}\) && !floatBanners \? \(\s*<View/);
    // …and over the page, after everything else in the root
    expect(home).toMatch(/\{floatBanners && hasBanner \? \(\s*<View pointerEvents="box-none" style=\{\[styles\.floatingNotices, \{ top: insets\.top \+ SPACING\.xs \}\]\}>\s*<PermissionBanners\s*floating/);
    expect(home).toMatch(/floatingNotices: \{\s*position: 'absolute',/);
    // the sky keeps the status bar, the hero its tier and its top inset: nothing asks about a floating notice
    expect(home).toMatch(/topInset: bannerInFlow \? 0 : insets\.top,/);
    expect(home).toMatch(/extra: bannerInFlow \? 72 : 0,/);
    expect(home).toMatch(/bannerAbove=\{bannerInFlow\}/);
    expect(home).not.toMatch(/bannerAbove=\{hasBanner\}/);
  });

  it('is a card — the page’s card colour, an edge, a shadow — and every one can be put away', () => {
    expect(banners).toMatch(/\? \[styles\.card, \{ backgroundColor: palette\.card, borderColor: palette\.border, shadowColor: palette\.text \}\]/);
    // six notices, one list, in the order they are said
    expect((banners.match(/notices\.push\(\{/g) ?? []).length + (banners.match(/\) notices\.push\(\{ key: /g) ?? []).length).toBeGreaterThanOrEqual(6);
    for (const key of ['timezone', 'method', 'zone', 'fallback', 'exactAlarm', 'notifications']) expect(banners).toContain(`key: '${key}'`);
    // the three whose own button is an action get a close of their own
    for (const key of ['fallback', 'exactAlarm', 'notifications']) {
      expect(banners).toContain(`!away('${key}')`);
      expect(banners).toMatch(new RegExp(`key: '${key}',[\\s\\S]{0,260}?closable: true`));
    }
    expect(banners).toMatch(/\{n\.closable \? close\(n\.key\) : null\}/);
    // in the column (a dashboard, a desktop window) they are as they were: no close, the tinted strip
    expect(banners).toMatch(/: \{ backgroundColor: palette\.accentBg \};/);
    expect(banners).toMatch(/floating \? \(\s*<Pressable/);
  });

  it('over the page: one card at a time, the rest counted, a long note held to two lines until touched', () => {
    // the first only — the others wait behind it and come forward as it is put away
    expect(banners).toMatch(/if \(floating\) \{\s*const n = notices\[0\];\s*const more = notices\.length - 1;/);
    expect(banners).toMatch(/\{`\+\$\{more\}`\}/);
    expect(banners).toMatch(/numberOfLines=\{open \? undefined : FLOATING_LINES\}/);
    expect(banners).toMatch(/export const FLOATING_LINES = 2;/);
    expect(banners).toMatch(/onPress=\{\(\) => setOpenKey\(open \? null : n\.key\)\}/);
    // in the column every notice still stands, each in its strip
    expect(banners).toMatch(/\{notices\.map\(n => \(\s*<View key=\{n\.key\} style=\{\[styles\.banner, card, leadStyle\(\)\]\}>/);
  });
});
