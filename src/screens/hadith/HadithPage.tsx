/**
 * The frame a Hadith list or entry sits in, pushed over the tabs: the
 * settings pages' pinned bar (opaque page colour, `TabBackButton`, centred
 * title, a slot opposite the arrow), and the page under it. The body is
 * the caller's — a FlatList for a list, a ScrollView for an entry — so it
 * is handed the bottom it must clear.
 */
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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

type Props = {
  title: string;
  /** Opposite the back arrow. */
  end?: ReactNode;
  /**
   * The page, given the room it must leave at its foot, and what its
   * scroller reports its scrolling to: the bar draws a line under itself
   * while there is text behind it.
   */
  children: (bottom: number, onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void) => ReactNode;
};

export function HadithPage({ title, end, children }: Props) {
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

  // What sits opposite the arrow is measured, and both sides are given its
  // width: the title stays centred and is cut short before it reaches it.
  // The sides had no width of their own (basis 0, never shrinking), so the
  // reader's text-size control lay over the end of "an-Nawawi's Forty"
  // (Pixel 10 Pro, 2026-11-26).
  const [endWidth, setEndWidth] = useState(0);
  const side = endWidth ? { flexBasis: endWidth } : null;

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
          <View style={[styles.barSide, side]}>
            <TabBackButton label={t('nav.hadith')} onPress={goBack} />
          </View>
          <Text
            style={[styles.title, { color: palette.text }]}
            numberOfLines={1}
            // Beside the reader's text-size control a phone has room for
            // "an-Nawawi's Forty" and not a point more: the two touched.
            // The title gives up a little of its size before it gives up
            // its last letters.
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <View style={[styles.barSide, styles.barSideEnd, side]}>
            {end ? (
              <View
                onLayout={e => {
                  const w = Math.ceil(e.nativeEvent.layout.width);
                  if (w !== endWidth) setEndWidth(w);
                }}
              >
                {end}
              </View>
            ) : null}
          </View>
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
  title: { flexShrink: 1, fontSize: TYPE.title2.fontSize, fontWeight: '500', textAlign: 'center' },
  barSide: { flexGrow: 1, flexShrink: 0, flexBasis: 0, flexDirection: 'row', alignItems: 'center' },
  barSideEnd: { justifyContent: 'flex-end' },
});
