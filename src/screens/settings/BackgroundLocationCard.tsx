/**
 * Settings → Location: "Update my location in the background" (Android).
 *
 * Optional, off until asked for, and said to be optional in three places:
 * the row's own explanation, the question the app asks BEFORE Android's
 * (what it is for, that Android will say "all the time", that the app
 * works without it), and what it says when Android was told no. See
 * `location/backgroundLocation.ts` for what turning it on does.
 *
 * Shown only where it can work: an Android build that declares the
 * permission, and "My location" as the place (a place of the reader's own
 * does not follow the phone).
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
      // required. Android's follows only on "Continue".
      setAsking(true);
    },
    [read],
  );

  if (Platform.OS !== 'android' || !state?.offered) return null;
  if (settings.locationMode === 'manual') return null;
  const on = state.wished && state.permitted;
  const refused = !on && (declined || (state.wished && !state.permitted));
  return (
    <SettingsGroup>
      <ConfirmModal
        visible={asking}
        title={t('settings.backgroundLocationAskTitle', 'Location in the background')}
        message={t(
          'settings.backgroundLocationAsk',
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
        title={t('settings.backgroundLocationTitle', 'Update my location in the background')}
        help={
          refused
            ? t(
                'settings.backgroundLocationDenied',
                'Android has not allowed location access “all the time”, so this is off. You can allow it in Android’s settings for Mihrab, under Permissions → Location.',
              )
            : t(
                'settings.backgroundLocationHelp',
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
