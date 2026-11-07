// hover-ok: settings rows; the touch feedback is the affordance.
import { memo, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  normalizeWatchAddress,
  type GarminWatchSettings,
} from '../../settings/garminWatch';
import {
  configureGarminWatch,
  garminWatchAvailable,
  garminWatchStatus,
  sendToGarminWatch,
  type GarminSendResult,
} from '../../native/GarminWatch';
import { SettingsBlock, SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Settings → Notifications → "Garmin watch" — garmin/README.md.
 *
 * Android only, and only on a build that carries the module. The card
 * is the switch, the watch's Bluetooth address (copied from Gadgetbridge's
 * page for the watch — the one thing the phone cannot find out for itself
 * without a Bluetooth permission), and a "Send now" that says what
 * happened, since the message leaves the phone silently otherwise.
 *
 * Gadgetbridge must be installed, and in its settings for the watch,
 * "Allow messages to watch apps" turned on (Developer settings → Intent
 * API); the card says so when it is missing, and the outcome line says
 * the rest.
 */
function GarminWatchCardImpl() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const watch = settings.garminWatch;
  const [draft, setDraft] = useState(watch.address);
  const [gadgetbridge, setGadgetbridge] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<GarminSendResult | null>(null);

  useEffect(() => {
    let alive = true;
    void garminWatchStatus().then(st => {
      if (alive && st) setGadgetbridge(st.gadgetbridge != null);
    });
    return () => {
      alive = false;
    };
  }, [watch.enabled]);

  const apply = useCallback(
    (next: GarminWatchSettings) => {
      updateSettings({ garminWatch: next });
      void configureGarminWatch(next.enabled, next.address).then(setOutcome);
    },
    [updateSettings],
  );

  const onToggle = useCallback(
    (on: boolean) => apply({ ...watch, enabled: on }),
    [apply, watch],
  );

  const onAddressDone = useCallback(() => {
    const address = normalizeWatchAddress(draft) ?? '';
    setDraft(address || draft);
    if (address !== watch.address) apply({ ...watch, address });
  }, [apply, draft, watch]);

  const onSend = useCallback(() => {
    setOutcome(null);
    void sendToGarminWatch().then(setOutcome);
  }, []);

  if (Platform.OS !== 'android' || !garminWatchAvailable) return null;

  const addressOk = normalizeWatchAddress(draft) != null;

  return (
    <SettingsGroup
      title={t('settings.garminTitle')}
      footer={t('settings.garminFooter')}>
      <SettingsToggleRow
        title={t('settings.garminToggle')}
        help={t('settings.garminHelp')}
        value={watch.enabled}
        onValueChange={onToggle}
        testID="settings-garmin-watch"
      />
      {watch.enabled ? (
        <SettingsBlock>
          {gadgetbridge === false ? (
            <Text style={[s.help, styles.warn, { color: palette.danger }]}>
              {t('settings.garminNoGadgetbridge')}
            </Text>
          ) : null}
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.garminAddress')}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={onAddressDone}
            onSubmitEditing={onAddressDone}
            placeholder="AA:BB:CC:DD:EE:FF"
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={17}
            accessibilityLabel={t('settings.garminAddress')}
            style={[
              styles.input,
              tabularNumeralStyle,
              {
                color: palette.text,
                borderColor: draft && !addressOk ? palette.danger : palette.border,
                backgroundColor: palette.bg,
              },
            ]}
          />
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.garminAddressHelp')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.garminSend')}
            onPress={onSend}
            disabled={!addressOk}
            style={[styles.send, !addressOk ? styles.disabled : null]}>
            <Text style={[s.changeLink, { color: palette.accent }]}>
              {t('settings.garminSend')}
            </Text>
          </Pressable>
          {outcome ? (
            <Text style={[s.help, { color: outcome === 'sent' ? palette.text : palette.danger }]}>
              {t(`settings.garminResult.${outcome}`)}
            </Text>
          ) : null}
        </SettingsBlock>
      ) : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    fontSize: TYPE.body.fontSize,
  },
  warn: { marginBottom: SPACING.sm },
  send: { paddingVertical: SPACING.sm, alignSelf: 'flex-start' },
  disabled: { opacity: 0.4 },
});

export const GarminWatchCard = memo(GarminWatchCardImpl);
