/**
 * The six tabs (design review 2e): Today · Quran · Tasbih · Duas · Log ·
 * Settings.
 *
 * What moved and why:
 *
 *   • A "More" tab is an admission the deciding was never finished. With
 *     Mosques cut and Month folded into Settings there was nothing left for
 *     it to hold, so the sixth tab became what people were reaching for
 *     anyway.
 *   • Tasbih and Duas are separate. Bundling them as "Dhikr" saved a tab and
 *     cost clarity: one is a counter you tap fifty times, the other is a
 *     library you read. Tasbih is now one tap away right after prayer.
 *   • Find a masjid is gone — maps apps do it better, and it was the one
 *     feature needing a network round-trip in an otherwise offline app.
 *   • Qibla lost its tile and became a compass button in the Today header,
 *     next to the location it depends on.
 *
 * Six is the ceiling, not a target: iOS collapses to five-plus-More unless
 * the bar is explicitly six, and Android's guidance caps at five. If a
 * seventh is ever needed, re-merge Tasbih and Duas rather than bringing
 * "More" back.
 *
 * The bar itself is a floating rounded pill rather than a full-width slab
 * welded to the bottom edge — see `tabBarStyle` below. Readers never see
 * it: the mushaf is pushed onto the root stack ON TOP of the tabs.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useWindowSize } from '../responsive/windowSize';
import type { ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAppPalette } from '../hooks/useAppPalette';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { translucentSurface } from '../theme/chrome';
import { resolveSpring } from '../theme/motion';
import { CARD_SHADOW, RADIUS, SPACING } from '../theme/tokens';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';
import {
  FLOATS_OVER_CONTENT,
  TAB_BAR_HEIGHT,
  TAB_BAR_SIDE_INSET,
  useTabBarBottom,
  useTabBarCornerInset,
} from './tabBarInset';
import { TabBarScrim } from './TabBarScrim';
import { StatusBarBand } from './StatusBarBand';
import { TabBarButton } from './TabBarButton';
import { setHoverTint } from './tabBarPress';
import { showTabBar, useTabBarHidden } from './tabBarVisibility';
import { HomeScreen } from '../screens/HomeScreen';
import { QuranScreen } from '../screens/QuranScreen';
import { TasbihScreen } from '../screens/TasbihScreen';
import { DuasScreen } from '../screens/DuasScreen';
import { LogScreen } from '../screens/LogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HomeHeaderControls } from './HomeHeaderControls';
import { HeaderPlaybackBar } from '../quran/audio/HeaderPlaybackBar';
import { useVerticalBar } from '../native/VerticalBar';
import { VerticalTabBar } from './VerticalTabBar';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { MihrabHeaderTitle } from './MihrabHeaderTitle';
import { isMacCatalyst, HOME_DASHBOARD_MIN_WIDTH } from '../responsive/breakpoints';
import {
  TabBookIcon,
  TabDuasIcon,
  TabHomeIcon,
  TabLogIcon,
  TabSettingsIcon,
  TabTasbihIcon,
} from './tabIcons';
import type { MainTabParamList } from './types';
import { useBookPanePadding } from '../native/FoldPosture';
import { useMinimalUi, useSettingsHydrated } from './tabBarInset';
import { MinimalTabBar } from './MinimalTabBar';
import { MinimalSwipe } from './MinimalSwipe';
import { MinimalScreens } from './MinimalScreens';
import { PAGER_TRANSITION_MS, pagerEasing } from './minimalPager';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** The wrapper the playback bar and the screen share. */
const SCREEN = { flex: 1 } as const;

/** From this text size on, the bar is glyphs alone. */
export const TAB_LABELS_UNTIL_FONT_SCALE = 1.5;

