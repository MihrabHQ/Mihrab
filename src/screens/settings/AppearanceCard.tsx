// tokens-ok: the hex-input placeholder is an example hex, not a colour in use
// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import {
  Alert,
  BackHandler,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppearanceSettings,
  usePrayerSettings,
} from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { AccentShelf } from '../../components/AccentShelf';
import { ConfirmModal } from '../../components/ConfirmModal';
import { restartApp as nativeRestartApp } from '../../native/SystemTheme';
import { saveSettings } from '../../settings/storage';
import { enteringMinimal, minimalLook, minimalOn } from '../../settings/minimalLook';
import { useMinimalOffered } from '../../settings/useMinimalOffered';
import { PALETTE_STEPS, skyMoodFor } from '../../theme/skyMoods';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import type { ClockFormat } from '../../utils/clockFormat';
import { SkyVariantPicker } from '../../components/SkyVariantPicker';
import { LayoutPicker } from '../../components/LayoutPicker';
import { HeroLookPicker } from '../../components/HeroLookPicker';
import { SUN_SURFACE } from '../home/skyLight';
import { useSkyTheme } from '../../theme/skyTheme';
import { SegmentedControl } from '../../components/ui';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { SPACING } from '../../theme/tokens';
import { isMacCatalyst } from '../../responsive/breakpoints';

/**
 * Appearance card: theme picker (System / Light / Dark), the colour theme
 * (Classic, or one of the accent presets — picking a preset themes dark
 * mode in it, `tintedSurfaces`), the system dynamic-colours switch
 * (Material You / Liquid Glass) as the alternative to a chosen colour, and
 * the Pure-Black OLED toggle when in dark mode. Subscribes only to the appearance slice
 * (task #11) — toggling a widget color or notifications setting will not
 * re-render this card.
 */
// The swatches and the app-accent → widget-highlight mapping moved to
// src/settings/widgetAccent.ts when the Widget card gained a picker of
// its own: two cards writing the same setting must agree on what each
// colour is, and a copy in each is how they stop agreeing.

function AppearanceCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  // Need the full settings object (not just the appearance slice) so we
  // can synchronously persist a copy with the toggled value before
  // restarting the process — task #114.
  const { settings: fullSettings } = usePrayerSettings();
  const { palette, isDark } = useAppPalette();
  const clock = useClockFormatter();
  // Minimal is offered on the phone and the iPad, not on the Mac nor
  // beside an iPhone's vertical bar (useMinimalOffered); and where it is
  // not, a `minimalUi` carried over reads as off — for the switch and
  // for what the colour controls below say about it alike. The raw
  // setting read here hid the colour theme and disabled the system's
  // colours "because Minimal keeps the classic colours" on a Mac that
  // was not wearing Minimal at all.
  const minimalOffered = useMinimalOffered();
  const minimalActive = minimalOffered && minimalOn(settings);
  // A Minimal carried over to where it is not offered is NOT turned off
  // here: the setting travels between devices (sync, a backup), and the
  // Mac or an iPhone beside its vertical bar opening Appearance would
  // take Minimal from the phone that wears it. It reads as off here
  // (`minimalActive`), and stays the other device's choice.
  // Pending value for the "restart required" themed confirm modal. Null
  // ⇒ hidden; true/false ⇒ the dynamic-colours value the user is trying
  // to switch to, awaiting confirmation.
  const [pendingDynamic, setPendingDynamic] = useState<boolean | null>(null);
  // Minimal asked for while system colours are on: they go, with a restart.
  const [pendingMinimal, setPendingMinimal] = useState(false);
  // The layout asked for on Android, awaiting the same confirm: null ⇒
  // hidden, else whether Minimal is to be on. The two layouts are two
  // navigators over the same six pages, and Fabric on Android does not
  // survive trading one for the other in a running app: after Minimal
  // on and off again, a tab change could die in SurfaceMountingManager
  // ("Unable to find view for viewState", in 2.37.0 too). A fresh start
  // in either layout is clean, so the switch is a restart there.
  const [pendingLayout, setPendingLayout] = useState<boolean | null>(null);

  // Persist the toggled value to disk, then restart so PlatformColor /
  // dynamic refs re-resolve. Persist DIRECTLY (not via the async
  // updateSettings save) because the imminent Process.exit can kill an
  // in-flight write, leaving the next launch reading the old value (#114).
  // Turning system colours ON clears Verdant — the two themes cannot share
  // a palette.
  // Turning Minimal on under system colours takes them off (Minimal wears
  // the classic colours, settings/minimalLook.ts) — the same restart.
  const applyDynamicAndRestart = (v: boolean) =>
    applyAndRestart({ useSystemDynamicTheme: v, ...(v ? { tintedSurfaces: false } : {}) });
  const applyAndRestart = (patch: Partial<typeof fullSettings>) => {
    void (async () => {
      const next = minimalLook(enteringMinimal(fullSettings, { ...fullSettings, ...patch }));
      try {
        await saveSettings(next);
      } catch (e) {
        console.warn('Failed to persist toggle before restart:', e);
      }
      updateSettings(patch);
      const tryReload = () => {
        try {
          const dev = (
            NativeModules as { DevSettings?: { reload?: () => void } }
          ).DevSettings;
          if (dev?.reload) {
            dev.reload();
            return true;
          }
        } catch {
          // ignore
        }
        return false;
      };
      if (Platform.OS === 'android') {
        if (nativeRestartApp()) return;
        if (!tryReload()) BackHandler.exitApp();
      } else if (!tryReload()) {
        Alert.alert(
          t('settings.themeRestartManualTitle', 'Reopen the app'),
          t(
            'settings.themeRestartManualBody',
            'iOS does not allow apps to restart themselves. Please force-quit Prayer Times and reopen it for the new theme to take effect.',
          ),
          [{ text: t('common.ok', 'OK'), style: 'default' }],
        );
      }
    })();
  };

  // Picker is hidden under dynamic colors — both app and widget follow OS.
  // Android = Material You; iOS = Liquid Glass (system colours).
  const dynamicColorsActive =
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');
  const verdantActive = settings.tintedSurfaces && !dynamicColorsActive;
  // The Sky theme owns the palette: one look painted from the hero's sky
  // (theme/skyTheme.ts). The colour theme and system colours have nothing
  // to decide under it, so they step aside; Pure black still has.
  const skyActive = settings.appearance === 'sky';
  // The hour's sky as Today paints it under the Sky theme — the mood's
  // stops, not the real sky the theme is worked out from (at dusk on the
  // Duo that was a noon blue under a night page) — for the layout pictures.
  const sky = useSkyTheme(skyActive);
  const previewSky = skyActive ? skyMoodFor(sky.passage, sky.t, PALETTE_STEPS, undefined, sky.light) : null;
  // Minimal's picture is drawn in the sky Minimal opens in — Realistic,
  // whatever the theme now — not the page's present colours (LayoutPicker).
  const minimalMood = skyMoodFor(sky.passage, sky.t, PALETTE_STEPS, 'realistic', sky.light);
  const minimalSky = {
    top: minimalMood.heroTop,
    mid: minimalMood.heroMid,
    foot: minimalMood.heroFoot,
    sun: minimalMood.bodyLight,
    text: minimalMood.text,
    isDark: minimalMood.isDark,
  };
  return (
    <>
      <SettingsGroup
        title={t('settings.appearance')}
        footer={skyActive ? t('settings.themeSkyHelp') : t('settings.themeHelp')}
      >
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.theme')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('settings.theme')}
            segments={[
              { key: 'system', label: t('settings.themeSystem') },
              { key: 'light', label: t('settings.themeLight') },
              { key: 'dark', label: t('settings.themeDark') },
              { key: 'sky', label: t('settings.themeSky') },
            ]}
            value={settings.appearance}
            onChange={appearance => updateSettings({ appearance })}
          />
        </SettingsBlock>

        {/* The Sky theme's colours, under it as the colour theme is under
            the others: Vibrant (the representative palette it shipped
            with) or Realistic (the sky as it looks, a calmer page) —
            theme/skyMoods.ts. Realistic is the default. */}
        {skyActive && (
          <SettingsBlock>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.skyVariant', 'Sky colours')}
            </Text>
            {/* Each shown by its six skies, as in the walkthrough. */}
            <SkyVariantPicker
              testID="appearance-skyVariant"
              value={settings.skyVariant}
              onChange={skyVariant => updateSettings({ skyVariant })}
              accent={String(palette.accent)}
              text={String(palette.text)}
              muted={String(palette.muted)}
            />
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t(
                'settings.skyVariantHelp',
                'Vibrant paints each hour in bold, representative colours. Realistic follows the sky as it looks, over a calmer, nearly neutral page.',
              )}
            </Text>
          </SettingsBlock>
        )}

        {/* The hero's band: the painted sky, or the Track — the same band
            as a chart of the sky, from the reader's own coordinates
            (screens/home/trackModel.ts). Under every theme; the text, the
            rail and the page stay where they are. */}
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.heroLook', 'Sky band')}
          </Text>
          {/* Shown, as the layouts are: the hour's sky under the Sky theme,
              the page's paper otherwise; the sun in its own light. */}
          <HeroLookPicker
            testID="appearance-heroLook"
            value={settings.heroLook}
            onChange={heroLook => updateSettings({ heroLook })}
            minimal={minimalActive}
            skyTop={previewSky ? previewSky.heroTop : String(palette.accentBg)}
            skyFoot={previewSky ? previewSky.heroMid : String(palette.bg)}
            sun={previewSky ? previewSky.bodyLight : SUN_SURFACE}
            text={String(palette.text)}
            muted={String(palette.muted)}
            accent={String(palette.accent)}
          />
          <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
            {t(
              'settings.heroLookHelp',
              "Painted shows the sun and the moon on the sky. Track draws the band as a chart: the horizon as a line, today's path of the sun (the moon's at night) to scale where you are, and a ring where it will be at the next prayer.",
            )}
          </Text>
        </SettingsBlock>

        {/* The layout — the full page or Minimal (settings/types.ts
            `minimalUi`) — chosen by seeing it, as in the walkthrough: the
            same two pictures of Today in the reader's own colours, not a
            switch named after a word. Under the theme, because the
            pictures are in its colours. Not on the Mac, nor beside an iPhone's
            vertical bar (useMinimalOffered). */}
        {minimalOffered ? (
          <SettingsBlock>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('onboarding.personalise.layout', 'Layout')}
            </Text>
            <LayoutPicker
              testID="appearance-layout"
              minimalSky={minimalSky}
              value={settings.minimalUi ? 'minimal' : 'full'}
              onChange={v => {
                const on = v === 'minimal';
                if (on === settings.minimalUi) return;
                // Under system colours, Minimal takes them off — a restart,
                // as switching them off is. On Android any change of layout
                // is a restart (`pendingLayout`); elsewhere at once.
                if (on && dynamicColorsActive) setPendingMinimal(true);
                else if (Platform.OS === 'android') setPendingLayout(on);
                else updateSettings({ minimalUi: on });
              }}
              skyTop={previewSky ? previewSky.heroTop : String(palette.accentBg)}
              skyFoot={previewSky ? previewSky.heroMid : String(palette.bg)}
              page={String(palette.bg)}
              text={String(palette.text)}
              muted={String(palette.muted)}
              accent={String(palette.accent)}
              border={String(palette.border)}
            />
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t('settings.minimalUiHelp')}
            </Text>
          </SettingsBlock>
        ) : null}
        {/* Under Minimal only: the tab bar's small icons kept up in place of
            the dots (MinimalTabBar). */}
        {minimalActive ? (
          <SettingsToggleRow
            testID="appearance-minimalTabIcons"
            title={t('settings.minimalTabIcons')}
            help={t('settings.minimalTabIconsHelp')}
            value={settings.minimalTabIcons}
            onValueChange={v => updateSettings({ minimalTabIcons: v })}
          />
        ) : null}

        {/* Colour theme — the alternative to system colours. Classic is the
            app's own paper and ink; a preset themes dark mode in that colour
            (light stays classic). Custom colours are an accent only, since
            free-form washes are barred from the surfaces. Hidden under
            system colours, which own the palette. */}
        {!dynamicColorsActive && !skyActive && !minimalActive && (
          <SettingsBlock>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.colourTheme', 'Colour theme')}
            </Text>
            <View style={styles.shelf}>
              <AccentShelf
                testIDPrefix="appearance"
                classic={{
                  selected: !settings.tintedSurfaces,
                  label: t('settings.classicTheme', 'Classic'),
                  onPress: () => updateSettings({ tintedSurfaces: false }),
                }}
                onPick={id =>
                  // A preset is the theme; a custom colour is an accent only.
                  updateSettings({ tintedSurfaces: id !== 'custom' })
                }
              />
            </View>
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t(
                'settings.colourThemeHelp',
                'Classic keeps the app’s own paper and ink. Pick a colour to theme dark mode in it — light mode stays classic.',
              )}
            </Text>
          </SettingsBlock>
        )}
        {!skyActive && (Platform.OS === 'android' || Platform.OS === 'ios') ? (
          <SettingsToggleRow
            title={
              Platform.OS === 'ios'
                ? t('settings.liquidGlass', 'Liquid Glass')
                : t('settings.systemDynamicColors')
            }
            help={
              minimalActive
                ? t('settings.minimalClassicOnly')
                : verdantActive
                ? t(
                    'settings.verdantThemeSystemDisabled',
                    'A colour theme is active — choose Classic to use system colours.',
                  )
                : Platform.OS === 'ios'
                  ? t(
                      'settings.liquidGlassHelp',
                      'Adopt iOS system colours and translucent glass chrome. Follows Light/Dark automatically.',
                    )
                  : t('settings.systemDynamicColorsHelp')
            }
            value={settings.useSystemDynamicTheme}
            // Answerable under Light and Dark as well as System. Pinning a
            // mode says which mode is drawn, not where its colours come
            // from — "dark, in my wallpaper's colours" is a reasonable ask
            // and used to be unsayable. Verdant still owns the palette
            // when it is on, because two colour sources cannot both win.
            disabled={verdantActive || minimalActive}
            // Material You / iOS dynamic colors are resolved at view-attach
            // time, so flipping them mid-session leaves stale tints on
            // already-mounted surfaces (#110). Defer the actual change to a
            // themed confirm modal; the switch is controlled by the
            // persisted value, so until the user confirms it snaps back to
            // its prior position.
            onValueChange={v => setPendingDynamic(v)}
          />
        ) : null}

        {isDark ? (
          <SettingsToggleRow
            title={t('settings.pureBlack')}
            help={t('settings.pureBlackHelp')}
            value={settings.pureBlackDark}
            onValueChange={v => updateSettings({ pureBlackDark: v })}
          />
        ) : null}

        {/* The launch run (src/boot/launchWarp.ts). Off, a launch still
            opens on the kept picture of Today — never the skeleton — and
            simply fades into the live screen, with nothing posed or run:
            the quickest way to it. The Mac has no picture and no run. */}
        {Platform.OS === 'android' || (Platform.OS === 'ios' && !isMacCatalyst) ? (
          <SettingsToggleRow
            title={t('settings.launchAnimation')}
            help={t('settings.launchAnimationHelp')}
            value={settings.launchAnimation}
            onValueChange={v => updateSettings({ launchAnimation: v })}
          />
        ) : null}

      </SettingsGroup>

      {/* Time format — issue #18.

          Its own card rather than a row under Theme: it is not about
          light and dark, and someone looking for it is looking for a
          heading that says so. The example underneath is rendered by the
          same formatter the rest of the app uses, so what is shown here
          is literally what a prayer row will show. */}
      <SettingsGroup footer={t('settings.clockFormatHelp')}>
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.clockFormat', 'Time format')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('settings.clockFormat', 'Time format')}
            segments={
              [
                { key: 'auto', label: t('settings.clockFormatAuto', 'Automatic') },
                { key: '12', label: t('settings.clockFormat12', '12-hour') },
                { key: '24', label: t('settings.clockFormat24', '24-hour') },
              ] as ReadonlyArray<{ key: ClockFormat; label: string }>
            }
            value={settings.clockFormat}
            onChange={clockFormat => updateSettings({ clockFormat })}
          />
          <Text style={[s.help, { color: palette.muted, marginTop: SPACING.md }]}>
            {t('settings.clockFormatExample', {
              defaultValue: 'For example: {{time}}',
              time: clock('17:31'),
            })}
          </Text>
        </SettingsBlock>
      </SettingsGroup>

      <ConfirmModal
        visible={pendingDynamic !== null}
        title={t('settings.themeRestartTitle', 'Restart required')}
        message={t(
          'settings.themeRestartBody',
          'Switching system colors needs the app to restart so every screen picks up the new theme. Restart now?',
        )}
        confirmLabel={t('settings.themeRestartConfirm', 'Restart')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onCancel={() => setPendingDynamic(null)}
        onConfirm={() => {
          const v = pendingDynamic;
          setPendingDynamic(null);
          if (v !== null) applyDynamicAndRestart(v);
        }}
      />
      <ConfirmModal
        visible={pendingMinimal}
        title={t('settings.themeRestartTitle', 'Restart required')}
        message={t('settings.minimalRestartBody')}
        confirmLabel={t('settings.themeRestartConfirm', 'Restart')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onCancel={() => setPendingMinimal(false)}
        onConfirm={() => {
          setPendingMinimal(false);
          applyAndRestart({ minimalUi: true, useSystemDynamicTheme: false, tintedSurfaces: false });
        }}
      />
      <ConfirmModal
        visible={pendingLayout !== null}
        title={t('settings.themeRestartTitle', 'Restart required')}
        message={t('settings.layoutRestartBody')}
        confirmLabel={t('settings.themeRestartConfirm', 'Restart')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onCancel={() => setPendingLayout(null)}
        onConfirm={() => {
          const on = pendingLayout;
          setPendingLayout(null);
          if (on !== null) applyAndRestart({ minimalUi: on });
        }}
      />
    </>
  );
}

export const AppearanceCard = memo(AppearanceCardImpl);

const styles = StyleSheet.create({
  // The label's own `marginBottom` is the settings scale's tightest; a
  // row of 44pt circles needs more air under a caption than a line of
  // text does.
  shelf: { marginTop: SPACING.sm },
});
