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
    expect(tabs).toContain('<MinimalSwipe enabled={minimal}>{children}</MinimalSwipe>');
    // Early, so a row under the finger lets go of its press; a drag down
    // a list fails first.
    expect(swipe).toContain('.activeOffsetX([-10, 10])');
    expect(swipe).toContain('.failOffsetY([-12, 12])');
    expect(swipe).toContain('if (I18nManager.isRTL) step = -step;');
    expect(swipe).toContain('transform: [{ translateX: offset }]');
  });

  it('turns the page as a pager does: the pages slide, and the drag runs back under them', () => {
    const pager = read('src/navigation/minimalPager.ts');
    expect(tabs).toContain('sceneStyleInterpolator:');
    // Every tab's page stays drawn, as many page-widths aside as it is tabs
    // from the one on show: a strip of pages, like the mushaf's.
    expect(tabs).toContain('detachInactiveScreens={!minimal}');
    // …and drawn: react-native-screens hides a page not on show, so the
    // tab navigator's screens are plain views under Minimal.
    expect(tabs).toContain('<MinimalScreens enabled={minimal}>');
    const screens = read('src/navigation/MinimalScreens.tsx');
    expect(screens).toContain('<ScreenContext.Provider value={PlainScreen as never}>');
    expect(screens).toContain('level: { zIndex: 0 }');
    expect(tabs).toContain('lazy: false,');
    expect(tabs).toContain('const away = Math.max(1, Math.abs(myIndex - tabState.index)) * windowWidth;');
    expect(tabs).toContain('outputRange: I18nManager.isRTL ? [away, 0, -away] : [-away, 0, away],');
    expect(tabs).toContain('config: { duration: PAGER_TRANSITION_MS, easing: pagerEasing }');
    expect(pager).toMatch(/duration: PAGER_TRANSITION_MS,\s*easing: pagerEasing,\s*useNativeDriver: true,\s*\}\)\.start\(\(\) => onDone/);
    expect(swipe).toContain('navigation.navigate(next.name as never);\n          settlePagerDrag(done);');
  });

  it('turns by a finger held on the dots and slid along them', () => {
    expect(bar).toContain('.activateAfterLongPress(160)');
    expect(bar).toContain('pagerHold.setValue(pos - live.current.index);');
    expect(bar).toContain('const target = Math.round(slotAt(e.x));');
    expect(bar).toContain('if (I18nManager.isRTL) fromLeft = count - 1 - fromLeft;');
    // The dots follow the finger exactly, and so does the strip of pages.
    expect(bar).toContain('Animated.add(Animated.add(base, Animated.divide(pagerDrag, -Math.max(1, width))), pagerHold)');
    expect(swipe).toContain('Animated.add(pagerDrag, Animated.multiply(pagerHold, I18nManager.isRTL ? width : -width))');
  });

  it('shows the icons while a page turns, the current one larger, and dots at rest', () => {
    expect(bar).toContain('Animated.add(base, Animated.divide(pagerDrag, -Math.max(1, width)))');
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
