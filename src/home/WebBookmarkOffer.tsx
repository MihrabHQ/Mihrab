/**
 * Mihrab Web's one ask, once: keep the page somewhere it is found again.
 *
 * A visitor who came for today's times leaves with them, and the next time
 * they wonder when ʿaṣr is they will not remember the address. So the first
 * time Home opens after the walkthrough, a sheet says how to keep it close
 * in the browser they are using: Add to Home Screen on iPhone and iPad, the
 * browser's own install offer where there is one (Chrome, Edge), the menu
 * on Android, and the bookmark keys everywhere else. Settings and
 * bookmarks stay in this browser, which is the other reason to come back
 * to the same one.
 *
 * Not shown when the page is already running from a home screen or as an
 * installed app — that visitor has done it. "Got it" is an answer, not a
 * snooze, as with the theme offer beside it.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_WEB_APP, webApp } from '../config/webApp';
import { useAppPalette } from '../hooks/useAppPalette';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';

export const WEB_BOOKMARK_OFFER_KEY = 'mihrab.webBookmarkOffer.v1';
/** Long enough to see the times first. */
const OFFER_DELAY_MS = 2500;

export function WebBookmarkOffer({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!IS_WEB_APP || !ready || webApp.standalone()) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.getItem(WEB_BOOKMARK_OFFER_KEY)
      .then(answered => {
        if (!live || answered === '1') return;
        timer = setTimeout(() => {
          if (live) setVisible(true);
        }, OFFER_DELAY_MS);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  if (!IS_WEB_APP) return null;

  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(WEB_BOOKMARK_OFFER_KEY, '1').catch(() => undefined);
  };

  const platform = webApp.platform();
  const canInstall = webApp.canInstall();
  const how = canInstall
    ? null
    : platform === 'ios'
      ? t('webApp.keepIos', 'Tap Share, then “Add to Home Screen”.')
      : platform === 'android'
        ? t('webApp.keepAndroid', 'Open the browser’s menu ⋮ and choose “Add to Home screen”.')
        : t('webApp.keepDesktop', {
            keys: platform === 'mac' ? '⌘ D' : 'Ctrl + D',
            defaultValue: 'Press {{keys}} to bookmark this page.',
          });

  return (
    <ResponsiveModal visible={visible} onClose={close} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[typeStyle('title3'), { color: palette.text }]}>
            {t('webApp.keepTitle', 'Keep Mihrab close')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t(
              'webApp.keepBody',
              'Bookmark this page to check the prayer times whenever you need them. Your settings and bookmarks are kept in this browser.',
            )}
          </Text>
        </View>
        {how ? (
          <Text testID="web-bookmark-how" style={[typeStyle('headline'), { color: palette.text }]}>
            {how}
          </Text>
        ) : null}
        {canInstall ? (
          <Pressable
            testID="web-bookmark-install"
            accessibilityRole="button"
            onPress={() => {
              close();
              void webApp.install();
            }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: palette.accentSolid },
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[typeStyle('headline'), { color: palette.onAccent }]}>
              {t('webApp.install', 'Add Mihrab to this device')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="web-bookmark-done"
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: canInstall ? palette.controlBg : palette.accentSolid },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: canInstall ? palette.text : palette.onAccent }]}>
            {canInstall ? t('onboarding.notNow', 'Not now') : t('webApp.gotIt', 'Got it')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  head: { gap: SPACING.xs },
  button: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  pressed: { opacity: 0.7 },
});
