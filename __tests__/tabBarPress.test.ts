/**
 * The tab bar's press: a glossy bubble inside the bar, and a hold-and-
 * slide along it. See `navigation/tabBarPress.ts` and `TabBarBubble`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  _resetTabBarPress,
  activateTab,
  holdTab,
  hoveredTab,
  onFinger,
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
    const finger = jest.fn();
    onFinger(finger);
    pressTab('TodayTab');
    expect(slideTo(90)).toBe(false);
    expect(finger).not.toHaveBeenCalled();
    expect(hoveredTab()).toBe('TodayTab');
    holdTab();
    // Crossing into another tab says so (the tick)…
    expect(slideTo(90)).toBe(true);
    expect(tabBarPress()).toMatchObject({ hovered: 'QuranTab', held: true });
    // …moving within it does not, and changes nothing a render would see.
    const before = tabBarPress();
    expect(slideTo(100)).toBe(false);
    expect(tabBarPress()).toBe(before);
    // The finger itself goes to the listener on every move.
    expect(finger.mock.calls.map(c => c[0])).toEqual([90, 100]);
    // Off the end of the bar: the last tab it was over stays named.
    slideTo(400);
    expect(hoveredTab()).toBe('QuranTab');
  });
});

describe('the wiring', () => {
  it('draws the bubble in the bar background, so the bar clips it', () => {
    const tabs = read('src/navigation/MainTabs.tsx');
    expect(tabs).toContain('tabBarButton: props => <TabBarButton {...props} name={route.name} />');
    expect(tabs).toContain('tabBarBackground: () => <TabBarBubble radius={FLOATS_OVER_CONTENT ? RADIUS.xl : 0} />');
    const bubble = read('src/navigation/TabBarBubble.tsx');
    expect(bubble).toMatch(/overflow: 'hidden'/);
    // A slim pill around the icon, kept inside the bar.
    expect(bubble).toContain('const w = tabW > 0 ? Math.min(PILL_W, tabW - INSET_X * 2) : 0;');
    expect(bubble).toContain('const top = Math.max(0, Math.min(bar.height - h, centreY - h / 2));');
    expect(bubble).toContain('band.y + band.height / 2 - bar.y');
    expect(read('src/navigation/tabIcons.tsx').match(/<IconAnchor>/g)).toHaveLength(6);
    // No halo left on the icons, and no ripple on the buttons.
    expect(read('src/navigation/tabIcons.tsx')).not.toContain('Halo');
    expect(read('src/navigation/TabBarButton.tsx')).toContain('android_ripple={undefined}');
  });

  it('holds, then slides: the tab under the finger is the one opened', () => {
    const button = read('src/navigation/TabBarButton.tsx');
    expect(button).toMatch(/holdTimer\.current = setTimeout\(\(\) => \{\s*holdTab\(\);/);
    expect(button).toMatch(/onTouchMove=\{e => \{\s*if \(slideTo\(e\.nativeEvent\.pageX\)\) hapticScrubTick\(false\);/);
    // The bubble follows on the native value, not through a render.
    expect(read('src/navigation/TabBarBubble.tsx')).toMatch(/onFinger\(pageX => \{\s*x\.stopAnimation\(\);\s*x\.setValue\(leftFor\(pageX\)\);/);
    expect(button).toMatch(/const target = held \? hoveredTab\(\) : name;\s*releaseTab\(target\);\s*if \(held && target\) activateTab\(target\);/);
    // A tap after a hold is not a second press.
    expect(button).toMatch(/onPress=\{e => \{\s*if \(tabBarPress\(\)\.held\) return;/);
  });
});