export function MainTabs() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // The icon under a sliding finger brightens to the text colour.
  useEffect(() => {
    setHoverTint(palette.textSolid);
  }, [palette.textSolid]);
  const windowWidth = useWindowSize().width;
  const isDashboardWidth = windowWidth >= HOME_DASHBOARD_MIN_WIDTH;
  // Today's header survives only on the wide dashboard; see its options.
  const todayHeader = !isMacCatalyst && isDashboardWidth;
  const barBottom = useTabBarBottom();
  /** What the display's rounded bottom corners eat — #42. */
  const cornerInset = useTabBarCornerInset();
  /**
   * At a large text size the labels go and the glyphs grow. Six labels
   * in a bar six slots wide stop fitting around 1.5×: "Setti…" and
   * "Tod…" said less than no label, and a glyph a quarter larger says
   * what the word did (docs/home-layout-plan.md §4.4). Read from the
   * window, which re-renders the bar when the size is changed.
   */
  const bigText = useWindowDimensions().fontScale >= TAB_LABELS_UNTIL_FONT_SCALE;

  /**
   * Out of the way while reading, back on the way up.
   *
   * Driven straight into `tabBarStyle` because the bar IS an
   * `Animated.View` — the navigator applies that style to one, which is
   * what makes a native-driver transform legal here and saves wrapping the
   * bar in a custom `tabBar`. The wrapper route was tried in the design and
   * rejected: this pill has a history of painting correctly while
   * receiving no touches, and the least it can be disturbed the better.
   *
   * Only where the bar FLOATS. On iPad and Mac it is in flow and the page
   * ends above it, so sliding it away would reflow the content under the
   * reader's thumb — a different behaviour, and a worse one.
   */
  const hidden = useTabBarHidden();
  const reduceMotion = useReduceMotion();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // A spring, not a timing: the bar is a thing that MOVES, and the
    // `spatial` track lets it settle like one. Under Reduce Motion the same
    // call lands in a frame — see `resolveSpring`.
    Animated.spring(slide, {
      toValue: hidden ? 1 : 0,
      ...resolveSpring('spatial', reduceMotion),
    }).start();
  }, [hidden, reduceMotion, slide]);
  const hideBy = TAB_BAR_HEIGHT + barBottom + 16;
  /**
   * A phone with a vertical bar (iPhone Duo): the tabs go IN the column the
   * status bar moved to, and every page but Today keeps clear of it — Today
   * clears it itself, because its sky is the one thing allowed under it.
   * There is no bar along the bottom then, so the pages end at the home
   * indicator rather than at a bar. See src/native/VerticalBar.ts.
   */
  const vbar = useVerticalBar();
  // Minimal (settings.minimalUi): dots for a bar, and a swipe across a
  // page turns to the next. Not beside a vertical bar, which has the tabs.
  const minimal = useMinimalUi() && !vbar;
  const hydrated = useSettingsHydrated();
  // A foldable half open as a book: every tab but Today keeps to one page
  // of it, off the crease (`FoldPosture.ts`). Today lays out across both.
  const bookPad = useBookPanePadding(useWindowSize().width);
  const columnPad = vbar
    ? vbar.side === 'right'
      ? { paddingRight: vbar.width } // rtl-safe: the vertical bar is on a physical side
      : { paddingLeft: vbar.width } // rtl-safe: the vertical bar is on a physical side
    : null;

  // Not before the settings are read: the navigator is built once, in
  // the shape the person chose (useSettingsHydrated). The kept launch
  // picture covers this moment on Android; elsewhere it is the page's
  // own colour for the few hundred milliseconds the settings take.
  if (!hydrated) return <View style={[styles.unhydrated, { backgroundColor: palette.bg }]} />;
  return (
    <MinimalScreens enabled={minimal}>
    <Tab.Navigator
      // Minimal: the pages beside the one on show stay drawn, a page away.
      detachInactiveScreens={!minimal}
      tabBar={props =>
        vbar ? (
          <VerticalTabBar {...props} bar={vbar} />
        ) : minimal ? (
          <MinimalTabBar {...props} />
        ) : (
          <BottomTabBar {...props} />
        )
      }
      /**
       * ARRIVING SOMEWHERE ALWAYS SHOWS THE BAR.
       *
       * A tab screen is not unmounted when you leave it, so the unmount
       * cleanup in `useTabBarScroll` does not fire on a tab change. Without
       * this, scrolling Today down and then opening Tasbih — which has no
       * list to scroll and therefore no way to ask for the bar back — would
       * land you on a screen with the navigation hidden and nothing on it
       * able to restore it.
       */
      screenListeners={{ focus: showTabBar }}
      /**
       * The recitation follows the reader between tabs.
       *
       * Wrapping every tab here rather than adding a bar to six screens:
       * a screen that forgot to include it would be a screen where the
       * only way to pause is the notification shade. `HeaderPlaybackBar`
       * decides for itself whether it has anything to say.
       */
      screenLayout={({ route, children }) => (
        <View
          style={[
            SCREEN,
            vbar && route.name !== 'TodayTab'
              ? [columnPad, { backgroundColor: palette.bg }]
              : null,
            bookPad && route.name !== 'TodayTab'
              ? [bookPad, { backgroundColor: palette.bg }]
              : null,
          ]}>
          {/* The bar is the page's own colour, and — since no tab draws a
              title bar any more — it is the first thing under the status
              bar and clears it itself (`headerless`). The one tab with a
              header left is Today on the wide dashboard, where the bar
              hangs under that header instead. */}
          {/* Everything that is the page's — the playback bar at its head,
              the strip behind the status bar at its foot of the stack —
              rides inside the swipe's wrapper, so under Minimal it stands
              aside with its page: every tab is drawn then, and a band
              left outside would lie over the page on show. */}
          <MinimalSwipe enabled={minimal} routeKey={route.key}>
          <HeaderPlaybackBar
            surface={palette.bg}
            headerless={!(route.name === 'TodayTab' && todayHeader)}
          />
          {children}
          {/* Over the page, at the other end: the strip behind the status
              bar. Every tab pads its content clear of it, so a band of the
              page's own colour is invisible until something scrolls up
              into it — and then it is the thing that keeps the page's text
              off the clock. Today is not here: its sky runs under the
              status bar on purpose, and nothing covers it there
              (`HomeStatusBand` only sets the glyphs' ink). */}
          {route.name !== 'TodayTab' ? <StatusBarBand color={palette.bg} /> : null}
          {/* Under the bar, over the page: the fade that keeps the two from
              colliding. Same `slide` as the bar, so it leaves with it. */}
          </MinimalSwipe>
          {vbar ? null : <TabBarScrim bg={palette.bg} slide={slide} />}
        </View>
      )}
      screenOptions={({ route }) => ({
        /**
         * Minimal: the pages slide a page's width, the way a pager's do —
         * the old one out, the new one in from the side the finger (or
         * the dot) asked for — over the time the drag runs back under
         * them (minimalPager.ts). In a right-to-left language the next
         * page is on the left.
         */
        ...(minimal
          ? {
              // Every tab's page is kept mounted and drawn (`lazy` off,
              // `detachInactiveScreens` off, MinimalScreens), and stood on
              // the strip by its own wrapper (MinimalSwipe): as many
              // page-widths aside as it is tabs from where the pages are.
              // The navigator moves nothing itself.
              lazy: false,
              // Every tab's scene view stays where the navigator put it —
              // over the ones before it — and the page inside it is what
              // moves aside; so the scene must not be painted, or the last
              // tab's paper would lie over every page. The pages paint
              // their own ground.
              sceneStyle: { backgroundColor: 'transparent' },
              // No scene interpolator: the navigator's own progress draws
              // nothing. The spec is still named, and over the pager's
              // own time: a navigator with no transition at all stands a
              // page not on show down the frame it is left, and the page
              // the finger is still sliding went with it.
              transitionSpec: {
                animation: 'timing' as const,
                config: { duration: PAGER_TRANSITION_MS, easing: pagerEasing },
              },
              sceneStyleInterpolator: () => ({ sceneStyle: {} }),
            }
          : null),
        /**
         * The button, ours: no ripple — the icon draws the press, centred
         * on the glyph (`tabIcons`) — and a hold-and-slide along the bar
         * that opens the tab the finger ends on (`TabBarButton`).
         */
        tabBarButton: props => <TabBarButton {...props} name={route.name} />,
        headerShown: false,
        /**
         * Quran, Tasbih, Duas, Log and Settings centre their titles on
         * both platforms.
         *
         * The same inherited default the pushed subpages had, one level
         * up: the JS header centres on iOS and leads on Android, so five
         * of the six tabs read as two different designs depending on the
         * phone. Now chosen rather than inherited, and chosen to match
         * what the subpages beneath them do.
         *
         * Today overrides this back to `left` and says why — that row is
         * a wordmark next to a location chip, not the name of a screen
         * you pushed, and centring it cost the chip the room it needs.
         */
        headerTitleAlign: 'center',
        /**
         * The header is the page, not a bar on it. It took the navigation
         * theme's card colour, which on the warm paper theme is a white
         * band over an off-white page — a title bar, visibly. In the page's
         * own colour with no shadow, the title reads as the top of the page
         * (the way Pillars does it), and the bottom bar, in the same
         * colour, as its foot.
         */
        headerStyle: { backgroundColor: palette.bg },
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.accentSolid,
        /**
         * A HEX, NOT `String(palette.muted)`.
         *
         * react-navigation types the TINT colours as plain strings, so a
         * PlatformColor cannot be passed here — but stringifying one gives
         * "[object Object]", and this tint is handed to each tab's ICON,
         * which is an SVG. `react-native-svg` draws nothing for a colour it
         * cannot parse, so under Liquid Glass (where `muted` is
         * `PlatformColor('secondaryLabel')`) the bar came out as five
         * labels with no glyphs above them — only the active tab, on
         * `accentSolid`, had a colour it could use. `mutedSolid` is the
         * same colour as a hex, for exactly this.
         */
        tabBarInactiveTintColor: palette.mutedSolid,
        /**
         * Two bars, not one.
         *
         * PHONES get the floating pill: inset from the edges, rounded,
         * with the page running underneath so a list that would otherwise
         * stop dead at a solid bar says "there is more here".
         *
         * iPad AND MAC get the plain full-width bar back — the pill was
         * tried there and rejected. A desktop window has room to spare, so
         * detaching chrome from the edge buys nothing, and the pill's own
         * geometry went wrong twice on the way (clipped off the bottom of
         * a Mac window, invisible against a dark background).
         *
         * Note the colours are passed through as `ColorValue`, NOT through
         * `String()`. Under the system/glass themes these are PlatformColor
         * objects; stringifying one yields "[object Object]", which RN
         * resolves to nothing — which is why the Mac bar had no surface at
         * all, only floating labels on the window background.
         */
        tabBarStyle: FLOATS_OVER_CONTENT
          ? {
              // `accentSurfaceStrong` is `palette.card` verbatim unless the
              // user turned on Tinted surfaces, in which case the pill takes
              // a deeper wash of the accent than the page — an anchor at the
              // same lightness, so bar and page still read as one surface.
              backgroundColor: translucentSurface(palette.accentSurfaceStrong),
              position: 'absolute',
              /**
               * ABSOLUTE AGAIN — and this time the tabs still work.
               *
               * It was in flow for a while because an earlier attempt at
               * `position: 'absolute'` produced a bar that painted in the
               * right place and received touches nowhere: every tab dead,
               * the screenshot perfect. That is no longer true. Re-tested
               * on the current navigator by tapping all six in turn and
               * reading the header each time — Today, Quran, Tasbih, Duas,
               * Log, Settings all switch. Whatever it was has been fixed
               * upstream, and being in flow was costing the thing the pill
               * exists for: a page that stops dead at a solid bar looks
               * finished, and the reader cannot tell there is more below.
               *
               * The price is that the navigator reserves nothing, so every
               * scrolling screen has to add the bar's height itself — that
               * is `useTabBarInset`, which the six tab screens already
               * call, and which is why this was one line to change back.
               *
               * `marginBottom` is the WHOLE gap under the bar. Setting
               * `height` below makes `getTabBarHeight` return that number
               * verbatim, so there is nothing here to correct — see
               * `useTabBarBottom`. It was written as a correction (and so
               * came out negative), which hung the pill off the bottom of
               * the window and cut the labels off entirely.
               */
              marginHorizontal: TAB_BAR_SIDE_INSET,
              marginBottom: barBottom,
              height: TAB_BAR_HEIGHT,
              paddingTop: SPACING.sm,
              paddingBottom: SPACING.xs,
              borderRadius: RADIUS.xl,
              // A detached pill is bounded by its own silhouette, not by a
              // hairline where it meets the screen edge.
              borderTopWidth: 0,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border ?? palette.muted,
              shadowColor: CARD_SHADOW.shadowColor,
              shadowOpacity: CARD_SHADOW.shadowOpacity,
              shadowRadius: CARD_SHADOW.shadowRadius,
              shadowOffset: CARD_SHADOW.shadowOffset,
              elevation: CARD_SHADOW.elevation,
              // Cast because react-navigation types this as a plain
              // ViewStyle, while the view it lands on is animated. The
              // value is legal where it is used; only the type is narrow.
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, hideBy],
                  }),
                },
              ] as unknown as ViewStyle['transform'],
            }
          : {
              // In flow, the bar is either there or not: a page inside a
              // tab that asks for the whole screen (a dua category) puts
              // it away, and the page takes its height.
              display: hidden ? 'none' : 'flex',
              /**
               * Clear of the display's bottom corners — #42.
               *
               * Padding, not margin: the band itself should still run the
               * full width and bleed into the corners, because a surface
               * that stops short of the glass looks like a mistake. It is
               * the six labels inside it that have to come in, and the
               * outer two are the only things in the app that sit that
               * close to a corner. Zero on a square display, below Android
               * 12, and on iOS — see `useTabBarCornerInset`.
               */
              paddingHorizontal: cornerInset,
              // The page's own colour, not the card's: the bar is part of
              // the page it sits under, and a hairline is the only edge.
              // `accentSurface` is `palette.bg` verbatim until Tinted
              // surfaces is on, when it becomes a gentle accent anchor at
              // the page's own lightness.
              backgroundColor: palette.accentSurface,
              borderTopColor: palette.border ?? palette.muted,
              borderTopWidth: StyleSheet.hairlineWidth,
              // iPad gets NOTHING else — the original bar, exactly.
              // Overriding its height would drop the labels onto the home
              // indicator, since the navigator's own height folds in
              // `insets.bottom` and a fixed number cannot.
              //
              // A Mac window has no such inset, and Catalyst scales the
              // canvas down, so there the default bar is genuinely too
              // short to read and takes the taller one.
              ...(IS_MAC_CATALYST
                ? {
                    height: TAB_BAR_HEIGHT,
                    paddingTop: desktopSize(6),
                    paddingBottom: desktopSize(6),
                  }
                : null),
            },
        // Catalyst scales the whole canvas down for the Mac, so a label
        // designed at 10.5 lands near 8 — see responsive/desktop.ts.
        tabBarLabelStyle: { fontSize: desktopSize(10.5), fontWeight: '400' },
        tabBarShowLabel: !bigText,
        tabBarIconStyle: bigText ? styles.bigGlyph : undefined,
        // The bar is the app's own chrome; on iOS the blur belongs to the
        // system, so leave the default there.
        tabBarHideOnKeyboard: Platform.OS === 'android',
      })}
    >
      <Tab.Screen
        name="TodayTab"
        component={HomeScreen}
        options={{
          title: t('nav.today', 'Today'),
          tabBarIcon: TabHomeIcon,
          /**
           * NO HEADER ON THE PHONE (and on any window narrower than the
           * dashboard). Today's hero runs to the top of the screen, under
           * the status bar, and carries the location chip and the Qibla
           * chip in its top row — the wordmark and chip that lived here
           * are in the hero now, on the sky. The wide dashboard keeps its
           * card and this header; Catalyst draws its own bar as content.
           */
          headerShown: todayHeader,
          // Always "Mihrab" — a proper name, not a translated label.
          headerTitle: () => <MihrabHeaderTitle />,
          /**
           * The wordmark sits at the LEADING EDGE, not centred (v2.8.5).
           *
           * A centred title reserves the middle third of the bar for
           * itself and leaves `headerRight` whatever is left — which on a
           * phone is not enough for a city name, so "San Francisco Auto"
           * ran off the right edge. It is also simply wrong for a
           * wordmark: centring says "this is the name of the screen you
           * pushed", and Today is not pushed from anywhere.
           *
           * Set explicitly rather than left to the platform default: the
           * JS header centres on iOS and leads on Android, and this row is
           * the same row on both.
           */
          headerTitleAlign: 'left',
          /**
           * Mac Catalyst builds this row itself, in content (v2.9.2).
           *
           * The navigation bar cannot hold the location chip there: it is
           * transparent and sits inside the window's title-bar DRAG
           * REGION, so clicks on it get swallowed as window drags — which
           * is what sent the chip into the body in the first place. But
           * leaving the bar up with only the wordmark in it spent a whole
           * row on a word, and pushed the chip onto a SECOND row below it:
           * two bars where the Mac has one.
           *
           * So the bar goes, and Home renders wordmark and chip as one
           * row of content — same line, opposite ends, entirely below the
           * drag region. See HomeScreen's `macHeaderRow`.
           */
          ...(isMacCatalyst
            ? {}
            : { headerRight: () => <HomeHeaderControls /> }),
        }}
      />
      <Tab.Screen
        name="QuranTab"
        component={QuranScreen}
        options={{
          title: t('nav.quran'),
          tabBarIcon: TabBookIcon,
          /**
           * NO TITLE BAR ON ANY TAB. The page begins at the status bar
           * (`useTabPageTop`), and what the bar used to hold moved into
           * the page: Quran's Tilāwah and sync controls are its first
           * row, the Log's sync is in its options menu, the arrow back to
           * Today is gone — the tab bar is the way between tabs, and the
           * hardware button still goes home (`decideAndroidBack`).
           */
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="TasbihTab"
        component={TasbihScreen}
        options={{
          title: t('nav.tasbih'),
          tabBarIcon: TabTasbihIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="DuasTab"
        component={DuasScreen}
        options={{
          title: t('nav.duas'),
          tabBarIcon: TabDuasIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="LogTab"
        component={LogScreen}
        options={{
          title: t('log.title', 'Log'),
          tabBarIcon: TabLogIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: t('nav.settings'),
          tabBarIcon: TabSettingsIcon,
          headerShown: false,
        }}
      />
    </Tab.Navigator>
    </MinimalScreens>
  );
}

const styles = StyleSheet.create({
  // A glyph a quarter larger, in the room the label gave up.
  bigGlyph: { transform: [{ scale: 1.25 }] },
  // The window before the settings are read: the page's colour, nothing on it.
  unhydrated: { flex: 1 },
});
