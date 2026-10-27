/**
 * Minimal (settings.minimalUi): one thing per screen, dots for a bar,
 * and a swipe across a page that turns to the next — so nothing else on
 * a page may turn sideways under it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const tabs = read('src/navigation/MainTabs.tsx');
const bar = read('src/navigation/MinimalTabBar.tsx');
const swipe = read('src/navigation/MinimalSwipe.tsx');
const inset = read('src/navigation/tabBarInset.ts');
const home = read('src/screens/HomeScreen.tsx');
const card = read('src/screens/home/TodayCard.tsx');

describe('the setting', () => {
  it('is off by default and rides the appearance slice', () => {
    expect(read('src/settings/types.ts')).toMatch(/minimalUi: false,/);
    expect(read('src/context/PrayerSettingsContext.tsx')).toContain("| 'minimalUi'");
    expect(read('src/screens/settings/AppearanceCard.tsx')).toContain('updateSettings({ minimalUi: v })');
  });
});

describe('the dots', () => {
  it('stand in for the bar, laid over the page, and the pages keep clear of them', () => {
    expect(tabs).toContain('<MinimalTabBar {...props} />');
    expect(bar).toMatch(/bar: \{\s*position: 'absolute'/);
    expect(inset).toContain('if (useMinimalUi()) return MINIMAL_TAB_BAR_HEIGHT + bottom;');
  });

  it('are pressable, one a tab, and say their name to a screen reader', () => {
    expect(bar).toContain('accessibilityRole="tab"');
    expect(bar).toContain('accessibilityState={{ selected: focused }}');
    expect(bar).toContain("navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })");
    expect(bar).toContain('if (focused || event.defaultPrevented) return;');
    expect(bar).toContain('navigation.navigate(route.name, route.params);');
  });

  it('fade the page under them everywhere but on the sky', () => {
    expect(bar).toContain("state.routes[state.index]?.name === 'TodayTab'");
    expect(bar).toContain('const fade = onSky ? null : scrimColor(palette.bg)');
  });
});

describe('the swipe', () => {
  it('wraps every tab’s page, follows the finger early, and lets a list scroll', () => {
    expect(tabs).toContain('<MinimalSwipe enabled={minimal} routeKey={route.key}>{children}</MinimalSwipe>');
    // Early, so a row under the finger lets go of its press; a drag down
    // a list fails first.
    expect(swipe).toContain('.activeOffsetX([-10, 10])');
    expect(swipe).toContain('.failOffsetY([-12, 12])');
    expect(swipe).toContain('if (I18nManager.isRTL) step = -step;');
    expect(swipe).toContain('transform: [{ translateX: offset }]');
  });

  it('stands the pages side by side, placed by the one position the dots read', () => {
    const pager = read('src/navigation/minimalPager.ts');
    // The navigator moves nothing; every page is kept and drawn.
    // The scene stays where the navigator stacks it and must not be
    // painted, or the last tab's paper would lie over every page.
    expect(tabs).toContain("sceneStyle: { backgroundColor: 'transparent' },");
    expect(tabs).toContain('sceneStyleInterpolator: () => ({ sceneStyle: {} }),');
    expect(tabs).toContain('lazy: false,');
    expect(tabs).toContain('detachInactiveScreens={!minimal}');
    // …and drawn: react-native-screens hides a page not on show, so the
    // tab navigator's screens are plain views under Minimal — and not at
    // the navigator's zIndex -1, which on Android drew them behind the
    // container's ground.
    expect(tabs).toContain('<MinimalScreens enabled={minimal}>');
    const screens = read('src/navigation/MinimalScreens.tsx');
    expect(screens).toContain('<ScreenContext.Provider value={PlainScreen as never}>');
    expect(screens).toContain('level: { zIndex: 0 }');
    // Each page as many widths aside as it is tabs from the position…
    expect(swipe).toContain('Animated.subtract(myIndex, pagerPosition(width))');
    expect(swipe).toContain('I18nManager.isRTL ? -width : width,');
    // …which is the settled tab, the drag as a fraction, and the hold.
    expect(pager).toContain(
      'Animated.add(Animated.add(pagerBase, Animated.divide(pagerDrag, I18nManager.isRTL ? w : -w)), pagerHold)',
    );
    // On a turn the settled tab slides while the drag runs back: no jump.
    expect(swipe).toContain('settlePagerBase(i + step);\n          navigation.navigate(next.name as never);\n          settlePagerDrag(done);');
    expect(pager).toMatch(/duration: PAGER_TRANSITION_MS,\s*easing: pagerEasing,\s*useNativeDriver: true,\s*\}\)\.start\(\(\) => onDone/);
  });

  it('turns by a finger held on the dots and slid along them', () => {
    expect(bar).toContain('.activateAfterLongPress(160)');
    expect(bar).toContain('pagerHold.setValue(pos - live.current.index);');
    expect(bar).toContain('const target = Math.round(slotAt(e.x));');
    expect(bar).toContain('if (I18nManager.isRTL) fromLeft = count - 1 - fromLeft;');
    // The dots and the pages read one position, so the strip follows the finger with them.
    expect(bar).toContain('const position = useMemo(() => pagerPosition(width), [width]);');
    expect(bar).toContain('settlePagerBase(target);');
  });

  it('shows the icons while a page turns, the current one larger, and dots at rest', () => {
    expect(bar).toContain("outputRange: [0.85, 1.25]");
    expect(bar).toMatch(/pagerEngaged\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[1, 0\] \}\)/);
    expect(bar).toContain('{Icon({ color: String(palette.textSolid), size: ICON, focused })}');
  });

  it('is the only sideways gesture under Minimal', () => {
    // The Quran's three lists and the Log's days used to page sideways.
    expect(read('src/screens/QuranScreen.tsx')).toContain('scrollEnabled={!searching && !minimal}');
    expect(read('src/screens/LogScreen.tsx')).toMatch(/!minimalRef\.current && Math\.abs\(g\.dx\) > 14/);
    // The day pager on Today is not drawn at all.
    expect(card).toContain('{minimal ? null : (\n      <View style={[fullBleed ? styles.tableBleed : null, columnPad]}>');
  });
});

describe('the minimal Today', () => {
  it('opens the day’s times on a tap or a drag up, and keeps the heart', () => {
    expect(card).toContain('.enabled(minimal && !!onOpenTimes)');
    expect(card).toContain('.activeOffsetY(-14)');
    expect(card).toContain('onPress: onOpenTimes,');
    expect(card).toContain("topRow={fullBleed ? (minimal ? { renderHelp } : { renderLocation, renderQibla, renderHelp }) : undefined}");
    expect(home).toContain('<TodayTimesSheet');
  });

  it('runs its sky on under the dots', () => {
    expect(home).toContain('{ paddingBottom: minimal ? 0 : SPACING.xl + tabBarInset }');
    expect(home).toContain('footInset={tabBarInset}');
  });

  it('keeps the other tabs as they are', () => {
    for (const f of ['src/screens/TasbihScreen.tsx', 'src/screens/DuasScreen.tsx']) {
      expect(read(f)).not.toContain('minimalUi');
    }
  });
});
