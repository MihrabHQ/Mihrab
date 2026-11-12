/**
 * Settings → Widgets (Android): the widgets on the home screen as they are
 * drawn now, at the head of the page, following the controls under it.
 *
 * ONE OF EACH KIND PLACED — the prayer times first, then the Log's, then
 * the rest — side by side, a swipe apart: a reader with the tall
 * prayer-times card and the Log's sees both, and the page stays a page of
 * controls rather than a column of cards. With none placed, the two
 * prayer-times cards. (A widget's own settings screen — touch and hold it →
 * Settings — shows the one it was opened from.)
 *
 * The pictures are the widgets themselves: each composed by its own code at
 * the size it is placed at (`WidgetLivePreview.kt`, through
 * `renderPreviews`), so a sample cannot show a card the home screen does
 * not. They are asked for again a moment after a setting changes: the
 * settings reach the widgets' store through `syncWidgetUiHints`, and the
 * cards are composed from that store.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings, useWidgetSettings } from '../../context/PrayerSettingsContext';
import { getPrayerWidgetModule, type WidgetPicture } from '../../native/PrayerWidget';
import { SPACING } from '../../theme/tokens';

/** After a change: long enough for the setting to be written to the widgets' store. */
export const PREVIEW_AFTER_CHANGE_MS = 350;
/** What shows of the next card beside the one in view: there is more, a swipe away. */
export const PREVIEW_PEEK = 28;

function WidgetPreviewsImpl() {
  const { t } = useTranslation();
  const { slice: widget } = useWidgetSettings();
  const { slice: appearance } = useAppearanceSettings();
  const [width, setWidth] = useState(0);
  const [pictures, setPictures] = useState<WidgetPicture[]>([]);
  // The latest request wins: a slow picture never lands over a newer one.
  const asked = useRef(0);
  const drawn = pictures.length > 0;
  // One card's width: the page's, less the peek of the next.
  const cardWidth = Math.max(0, width - PREVIEW_PEEK - SPACING.sm);

  useEffect(() => {
    const render = getPrayerWidgetModule()?.renderPreviews;
    if (Platform.OS !== 'android' || !render || cardWidth <= 0) return;
    const mine = ++asked.current;
    const timer = setTimeout(
      () => {
        render(cardWidth)
          .then(list => {
            if (mine === asked.current && Array.isArray(list)) setPictures(list.filter(p => p?.uri));
          })
          .catch(() => {
            // No picture is no page broken: the controls stand without it.
          });
      },
      drawn ? PREVIEW_AFTER_CHANGE_MS : 0,
    );
    return () => clearTimeout(timer);
    // Every widget setting, and the app's colours the widgets follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardWidth, widget, appearance]);

  if (Platform.OS !== 'android' || !getPrayerWidgetModule()?.renderPreviews) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth(prev => (prev === w ? prev : w));
  };
  const one = pictures.length === 1;
  return (
    <View
      onLayout={onLayout}
      style={styles.box}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('settings.widgetsAllTitle', 'All widgets')}>
      {drawn && cardWidth > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // A card at a time; the last one comes to rest at the page's edge.
          snapToInterval={cardWidth + SPACING.sm}
          decelerationRate="fast"
          scrollEnabled={!one}
          contentContainerStyle={[styles.row, one && { paddingHorizontal: (width - cardWidth) / 2 }]}>
          {pictures.map(p => (
            <Image
              key={p.kind}
              source={{ uri: p.uri }}
              // The picture's own shape at the card's width.
              style={{ width: cardWidth, height: (cardWidth * p.height) / p.width }}
              resizeMode="contain"
              fadeDuration={0}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export const WidgetPreviews = memo(WidgetPreviewsImpl);

const styles = StyleSheet.create({
  box: { marginBottom: SPACING.md },
  row: { gap: SPACING.sm, alignItems: 'flex-start' },
});
