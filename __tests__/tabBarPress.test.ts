/**
 * The tab bar's press: no drawn effect, and a hold-and-slide along it.
 * See `navigation/tabBarPress.ts`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  _resetTabBarPress,
  activateTab,
  holdTab,
  hoveredTab,
  pressTab,
  registerTabActivation,
  registerTabFrame,
  releaseTab,
  slideTo,
  tabAt,
  tabBarPress,
} from '../src/navigation/tabBarPress';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

beforeEach(() => _resetTabBarPress());

describe('the store', () => {
  it('says which tab a window x is over, from the frames the buttons registered', () => {
    registerTabFrame('TodayTab', { x: 0, width: 60 });
    registerTabFrame('QuranTab', { x: 60, width: 60 });
    expect(tabAt(10)).toBe('TodayTab');
    expect(tabAt(60)).toBe('QuranTab');
    expect(tabAt(200)).toBeNull();
    registerTabFrame('QuranTab', null);
    expect(tabAt(70)).toBeNull();
  });

  it('activates a tab through what its button registered', () => {
    const open = jest.fn();
    registerTabActivation('LogTab', open);
    activateTab('LogTab');
    activateTab('DuasTab');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a tap names the tab and settles on it', () => {
    pressTab('TodayTab');
    expect(hoveredTab()).toBe('TodayTab');
    expect(tabBarPress().held).toBe(false);
    releaseTab('TodayTab');
    expect(tabBarPress()).toEqual({ hovered: null, held: false, settled: 'TodayTab' });
  });

  it('a slide before the hold does nothing; after it, the finger leads', () => {
    registerTabFrame('TodayTab', { x: 0, width: 60 });
    registerTabFrame('QuranTab', { x: 60, width: 60 });
    pressTab('TodayTab');
    expect(slideTo(90)).toBe(false);
    expect(hoveredTab()).toBe('TodayTab');
    holdTab();
    // Crossing into another tab says so (the tick)…
    expect(slideTo(90)).toBe(true);
    expect(tabBarPress()).toMatchObject({ hovered: 'QuranTab', held: true });
    // …moving within it does not, and changes nothing a render would see.
    const before = tabBarPress();
    expect(slideTo(100)).toBe(false);
    expect(tabBarPress()).toBe(before);
    // Off the end of the bar: the last tab it was over stays named.
    slideTo(400);
    expect(hoveredTab()).toBe('QuranTab');
  });
});

describe('the icon under a sliding finger', () => {
  it('brightens to the hover tint only while held and over it, and never the focused tab', () => {
    const src = read('src/navigation/tabBarPress.ts');
    expect(src).toContain('if (focused || !press.held || press.hovered !== name || hoverTint == null) return color;');
    const icons = read('src/navigation/tabIcons.tsx');
    for (const name of ['TodayTab', 'QuranTab', 'TasbihTab', 'DuasTab', 'LogTab', 'SettingsTab']) {
      expect(icons).toContain(`color={useTabHoverTint('${name}', color, focused ?? false)}`);
    }
    expect(read('src/navigation/MainTabs.tsx')).toContain('setHoverTint(palette.textSolid);');
  });
});

describe('the wiring', () => {
  it('draws nothing over the bar: no bubble, no halo, no ripple', () => {
    const tabs = read('src/navigation/MainTabs.tsx');
    expect(tabs).toContain('tabBarButton: props => <TabBarButton {...props} name={route.name} />');
    expect(tabs).not.toMatch(/tabBarBackground|TabBarBubble/);
    expect(read('src/navigation/tabIcons.tsx')).not.toMatch(/Halo|IconAnchor/);
    expect(read('src/navigation/TabBarButton.tsx')).toContain('android_ripple={undefined}');
  });

  it('holds, then slides: the tab under the finger is the one opened', () => {
    const button = read('src/navigation/TabBarButton.tsx');
    expect(button).toMatch(/holdTimer\.current = setTimeout\(\(\) => \{\s*holdTab\(\);/);
    expect(button).toMatch(/onTouchMove=\{e => \{\s*if \(slideTo\(e\.nativeEvent\.pageX\)\) hapticScrubTick\(false\);/);
    expect(button).toMatch(/const target = held \? hoveredTab\(\) : name;\s*releaseTab\(target\);\s*if \(held && target\) activateTab\(target\);/);
    // A tap after a hold is not a second press.
    expect(button).toMatch(/onPress=\{e => \{\s*if \(tabBarPress\(\)\.held\) return;/);
  });
});
