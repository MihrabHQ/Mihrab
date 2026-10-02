import { useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { TabBackButton } from './TabBackButton';
import { useLayoutRtl } from '../i18n/useLayoutRtl';

/**
 * iOS, app in Arabic or Urdu: the back chevron on the RIGHT of a pushed
 * page's native header, where the rest of the app has it.
 *
 * The app mirrors itself with a Yoga `direction` rather than
 * `I18nManager.forceRTL` (see `i18n/useLayoutRtl`), so the pages whose bar
 * is drawn in JS — every settings page, the Duas category view — put the
 * arrow at the trailing edge of the device and point it that way. A native
 * stack header is laid out by UIKit by the DEVICE's direction, which stays
 * left-to-right, so Tilawah and Khatmah had their arrow on the left: the
 * same control on the opposite side from one page to the next.
 *
 * So in a right-to-left app the system back control is hidden and
 * `TabBackButton` stands in `headerRight`, glyph flipped by the app's
 * direction (not `inNativeHeader`, which would follow the device's and
 * point it away from the edge it sits on). The swipe-back gesture is
 * the system's and is untouched.
 *
 * Not used by the muṣḥaf reader on purpose: its header is the page's, with
 * the riwayah beside the arrow on the left, and stays as it is.
 *
 * Android is left alone: its toolbar arrow is the platform's own placement
 * and was not part of the drift.
 */
export function useTrailingBackInRtl(
  navigation: NavigationProp<ParamListBase>,
): void {
  const rtl = useLayoutRtl();
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions(
      rtl
        ? {
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: () => (
              <TabBackButton onPress={() => navigation.goBack()} />
            ),
          }
        : {
            headerBackVisible: true,
            headerLeft: undefined,
            headerRight: undefined,
          },
    );
  }, [navigation, rtl]);
}
