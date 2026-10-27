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
    expect(tabs).toContain('<MinimalSwipe enabled={minimal} routeKey={route.key}>');
    // The playback bar and the status-bar band ride inside it, with the page.
    expect(tabs).toMatch(/<MinimalSwipe[^>]*>\s*<HeaderPlaybackBar[\s\S]*?\{children\}[\s\S]*?<StatusBarBand[\s\S]*?<\/MinimalSwipe>/);
    // Early, so a row under the finger lets go of its press; a drag down
    // a list fails first.
    expect(swipe).toContain('activeOffsetX={[-10, 10]}');
    expect(swipe).toContain('failOffsetY={[-12, 12]}');
    // The finger into the drag with no JS in between; JS hears the lift.
    expect(swipe).toContain("Animated.event([{ nativeEvent: { translationX: pagerDragRaw } }], { useNativeDriver: true })");
    expect(swipe).toContain('onGestureEvent={onGestureEvent}');
    expect(swipe).toContain('if (oldState !== State.ACTIVE) return;');
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
    expect(swipe).toContain('Animated.subtract(myIndex, pagerPosition(width, edges))');
    expect(swipe).toContain('I18nManager.isRTL ? -width : width,');
    // …which is the settled tab, the drag as a fraction, and the hold.
    expect(pager).toMatch(
      /Animated\.add\(\s*Animated\.add\(pagerBase, Animated\.divide\(pagerShapedDrag\(w, edges\), I18nManager\.isRTL \? w : -w\)\),\s*pagerHold,\s*\)/,
    );
    // The drag is shaped natively too: a page at most, a fraction past the row's end.
    expect(pager).toContain("outputRange: [onLeft ? -w : -w * EDGE_GIVE, 0, onRight ? w : w * EDGE_GIVE],");
    // On a turn the settled tab slides while the drag runs back: no jump.
    expect(swipe).toContain('settlePagerBase(i + step);\n      navigation.navigate(next.name as never);\n      settlePagerDrag(done);');
    expect(pager).toMatch(/duration: PAGER_TRANSITION_MS,\s*easing: pagerEasing,\s*useNativeDriver: true,\s*\}\)\.start\(\(\) => onDone/);
  });

  it('is built once the settings are read, in the shape chosen, not rebuilt from the full page', () => {
    expect(tabs).toContain('const hydrated = useSettingsHydrated();');
    expect(tabs).toContain("if (!hydrated) return <View style={[styles.unhydrated, { backgroundColor: palette.bg }]} />;");
    expect(read('src/navigation/tabBarInset.ts')).toContain('return useAppearanceSettings().hydrated;');
  });

  it('keeps only the pages in reach laid out, and mounts the rest as the warm-up comes to them', () => {
    // The page on show alone until its first paint and launch run are over.
    expect(swipe).toContain('const inReach = engaged || distance <= (settled ? 1 : 0);');
    expect(swipe).toMatch(/void afterRun\(\)\.then\(\(\) => \{\s*if \(cancelled\) return;\s*setSettled\(true\);\s*startPagerWarmup\(\);/);
    expect(read('src/navigation/minimalPager.ts')).toContain('let warmth = 0;');
    expect(swipe).toContain('inReach ? null : styles.away');
    expect(swipe).toContain("away: { display: 'none' },");
    expect(swipe).toContain('{mounted ? children : null}');
    expect(swipe).toContain('if (enabled && !mounted && (inReach || distance <= warmth)) setMounted(true);');
    const pager = read('src/navigation/minimalPager.ts');
    expect(pager).toContain('const WARM_AFTER_MS = 2500;');
    expect(pager).toContain('const WARM_MAX = 5;');
  });

  it("never takes the swipe's own view out of the tree, so iOS keeps each page's swipe on its page", () => {
    // The handler's view always carries the offset and never `away`; the
    // page inside it is what leaves the tree out of reach.
    expect(swipe).toContain(
      '<Animated.View style={[styles.fill, { transform: [{ translateX: offset }] }]} collapsable={false}>',
    );
    expect(swipe).toMatch(
      /<Animated\.View style=\{\[styles\.fill, \{ transform[^\n]*\n\s*<View style=\{\[styles\.fill, inReach \? null : styles\.away\]\} collapsable=\{false\}>/,
    );
  });

  it('places the pages on the tab on show before the dots and pages attach', () => {
    // Turned on from Settings, the dots were built from 0 and lit Today's.
    expect(bar).toMatch(/if \(!placed\.current\) \{\s*placed\.current = true;\s*settlePagerBase\(state\.index, false\);\s*\}/);
    expect(bar).not.toContain('settlePagerBase(state.index, !first.current);');
  });

  it('turns by a finger held on the dots and slid along them', () => {
    expect(bar).toContain('.activateAfterLongPress(160)');
    expect(bar).toContain('pagerHold.setValue(pos - live.current.index);');
    expect(bar).toContain('const target = Math.round(slotAt(e.x));');
    expect(bar).toContain('if (I18nManager.isRTL) fromLeft = count - 1 - fromLeft;');
    // The dots and the pages read one position, so the strip follows the finger with them.
    expect(bar).toContain('() => pagerPosition(width, pagerEdges(state.index, state.routes.length)),');
    expect(bar).toContain('settlePagerBase(target);');
  });

  it('shows the icons while a page turns, the current one larger, and dots at rest', () => {
    expect(bar).toContain("outputRange: [0.85, 1.25]");
    // Built with the position, not on every render of the bar.
    expect(bar).toContain('[position, routeCount, dotsOpacity],');
    expect(bar).toMatch(/pagerEngaged\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[1, 0\] \}\)/);
    expect(bar).toContain('{Icon({ color: String(palette.textSolid), size: ICON, focused })}');
  });

  it('lets the Log’s graphs keep their sideways scroll', () => {
    const keeps = read('src/navigation/KeepsSideways.tsx');
    expect(keeps).toContain('<NativeViewGestureHandler ref={ref} disallowInterruption shouldCancelWhenOutside={false}>');
    expect(keeps).toContain('usePagerBlocker(ref);');
    expect(swipe).toContain('waitFor={blockers as never}');
    expect(read('src/practice/PracticeStrip.tsx')).toContain('<KeepsSideways>');
    expect(read('src/practice/PracticeHeatmap.tsx')).toContain('<KeepsSideways>');
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
    expect(card).toContain('.enabled(minimal)');
    expect(card).toContain('.activeOffsetY(-14)');
    expect(card).toContain('onPress: onOpenTimes,');
    expect(card).toContain("topRow={fullBleed ? (minimal ? { renderHelp } : { renderLocation, renderQibla, renderHelp }) : undefined}");
    expect(card).toContain('<TodayTimesSheet');
  });

  it('brings the sheet up on its own spring, and the page recedes under a veil that spares the sky', () => {
    const sheet = read('src/screens/home/TodayTimesSheet.tsx');
    const minimalSheet = read('src/screens/home/MinimalSheet.tsx');
    // Drawn by hand, not the platform's slide: one value drives the
    // sheet's rise and the page's retreat.
    expect(sheet).toContain('<MinimalSheet visible={visible} onClose={onClose} progress={progress}');
    expect(minimalSheet).toContain('animationType="none"');
    expect(minimalSheet).toContain('onShow={rise}');
    expect(minimalSheet).toContain('Animated.spring(progress, { toValue: 1, ...MINIMAL_SHEET_OPEN, useNativeDriver: true })');
    // The veil is a gradient — light over the sky, deep by the sheet —
    // not one flat plane of black.
    expect(minimalSheet).toContain('[`rgba(0, 0, 0, ${VEIL_TOP})`, 0],');
    expect(minimalSheet).toContain('[`rgba(0, 0, 0, ${VEIL_FOOT})`, 1],');
    expect(minimalSheet).toMatch(/const VEIL_TOP = 0\.\d+;\nconst VEIL_FOOT = 0\.\d+;/);
    // A drag down on the sheet follows the finger and lets go past a threshold.
    expect(minimalSheet).toContain('if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY)');
    // One gesture for the sheet's life, not one a render (it renders every second).
    expect(minimalSheet).toMatch(/const pull = useMemo\(\s*\(\) =>\s*Gesture\.Pan\(\)/);
    expect(minimalSheet).toContain('[drag, progress],');
    // The page: scaled back by the same value, driven early by a drag up
    // on it, and spared under Reduce Motion.
    expect(card).toContain('const recess = minimal ? { transform: pageRecess(sheetProgress, reduceMotion) } : null;');
    expect(card).toContain('sheetProgress.setValue(Math.min(SWIPE_UP_PULL, Math.max(0, -e.translationY / SWIPE_UP_REACH)));');
    expect(card).toContain('progress={sheetProgress}');
    // The FOREGROUND recedes, not the page: the sky stays out to every edge.
    expect(card).toContain('recess={recess}');
    expect(card).toContain('<Fore style={minimal ? [styles.heroFore, recess] : undefined}>');
    expect(minimalSheet).toContain('if (reduceMotion) return [];');
  });

  it('builds the sheet’s rows only while it is open, and keeps the last ones as it closes', () => {
    expect(card).toContain('const liveSheetRows = minimal && timesOpen ? sheetRows(sheetOffset) : null;');
    expect(card).toContain('const sheetRowsShown = liveSheetRows ?? lastSheetRows.current;');
    expect(card).toContain('rows={sheetRowsShown}');
    expect(card).not.toContain('rows={sheetRows(sheetOffset)}');
  });

  it('turns the sheet to other days, opens the month, and logs from it', () => {
    const sheet = read('src/screens/home/TodayTimesSheet.tsx');
    // The full page's day bar in small: a chevron each way, the calendar.
    expect(card).toContain('onPrev={dayAt(sheetOffset - 1) ? () => setSheetOffset(o => o - 1) : undefined}');
    expect(card).toContain('onNext={dayAt(sheetOffset + 1) ? () => setSheetOffset(o => o + 1) : undefined}');
    expect(card).toContain('onMonth={onOpenMonth}');
    expect(sheet).toContain('<MonthGlyph color={muted} />');
    expect(sheet).toContain("t('home.backToToday', 'Back to today')");
    // The check beside each salāh, on today and the days behind, from the
    // same record and the same toggle as the rows.
    expect(card).toContain('const loggable = offset <= 0;');
    expect(card).toContain('onToggle: () => void toggleLog(key, dayTimings, offset),');
    expect(sheet).toContain('<LogCheck');
    // …and the question a passed prayer asks is rendered whatever the page.
    expect(card).toMatch(/\)\}\n\s*\{\/\* The question a tap on a passed prayer opens/);
  });

  it('runs its sky on under the dots', () => {
    expect(home).toContain('{ paddingBottom: minimal ? 0 : SPACING.xl + tabBarInset }');
    expect(home).toContain('footInset={tabBarInset}');
  });

  it('stands no page aside on the full page', () => {
    // The dots, which settle the position, are not mounted there: a page
    // placed by it would stand a width aside — a blank tab.
    expect(swipe).toContain('if (!enabled) return <View style={styles.fill}>{children}</View>;');
  });

  it('keeps the other tabs as they are', () => {
    for (const f of ['src/screens/TasbihScreen.tsx', 'src/screens/DuasScreen.tsx']) {
      expect(read(f)).not.toContain('minimalUi');
    }
  });
});

describe('the Log, in both modes', () => {
  it('says the way back to today once the day is another', () => {
    const log = read('src/screens/LogScreen.tsx');
    expect(log).toMatch(/\{isToday \? null : \(\s*<Pressable[\s\S]*?onPress=\{\(\) => setSelected\(today\)\}[\s\S]*?\{t\('log\.backToToday'\)\}/);
  });
});
