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
  installGarminFace,
  pairedWatches,
  sendToGarminWatch,
  type GarminInstallResult,
  type GarminSendResult,
  type PairedDevice,
} from '../../native/GarminWatch';
import { SettingsBlock, SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Settings → Devices → "Garmin watch" — garmin/README.md.
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
  // Whether this build carries a watch face to install, and what the
  // last refresh did.
  const [bundledFace, setBundledFace] = useState(false);
  const [refreshed, setRefreshed] = useState<
    { sent: GarminSendResult; installed: GarminInstallResult | null } | null
  >(null);
  // The paired devices offered for picking: null until asked, [] when
  // the permission was refused or nothing is paired.
  const [choices, setChoices] = useState<PairedDevice[] | null>(null);
  const [choicesNote, setChoicesNote] = useState<'refused' | 'none' | null>(null);

  useEffect(() => {
    let alive = true;
    void garminWatchStatus().then(st => {
      if (alive && st) {
        setGadgetbridge(st.gadgetbridge != null);
        setBundledFace(st.bundledFace === true);
      }
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

  // The watch's address from the phone's paired devices: one Garmin
  // watch is taken as it is, more than one is offered to pick from.
  const onFind = useCallback(() => {
    setChoicesNote(null);
    void pairedWatches().then(list => {
      if (list == null) {
        setChoices(null);
        setChoicesNote('refused');
        return;
      }
      const garmin = list.filter(d => d.garmin);
      if (garmin.length === 1) {
        setChoices(null);
        setDraft(garmin[0].address);
        apply({ ...watch, address: garmin[0].address });
        return;
      }
      if (list.length === 0) {
        setChoices(null);
        setChoicesNote('none');
        return;
      }
      setChoices(garmin.length > 0 ? garmin : list);
    });
  }, [apply, watch]);

  const onPick = useCallback(
    (d: PairedDevice) => {
      setChoices(null);
      setDraft(d.address);
      apply({ ...watch, address: d.address });
    },
    [apply, watch],
  );

  const onSend = useCallback(() => {
    setOutcome(null);
    void sendToGarminWatch().then(setOutcome);
  }, []);

  // Install or reinstall: the times again, whatever was sent before; then
  // Gadgetbridge's installer on the face this build carries — installed
  // after a yes there.
  const onInstall = useCallback(() => {
    setRefreshed(null);
    void sendToGarminWatch().then(async sent => {
      const installed = sent === 'sent' ? await installGarminFace() : null;
      setRefreshed({ sent, installed });
    });
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.garminFind')}
            onPress={onFind}
            style={styles.send}>
            <Text style={[s.changeLink, { color: palette.accent }]}>
              {t('settings.garminFind')}
            </Text>
          </Pressable>
          {choices ? (
            <View style={styles.choices}>
              {choices.map(d => (
                <Pressable
                  key={d.address}
                  accessibilityRole="button"
                  accessibilityLabel={d.name}
                  onPress={() => onPick(d)}
                  style={[styles.choice, { borderColor: palette.border }]}>
                  <Text style={[s.valueText, { color: palette.text }]}>{d.name}</Text>
                  <Text style={[s.help, tabularNumeralStyle, { color: palette.muted }]}>{d.address}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {choicesNote ? (
            <Text style={[s.help, { color: palette.muted }]}>
              {t(choicesNote === 'refused' ? 'settings.garminFindRefused' : 'settings.garminFindNone')}
            </Text>
          ) : null}
          {/* Only on a build that carries the face (app/build.gradle). */}
          {bundledFace ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.garminInstallFace')}
                accessibilityHint={t('settings.garminInstallFaceHelp')}
                onPress={onInstall}
                disabled={!addressOk}
                testID="settings-garmin-install-face"
                style={[styles.send, !addressOk ? styles.disabled : null]}>
                <Text style={[s.changeLink, { color: palette.accent }]}>
                  {t('settings.garminInstallFace')}
                </Text>
              </Pressable>
              <Text style={[s.help, { color: palette.muted }]}>
                {t('settings.garminInstallFaceHelp')}
              </Text>
              {refreshed ? (
                <Text
                  style={[
                    s.help,
                    {
                      color:
                        refreshed.sent === 'sent' && refreshed.installed !== 'failed'
                          ? palette.text
                          : palette.danger,
                    },
                  ]}>
                  {refreshed.sent !== 'sent'
                    ? t(`settings.garminResult.${refreshed.sent}`)
                    : refreshed.installed === 'failed'
                      ? t('settings.garminInstallFaceFailed')
                      : t('settings.garminInstallFaceOpened')}
                </Text>
              ) : null}
            </>
          ) : null}
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
  choices: { marginVertical: SPACING.xs },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  send: { paddingVertical: SPACING.sm, alignSelf: 'flex-start' },
  disabled: { opacity: 0.4 },
});

export const GarminWatchCard = memo(GarminWatchCardImpl);
