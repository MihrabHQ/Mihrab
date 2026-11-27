import { getPositionStaged } from '../utils/getPosition';
import { locationAvailability } from '../native/Geolocation';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type ScrollViewInstance,
} from 'react-native';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { GeocodedPlace } from '../geocoding/nominatim';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { inputChromeStyle } from '../theme/chrome';
import { MapPinIcon, SearchIcon } from '../theme/icons';
import { RADIUS, SPACING } from '../theme/tokens';
import { PlaceSearchSection } from './PlaceSearchSection';

type Palette = {
  bg: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  /** Plain "#RRGGBB" accent for SVG icon fills (task #104). */
  accentSolid: string;
  /** The ink that reads on an accent fill — the palette's own answer. */
  onAccent: string;
  card: ColorValue;
  danger: ColorValue;
  flatChrome: boolean;
};

type Props = {
  palette: Palette;
  /**
   * Drop the widget's own headline and subtitle.
   *
   * For the first-launch flow, which asks "Where are you?" in its own
   * type and adds the sentence about coordinates never leaving the
   * device. With both showing, the screen asked the question twice and
   * answered it twice — "Where are you?" over "Set your location", and
   * two near-identical sentences beginning "Prayer times depend on where
   * you…". Settings has no heading of its own above this, so it keeps
   * them.
   */
  hideIntro?: boolean;
  /**
   * Why the app is showing this instead of the day: the phone's Location is
   * off, or it has nothing to find a position with. Said at once, so the
   * screen does not arrive unexplained.
   */
  unavailable?: 'off' | 'none';
};

