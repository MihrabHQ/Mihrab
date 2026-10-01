/**
 * The tab bar's press: a halo on the icon, and a hold-and-slide along the
 * bar. See `navigation/tabBarPress.ts`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  _resetTabBarPress,
  activateTab,
  hoveredTab,
  registerTabActivation,
  registerTabFrame,
  setHoveredTab,
  tabAt,
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

  it('keeps one hovered tab', () => {
    setHoveredTab('TodayTab');
    setHoveredTab('QuranTab');
    expect(hoveredTab()).toBe('QuranTab');
    setHoveredTab(null);
    expect(hoveredTab()).toBeNull();
  });
});

describe('the wiring', () => {
  it('replaces the ripple with a halo on every icon, sized by the glyph', () => {
    const icons = read('src/navigation/tabIcons.tsx');
    for (const name of ['TodayTab', 'QuranTab', 'TasbihTab', 'DuasTab', 'LogTab', 'SettingsTab']) {
      expect(icons).toContain(`<Halo name="${name}" size={iconSize(size)} color={color}>`);
    }
    expect(icons).toMatch(/const d = Math\.round\(size \* HALO_SCALE\)/);
    const button = read('src/navigation/TabBarButton.tsx');
    expect(button).toContain('android_ripple={undefined}');
    expect(read('src/navigation/MainTabs.tsx')).toContain('tabBarButton: props => <TabBarButton {...props} name={route.name} />');
  });

  it('holds, then slides: the tab under the finger is the one opened', () => {
    const button = read('src/navigation/TabBarButton.tsx');
    expect(button).toMatch(/holdTimer\.current = setTimeout\(\(\) => \{\s*held\.current = true;/);
    expect(button).toMatch(/onTouchMove=\{e => \{\s*if \(!held\.current\) return;\s*const over = tabAt\(e\.nativeEvent\.pageX\)/);
    expect(button).toMatch(/if \(held\.current\) \{\s*const target = hoveredTab\(\);\s*if \(target\) activateTab\(target\);/);
    // A tap after a hold is not a second press.
    expect(button).toMatch(/onPress=\{e => \{\s*if \(held\.current\) return;/);
  });
});
