/**
 * Settings → Widgets (Android): the prayer-times widgets as the home screen
 * shows them now, at the head of the page, following the controls under it.
 *
 * BOTH CARDS — the Prayer times strip and the tall one with its graph. A
 * widget's own settings screen (touch and hold it → Settings) shows the card
 * it was opened from; this page cannot know which the reader has placed, and
 * they may have placed both, so it shows the two.
 *
 * The picture is the native one (`WidgetPreviewCard.kt`, through
 * `renderPreviews`): the same drawing the widget's own screen uses, from the
 * day and the colours the widgets hold — so the two places cannot show
 * different cards. It is asked for again a moment after a setting changes:
 * the settings reach the widgets' store through `syncWidgetUiHints`, and the
 * picture is drawn from that store.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings, useWidgetSettings } from '../../context/PrayerSettingsContext';
import { getPrayerWidgetModule } from '../../native/PrayerWidget';
import { SPACING } from '../../theme/tokens';

/** After a change: long enough for the setting to be written to the widgets' store. */
export const PREVIEW_AFTER_CHANGE_MS = 350;

type Picture = { uri: string; width: number; height: number };

function WidgetPreviewsImpl() {
  const { t } = useTranslation();
  const { slice: widget } = useWidgetSettings();
  const { slice: appearance } = useAppearanceSettings();
  const [width, setWidth] = useState(0);
  const [picture, setPicture] = useState<Picture | null>(null);
  // The latest request wins: a slow picture never lands over a newer one.
  const asked = useRef(0);

  useEffect(() => {
    const render = getPrayerWidgetModule()?.renderPreviews;
    if (Platform.OS !== 'android' || !render || width <= 0) return;
    const mine = ++asked.current;
    const timer = setTimeout(
      () => {
        render(width)
          .then(p => {
            if (mine === asked.current && p?.uri) setPicture(p);
          })
          .catch(() => {
            // No picture is no page broken: the controls stand without it.
          });
      },
      picture ? PREVIEW_AFTER_CHANGE_MS : 0,
    );
    return () => clearTimeout(timer);
    // Every widget setting, and the app's colours the widgets follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, widget, appearance]);

  if (Platform.OS !== 'android' || !getPrayerWidgetModule()?.renderPreviews) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth(prev => (prev === w ? prev : w));
  };
  return (
    <View
      onLayout={onLayout}
      style={styles.box}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('settings.prayerWidgetTitle', 'Prayer times widget')}>
      {picture && width > 0 ? (
        <Image
          source={{ uri: picture.uri }}
          // The picture's own shape at the page's width.
          style={{ width, height: (width * picture.height) / picture.width }}
          resizeMode="contain"
          fadeDuration={0}
        />
      ) : null}
    </View>
  );
}

export const WidgetPreviews = memo(WidgetPreviewsImpl);

const styles = StyleSheet.create({
  box: { marginBottom: SPACING.md },
});
