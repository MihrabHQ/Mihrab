/**
 * The frame a Hadith list or entry sits in, pushed over the tabs: the
 * settings pages' pinned bar (opaque page colour, `TabBackButton`, centred
 * title, a slot opposite the arrow), and the page under it. The body is
 * the caller's — a FlatList for a list, a ScrollView for an entry — so it
 * is handed the bottom it must clear.
 */
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../../hooks/useAppPalette';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import { TabBackButton } from '../../navigation/TabBackButton';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { setSystemBarSurface } from '../../navigation/systemBarSurface';
import { useAndroidSubScreenBack } from '../../navigation/useAndroidSubScreenBack';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';

/** Room for a title to be measured in at full size, on one line. */
const MEASURE_WIDTH = 4000;

type Props = {
  title: string;
  /** Opposite the back arrow. */
  end?: ReactNode;
  /**
   * The page alone: no bar and no status bar, the whole glass the body's (a book's pages read full
   * screen). The caller gives the way back out; Android's back button is the caller's to answer too.
   */
  bare?: boolean;
  /**
   * The page, given the room it must leave at its foot, and what its
   * scroller reports its scrolling to: the bar draws a line under itself
   * while there is text behind it.
   */
  children: (bottom: number, onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void) => ReactNode;
};

/** The least of its size a title is drawn at, to fit: 22 pt down to 16. Below that it is cut short. */
export const TITLE_MIN_SCALE = 0.72;

/**
 * How much of its size a title is drawn at, to fit `room`: all of it where
 * it fits or nothing is measured yet, as little as it needs otherwise, and
 * never under TITLE_MIN_SCALE.
 */
export function titleScale(room: number, natural: number): number {
  if (!(room > 0) || !(natural > 0) || natural <= room) return 1;
  // A hair under the exact ratio: glyph widths do not scale to the last pixel.
  return Math.max(TITLE_MIN_SCALE, Math.floor((room / natural) * 100) / 100 - 0.01);
}

export function HadithPage({ title, end, bare, children }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const systemBottom = useSystemNavigationReserve();
  useAndroidSubScreenBack();

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    // Opened by a link on a cold start, with nothing under it.
    else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Home', params: { screen: 'HadithTab' } }] }));
  };

  // THE TITLE HAS THE ROOM BETWEEN THE ARROW AND WHAT IS OPPOSITE IT, and is
  // centred in that room — not on the screen. Centred on the screen, with
  // both sides given the text-size control's width, "Riyad as-Salihin · 11"
  // had a third of the bar and ran on under the control (Pixel 10 Pro,
  // 2026-11-26, the second time; "an-Nawawi's Forty" was the first).
  //
  // To fit, it is drawn smaller, down to TITLE_MIN_SCALE of its size and no
  // further; what still does not fit ends in "…". The size is worked out
  // here — the room, over the width the title has at full size, measured on
  // a copy nobody sees — and not left to `adjustsFontSizeToFit`, which let
  // the title overflow its box on Android (and has its own history here:
  // `__tests__/surahGlyphNoAutoShrink.test.ts`).
  //
  // A page with nothing opposite the arrow keeps its title centred on the
  // screen: the far side is given the arrow's width.
  const [startWidth, setStartWidth] = useState(0);
  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState<{ title: string; width: number } | null>(null);
  const measured = natural?.title === title ? natural.width : 0;
  const titleSize = TYPE.title2.fontSize * titleScale(room, measured);

  // A line under the bar once the page has moved: the bar is the page's own
  // colour, and a line of text cut off by it looked like a fault in the text.
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const now = e.nativeEvent.contentOffset.y > 1;
    setScrolled(was => (was === now ? was : now));
  }, []);

  const pageBg = typeof palette.bg === 'string' ? palette.bg : null;
  useLayoutEffect(() => {
    if (!pageBg) return undefined;
    return setSystemBarSurface({ color: pageBg, isDark: palette.isDark });
  }, [pageBg, palette.isDark]);

  if (bare) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        {/* As the muṣḥaf's full screen has it: RN applies the most recently mounted StatusBar, and the
            root's is applied again when this one is gone. */}
        <StatusBar hidden animated />
        <View style={styles.body}>{children(systemBottom, onScroll)}</View>
      </View>
    );
  }
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <CenteredColumn
        style={[
          styles.barPinned,
          { paddingTop: insets.top + SPACING.md, backgroundColor: palette.bg },
          { borderBottomColor: scrolled ? palette.border ?? palette.muted : 'transparent' },
        ]}
      >
        <View style={styles.bar}>
          <View
            style={styles.barSide}
            onLayout={e => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              if (w !== startWidth) setStartWidth(w);
            }}
          >
            <TabBackButton label={t('nav.hadith')} onPress={goBack} />
          </View>
          <View
            style={styles.titleRoom}
            onLayout={e => {
              const w = Math.floor(e.nativeEvent.layout.width);
              if (w !== room) setRoom(w);
            }}
          >
            {/* The title at full size, on one line as long as it likes: only measured. */}
            <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text
                style={styles.title}
                numberOfLines={1}
                maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}
                onLayout={e => {
                  const width = Math.ceil(e.nativeEvent.layout.width);
                  if (natural?.title !== title || natural.width !== width) setNatural({ title, width });
                }}
              >
                {title}
              </Text>
            </View>
            <Text
              style={[styles.title, { color: palette.text, fontSize: titleSize }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}
              accessibilityRole="header"
              testID="hadith-page-title"
            >
              {title}
            </Text>
          </View>
          <View style={[styles.barSide, styles.barSideEnd, end ? null : { width: startWidth }]}>{end ?? null}</View>
        </View>
      </CenteredColumn>
      <View style={styles.body}>{children(SPACING.xl + systemBottom, onScroll)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  barPinned: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  bar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginStart: -SPACING.sm },
  titleRoom: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { fontSize: TYPE.title2.fontSize, fontWeight: '500', textAlign: 'center' },
  // Wide enough that no title is cut in it; drawn by nobody.
  measure: { position: 'absolute', top: 0, start: 0, width: MEASURE_WIDTH, flexDirection: 'row', opacity: 0 },
  barSide: { flexGrow: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  barSideEnd: { justifyContent: 'flex-end' },
});
