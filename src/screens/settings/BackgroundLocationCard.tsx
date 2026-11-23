/**
 * Settings → Location: "Update my location in the background" (Android,
 * and the iPhone as a preview — the row says "Preview", and its words name
 * iOS's own "Always"). The walkthrough's alerts screen shows this same
 * card once alerts are on (`onboarding/screens/AlertsScreen.tsx`).
 *
 * Optional, off until asked for, and said to be optional in three places:
 * the row's own explanation, the question the app asks BEFORE Android's
 * (what it is for, that Android will say "all the time", that the app
 * works without it), and what it says when Android was told no. See
 * `location/backgroundLocation.ts` for what turning it on does.
 *
 * Shown only where it can work: a build that offers it (an Android build
 * that declares the permission, an iPhone or iPad, the Mac, the desktop
 * app on Windows and Linux), and "My location" as the place (a place of
 * the reader's own does not follow the phone). The iPhone, the Mac and the
 * desktop say "Preview", each in its own words: what it watches, and what
 * it asks of the system. The desktop asks the system nothing, so it has no
 * question before it — it asks the computer for a position instead, and
 * says where location is allowed when there is none.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { useLocationSettings } from '../../context/PrayerSettingsContext';
import {
  backgroundLocationState,
  turnOffBackgroundLocation,
  turnOnBackgroundLocation,
  type BackgroundLocationState,
} from '../../location/backgroundLocation';
import { SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { isMacCatalyst } from '../../responsive/breakpoints';

/** Whose words: the phone's OS, the Mac's, or the computer's (Windows, Linux). */
type Words = 'android' | 'ios' | 'mac' | 'desktop';
const words: Words =
  Platform.OS === 'web' ? 'desktop' : isMacCatalyst ? 'mac' : Platform.OS === 'ios' ? 'ios' : 'android';
const KEY_SUFFIX: Record<Words, string> = { android: '', ios: 'Ios', mac: 'Mac', desktop: 'Desktop' };
const key = (base: string) => `settings.${base}${KEY_SUFFIX[words]}`;

function BackgroundLocationCardImpl() {
  const { t } = useTranslation();
  const { slice: settings } = useLocationSettings();
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<BackgroundLocationState | null>(null);
  const [busy, setBusy] = useState(false);
  // Android was asked just now and said no: say where it can be allowed.
  const [declined, setDeclined] = useState(false);

  const read = useCallback(() => {
    backgroundLocationState()
      .then(setState)
      .catch(() => setState(null));
  }, []);
  useEffect(() => {
    read();
    // Back from Android's settings, where "all the time" is given or taken.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') read();
    });
    return () => sub.remove();
  }, [read]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      setDeclined((await turnOnBackgroundLocation()) === 'declined');
    } finally {
      setBusy(false);
      read();
    }
  }, [read]);

  const onChange = useCallback(
    (next: boolean) => {
      setDeclined(false);
      if (!next) {
        void turnOffBackgroundLocation().then(read);
        return;
      }
      // The app's own question first: what it is for, and that it is not
      // required. Android's follows only on "Continue". The desktop has
      // no system question to prepare for: the row's own words say it all.
      if (words === 'desktop') void turnOn();
      else setAsking(true);
    },
    [read, turnOn],
  );

  if (!state?.offered) return null;
  // A preview everywhere but Android, and says so.
  const preview = words !== 'android';
  if (settings.locationMode === 'manual') return null;
  const on = state.wished && state.permitted;
  const refused = !on && (declined || (state.wished && !state.permitted));
  return (
    <SettingsGroup>
      <ConfirmModal
        visible={asking}
        title={t('settings.backgroundLocationAskTitle', 'Location in the background')}
        message={t(
          key('backgroundLocationAsk'),
          'To move your prayer alerts and widgets when you travel, Mihrab needs to read your location while the app is closed. Android will ask you to allow location access “all the time”.\n\nThis is optional. It is used only to keep your prayer times on the place you are in, and Mihrab works without it.',
        )}
        confirmLabel={t('common.continue', 'Continue')}
        cancelLabel={t('onboarding.notNow', 'Not now')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void turnOn();
        }}
      />
      <SettingsToggleRow
        title={
          preview
            ? `${t('settings.backgroundLocationTitle', 'Update my location in the background')} · ${t('settings.previewTag', 'Preview')}`
            : t('settings.backgroundLocationTitle', 'Update my location in the background')
        }
        help={
          refused
            ? t(
                key('backgroundLocationDenied'),
                'Android has not allowed location access “all the time”, so this is off. You can allow it in Android’s settings for Mihrab, under Permissions → Location.',
              )
            : t(
                key('backgroundLocationHelp'),
                'Optional. When you travel, your prayer alerts and widgets move to the new place without the app being opened. It does not follow you around: it looks only when your phone has moved far or changed network country or time zone, so it hardly touches the battery, and nothing more is sent than when the app is open. Without this, your location is updated when you open the app.',
              )
        }
        helpDanger={refused}
        value={on}
        disabled={busy}
        onValueChange={onChange}
        testID="background-location-toggle"
      />
    </SettingsGroup>
  );
}

export const BackgroundLocationCard = memo(BackgroundLocationCardImpl);
