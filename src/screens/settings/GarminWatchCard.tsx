// hover-ok: settings rows; the touch feedback is the affordance.
import { memo, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  normalizeWatchAddress,
  type GarminFaceDate,
  type GarminWatchSettings,
} from '../../settings/garminWatch';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  configureGarminWatch,
  garminWatchAvailable,
  garminWatchStatus,
  installGarminApp,
  pairedWatches,
  sendToGarminWatch,
  type GarminAppKind,
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
  const { t, i18n } = useTranslation();
  const clock = useClockFormatter();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const watch = settings.garminWatch;
  const [draft, setDraft] = useState(watch.address);
  const [gadgetbridge, setGadgetbridge] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<GarminSendResult | null>(null);
  // Whether this build carries a watch face to install, and what the
  // last refresh did.
  // Which of the three watch apps this build carries (app/build.gradle).
  const [bundled, setBundled] = useState<Record<GarminAppKind, boolean>>({
    face: false,
    widget: false,
    field: false,
  });
  const [refreshed, setRefreshed] = useState<
    { sent: GarminSendResult; installed: GarminInstallResult | null } | null
  >(null);
  // The last send that had something to say, and when: what the page shows
  // on opening, before anything is pressed.
  const [last, setLast] = useState<{ result: GarminSendResult; at: number } | null>(null);
  // The paired devices offered for picking: null until asked, [] when
  // the permission was refused or nothing is paired.
  const [choices, setChoices] = useState<PairedDevice[] | null>(null);
  const [choicesNote, setChoicesNote] = useState<'refused' | 'none' | null>(null);

  const readStatus = useCallback((alive: () => boolean = () => true) => {
    void garminWatchStatus().then(st => {
      if (!alive() || !st) return;
      setGadgetbridge(st.gadgetbridge != null);
      setBundled({
        face: st.bundledFace === true,
        widget: st.bundledWidget === true,
        field: st.bundledField === true,
      });
      setLast(st.lastResult && st.lastResultAt ? { result: st.lastResult, at: st.lastResultAt } : null);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    readStatus(() => alive);
    return () => {
      alive = false;
    };
  }, [readStatus, watch.enabled]);

  const apply = useCallback(
    (next: GarminWatchSettings) => {
      updateSettings({ garminWatch: next });
      void configureGarminWatch(next.enabled, next.address).then(result => {
        setOutcome(result);
        readStatus();
      });
    },
    [readStatus, updateSettings],
  );

  // What the watch shows. Saved here; `useSyncGarminAccent` hands it to the
  // native side, which sends it — the same road a restored backup takes.
  const show = useCallback(
    (patch: Partial<GarminWatchSettings>) => {
      updateSettings({ garminWatch: { ...watch, ...patch } });
    },
    [updateSettings, watch],
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
    void sendToGarminWatch().then(result => {
      setOutcome(result);
      readStatus();
    });
  }, [readStatus]);

  // Install or reinstall: the times again, whatever was sent before; then
  // Gadgetbridge's installer on the watch app this build carries —
  // installed after a yes there.
  const onInstall = useCallback(
    (kind: GarminAppKind) => {
      setRefreshed(null);
      void sendToGarminWatch().then(async sent => {
        const installed = sent === 'sent' ? await installGarminApp(kind) : null;
        setRefreshed({ sent, installed });
        readStatus();
      });
    },
    [readStatus],
  );

  if (Platform.OS !== 'android' || !garminWatchAvailable) return null;

  const addressOk = normalizeWatchAddress(draft) != null;
  const anyBundled = bundled.face || bundled.widget || bundled.field;
  const INSTALL: { kind: GarminAppKind; label: string; testID: string }[] = [
    { kind: 'face', label: t('settings.garminInstallFace'), testID: 'settings-garmin-install-face' },
    { kind: 'widget', label: t('settings.garminInstallWidget'), testID: 'settings-garmin-install-widget' },
    { kind: 'field', label: t('settings.garminInstallField'), testID: 'settings-garmin-install-field' },
  ];
  const DATES: { id: GarminFaceDate; label: string }[] = [
    { id: 'gregorian', label: t('settings.garminDateGregorian') },
    { id: 'hijri', label: t('settings.garminDateHijri') },
    { id: 'both', label: t('settings.garminDateBoth') },
  ];
  // "14:05" today, "9 Nov 14:05" before: when the watch was last sent to.
  const lastWhen = (() => {
    if (!last) return null;
    const d = new Date(last.at);
    const time = clock.fromDate(d);
    return d.toDateString() === new Date().toDateString()
      ? time
      : `${d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} ${time}`;
  })();

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
          {/* Where things stand, before anything is pressed: each line is
              one thing the watch needs, and the last is what the last send
              said. The one setting Mihrab cannot see is named as that. */}
          <View style={styles.checks} testID="settings-garmin-status">
            {gadgetbridge != null ? (
              <Text style={[s.help, { color: gadgetbridge ? palette.muted : palette.danger }]}>
                {gadgetbridge ? '✓ ' : '✗ '}
                {t(gadgetbridge ? 'settings.garminCheckGadgetbridge' : 'settings.garminNoGadgetbridge')}
              </Text>
            ) : null}
            <Text style={[s.help, { color: watch.address ? palette.muted : palette.danger }]}>
              {watch.address ? '✓ ' : '✗ '}
              {t(watch.address ? 'settings.garminCheckWatch' : 'settings.garminCheckNoWatch')}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {'• '}
              {t('settings.garminCheckAllow')}
            </Text>
            <Text
              style={[
                s.help,
                { color: !last || last.result === 'sent' ? palette.muted : palette.danger },
              ]}>
              {/* "Last sent" only of a send that went: an attempt that did
                  not is its time and what stopped it. */}
              {last && lastWhen
                ? last.result === 'sent'
                  ? `✓ ${t('settings.garminLastSent', { when: lastWhen })}`
                  : `✗ ${lastWhen} — ${t(`settings.garminResult.${last.result}`)}`
                : `• ${t('settings.garminNeverSent')}`}
            </Text>
          </View>
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
          {/* Only on a build that carries them (app/build.gradle): the face,
              the widget with its glance, the data field — each handed to
              Gadgetbridge's installer, which asks before it installs. */}
          {anyBundled ? (
            <>
              {INSTALL.filter(a => bundled[a.kind]).map(a => (
                <Pressable
                  key={a.kind}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  accessibilityHint={t('settings.garminInstallHelp')}
                  onPress={() => onInstall(a.kind)}
                  disabled={!addressOk}
                  testID={a.testID}
                  style={[styles.send, !addressOk ? styles.disabled : null]}>
                  <Text style={[s.changeLink, { color: palette.accent }]}>{a.label}</Text>
                </Pressable>
              ))}
              <Text style={[s.help, { color: palette.muted }]}>
                {t('settings.garminInstallHelp')}
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
      {/* What the watch shows. Saved with the settings and sent at once;
          a watch app older than these goes on showing everything. */}
      {watch.enabled ? (
        <>
          <SettingsBlock>
            <Text style={[s.label, { color: palette.muted }]}>{t('settings.garminDate')}</Text>
            <View style={styles.dates} accessibilityRole="radiogroup">
              {DATES.map(d => {
                const selected = watch.faceDate === d.id;
                return (
                  <Pressable
                    key={d.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={d.label}
                    testID={`settings-garmin-date-${d.id}`}
                    onPress={() => show({ faceDate: d.id })}
                    style={[
                      styles.date,
                      selected ? styles.dateSelected : null,
                      {
                        borderColor: selected ? palette.accent : palette.border,
                        backgroundColor: selected ? palette.accentBg : 'transparent',
                      },
                    ]}>
                    <Text style={[s.valueText, { color: selected ? palette.accent : palette.text }]}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[s.help, { color: palette.muted }]}>{t('settings.garminShowHelp')}</Text>
          </SettingsBlock>
          <SettingsToggleRow
            title={t('settings.garminSteps')}
            value={watch.faceSteps}
            onValueChange={v => show({ faceSteps: v })}
            testID="settings-garmin-steps"
          />
          <SettingsToggleRow
            title={t('settings.garminWeather')}
            value={watch.faceWeather}
            onValueChange={v => show({ faceWeather: v })}
            testID="settings-garmin-weather"
          />
          <SettingsToggleRow
            title={t('settings.garminBattery')}
            value={watch.faceBattery}
            onValueChange={v => show({ faceBattery: v })}
            testID="settings-garmin-battery"
          />
          <SettingsToggleRow
            title={t('settings.garminSeconds')}
            value={watch.faceSeconds}
            onValueChange={v => show({ faceSeconds: v })}
            testID="settings-garmin-seconds"
          />
          <SettingsToggleRow
            title={t('settings.garminFieldProgress')}
            help={t('settings.garminFieldProgressHelp')}
            value={watch.fieldProgress}
            onValueChange={v => show({ fieldProgress: v })}
            testID="settings-garmin-field-progress"
          />
        </>
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
  checks: { marginBottom: SPACING.sm, gap: SPACING.xs },
  dates: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs, marginBottom: SPACING.xs },
  date: {
    flex: 1,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  dateSelected: { borderWidth: 2 },
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