export function LocationSetup({ palette, hideIntro, unavailable }: Props) {
  const { t } = useTranslation();
  const { updateSettings } = usePrayerSettings();
  const [step, setStep] = useState<'choose' | 'manual'>('choose');
  // One ref for both steps: only ever one of them is mounted.
  // Taken apart here: the padding read off an object that also holds the
  // ref is, to the React Compiler, a ref read while rendering.
  const { ref: kbRef, contentPadding: kbPadding } = useKeyboardAwareScroll<ScrollViewInstance>();
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(() =>
    unavailable ? t(unavailable === 'off' ? 'errors.locationOff' : 'errors.locationNone') : null,
  );
  /** Location is switched off on the phone: the message offers the way to its switch. */
  const [locationOff, setLocationOff] = useState(unavailable === 'off');

  // Back from the phone's settings with Location on: the message is no
  // longer true, so it goes. The button is theirs to press.
  useEffect(() => {
    if (!locationOff) return undefined;
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') return;
      locationAvailability()
        .then(can => {
          if (can !== 'ok') return;
          setLocationOff(false);
          setGpsError(null);
        })
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [locationOff]);
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [placeLabel, setPlaceLabel] = useState<string | undefined>();
  const [coordError, setCoordError] = useState<string | null>(null);

  const onSelectPlace = (place: GeocodedPlace) => {
    setDraftLat(String(place.latitude));
    setDraftLng(String(place.longitude));
    setPlaceLabel(place.displayName);
    setCoordError(null);
    updateSettings({
      locationMode: 'manual',
      manualLatitude: place.latitude,
      manualLongitude: place.longitude,
      manualLocationLabel: place.displayName,
      locationOnboardingComplete: true,
    });
  };

  const completeManual = () => {
    const lat = parseFloat(draftLat.replace(',', '.'));
    const lng = parseFloat(draftLng.replace(',', '.'));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError(t('errors.coordLat'));
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setCoordError(t('errors.coordLng'));
      return;
    }
    setCoordError(null);
    updateSettings({
      locationMode: 'manual',
      manualLatitude: lat,
      manualLongitude: lng,
      manualLocationLabel: placeLabel,
      locationOnboardingComplete: true,
    });
  };

  const useDeviceLocation = () => {
    setGpsError(null);
    setLocationOff(false);
    setGpsBusy(true);
    const run = async () => {
      // Asked first, and of the phone rather than found out by waiting: a
      // phone with Location off, or a tablet with nothing to find a
      // position with, spun here until a timeout and then said only
      // "Location request timed out" (Android 16 tablet emulator,
      // 2026-11-27). Each is said, with what to do about it.
      const can = await locationAvailability();
      if (can !== 'ok') {
        setLocationOff(can === 'off');
        setGpsError(t(can === 'off' ? 'errors.locationOff' : 'errors.locationNone'));
        setGpsBusy(false);
        return;
      }
      try {
        if (Platform.OS === 'android') {
          // Accept an "Approximate" (coarse) grant too — enough for prayer
          // times and works over Wi-Fi when GPS is unavailable.
          const perm = await requestAndroidLocationPermission();
          if (perm !== 'granted') {
            setGpsError(t('errors.gpsPermission'));
            setGpsBusy(false);
            return;
          }
        }
        // Staged locator: a fast Wi-Fi/cell fix first (works indoors, where
        // people usually set the app up), refined by GPS. onFix may fire
        // twice — the second (precise) fix just updates the saved coords.
        // And a limit of our own: a provider that is there and never
        // answers must not leave the button spinning.
        let settled = false;
        const giveUp = setTimeout(() => {
          if (settled) return;
          settled = true;
          setGpsError(t('errors.locationNotFound'));
          setGpsBusy(false);
        }, 30_000);
        getPositionStaged(
          fix => {
            settled = true;
            clearTimeout(giveUp);
            setGpsError(null);
            // Persist the coords as lastFetched so usePrayerDay's effect
            // re-fires even when locationMode/onboardingComplete are
            // already set (e.g., re-entering after a manual_required
            // bounce — #125). Otherwise pressing "Use automatic" would
            // be a silent no-op because the settings didn't change.
            updateSettings({
              locationMode: 'automatic',
              locationOnboardingComplete: true,
              manualLocationLabel: undefined,
              lastFetchedLatitude: fix.latitude,
              lastFetchedLongitude: fix.longitude,
            });
            setGpsBusy(false);
          },
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(giveUp);
            // In the reader's language, with what to do next: the native
            // message is English and names only the failure.
            setGpsError(t('errors.locationNotFound'));
            setGpsBusy(false);
          },
        );
      } catch (e) {
        setGpsError(
          e instanceof Error ? e.message : t('errors.gpsRequest'),
        );
        setGpsBusy(false);
      }
    };
    run().catch(() => {
      setGpsBusy(false);
    });
  };

  const searchPalette = {
    bg: palette.bg,
    text: palette.text,
    muted: palette.muted,
    border: palette.border,
    accent: palette.accent,
    accentBg: palette.accentBg,
    card: palette.card,
    danger: palette.danger,
    flatChrome: palette.flatChrome,
  };

  if (step === 'choose') {
    return (
      <ScrollView
        ref={kbRef}
        automaticallyAdjustKeyboardInsets
        style={[styles.fill, { backgroundColor: palette.bg }]}
        contentContainerStyle={[styles.chooseContent, kbPadding]}
        keyboardShouldPersistTaps="handled">
        {hideIntro ? null : (
          <>
            <Text style={[styles.headline, { color: palette.text }]}>
              {t('locationSetup.headline')}
            </Text>
            <Text style={[styles.sub, { color: palette.muted }]}>
              {t('locationSetup.sub')}
            </Text>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('locationSetup.useAutomatic')}
          accessibilityState={{ busy: gpsBusy, disabled: gpsBusy }}
          disabled={gpsBusy}
          onPress={useDeviceLocation}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.accent },
            gpsBusy && styles.primaryBtnBusy,
          ]}>
          {gpsBusy ? (
            <ActivityIndicator color={String(palette.onAccent)} />
          ) : (
            <View style={styles.btnContent}>
              <MapPinIcon size={20} color={String(palette.onAccent)} />
              <Text style={[styles.primaryBtnLabel, { color: palette.onAccent }]}>
                {t('locationSetup.useAutomatic')}
              </Text>
            </View>
          )}
        </Pressable>
        {gpsError && (
          <Text style={[styles.err, { color: palette.danger }]}>{gpsError}</Text>
        )}
        {locationOff && Platform.OS === 'android' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
                Linking.openSettings().catch(() => undefined);
              });
            }}
            testID="location-open-settings"
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.linkBtnLabel, { color: palette.accent }]}>
              {t('locationSetup.openLocationSettings')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('locationSetup.searchCoords')}
          onPress={() => setStep('manual')}
          style={[
            styles.secondaryBtn,
            palette.flatChrome
              ? {
                  borderWidth: 0,
                  borderColor: 'transparent',
                  backgroundColor: palette.card,
                }
              : { borderColor: palette.border },
          ]}>
          <View style={styles.btnContent}>
            <SearchIcon size={20} color={palette.accentSolid} />
            <Text style={[styles.secondaryLabel, { color: palette.accent }]}>
              {t('locationSetup.searchCoords')}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={kbRef}
      automaticallyAdjustKeyboardInsets
      style={[styles.fill, { backgroundColor: palette.bg }]}
      contentContainerStyle={[styles.manualContent, kbPadding]}
      keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => setStep('choose')}
        hitSlop={12}>
        <Text style={[styles.back, { color: palette.accent }]}>
          ← {t('common.back')}
        </Text>
      </Pressable>
      <Text style={[styles.headline, { color: palette.text }]}>
        {t('locationSetup.manualHeadline')}
      </Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        {t('locationSetup.manualSub')}
      </Text>
      <PlaceSearchSection palette={searchPalette} onSelectPlace={onSelectPlace} />
      <Text style={[styles.advLabel, { color: palette.muted }]}>
        {t('locationSetup.decimalCoords')}
      </Text>
      <TextInput
        value={draftLat}
        onChangeText={t => {
          setDraftLat(t);
          setPlaceLabel(undefined);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder={t('settings.latPlaceholder')}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          inputChromeStyle(palette),
          {
            color: palette.text,
            backgroundColor: palette.bg,
          },
        ]}
      />
      <TextInput
        value={draftLng}
        onChangeText={t => {
          setDraftLng(t);
          setPlaceLabel(undefined);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder={t('settings.lngPlaceholder')}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          inputChromeStyle(palette),
          {
            color: palette.text,
            backgroundColor: palette.bg,
          },
        ]}
      />
      {coordError && (
        <Text style={[styles.err, { color: palette.danger }]}>{coordError}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.continue')}
        onPress={completeManual}
        style={[styles.primaryBtn, { backgroundColor: palette.accent }]}>
        <Text style={[styles.primaryBtnLabel, { color: palette.onAccent }]}>{t('common.continue')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  chooseContent: {
    padding: SPACING.xl,
    paddingTop: SPACING.xxxl,
    gap: SPACING.lg,
  },
  manualContent: {
    padding: SPACING.xl,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl + SPACING.sm, // 40 — between xxl (32) and xxxl (48)
  },
  headline: {
    fontSize: 24, // tokens-ok-line: hero one-off; will move to TYPE.title1 in #36 sweep
    fontWeight: '500',
  },
  sub: {
    fontSize: 15, // tokens-ok-line: TYPE.callout target
    lineHeight: 22,
  },
  primaryBtn: {
    paddingVertical: 14, // tokens-ok-line: 44pt min-tap baseline
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  primaryBtnBusy: {
    opacity: 0.7,
  },
  primaryBtnLabel: {
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '400',
  },
  secondaryBtn: {
    paddingVertical: 14, // tokens-ok-line: matches primaryBtn baseline
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  secondaryLabel: {
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '400',
  },
  err: {
    fontSize: 14, // tokens-ok-line: TYPE.footnote target
    textAlign: 'center',
  },
  linkBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  linkBtnLabel: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
  back: {
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '400',
    marginBottom: SPACING.sm,
  },
  advLabel: {
    fontSize: 13, // tokens-ok-line: TYPE.footnote target
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10, // tokens-ok-line: input min-tap baseline
    fontSize: 16, // tokens-ok-line: TYPE.body target
  },
});
