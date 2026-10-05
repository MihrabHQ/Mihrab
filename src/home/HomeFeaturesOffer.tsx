/**
 * "Three things are off until you ask" — the home screen's one-time offer
 * of the alerts that are not on by default.
 *
 * ── WHY ASK AT ALL ────────────────────────────────────────────────────
 *
 * The full-screen prayer alert, silencing the phone at prayer time and the
 * Live Activity are all OFF on purpose: each takes over something of the
 * phone's, and the last two need a system permission. But a switch under
 * Settings is a feature most readers never hear of. The first-run
 * walkthrough asks about the full-screen alert, so people who went
 * through it were told about one of the three; people who were here before
 * it was added were told about none. This asks the rest, once.
 *
 * ── WHO, AND WHEN NOT ─────────────────────────────────────────────────
 *
 * - Only what is off, and only what this phone can do: silence is
 *   Android's, the full-screen alert needs the platform to have it, and
 *   the Mac has no Live Activity.
 * - The full-screen alert is left out for anyone the walkthrough already
 *   asked (`FULL_SCREEN_ASKED_KEY`), so nobody is asked about it twice.
 * - Once per device: "Not now" is an answer, not a snooze.
 * - Never on the launch that shows the what's-new sheet — two sheets in
 *   a row is one too many — and, for somebody who has just finished the
 *   walkthrough, not for a day, so it is not a second welcome.
 * - Every switch starts OFF. Silencing the phone and full-screen alerts
 *   need permissions, so the person picks what they want.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group } from '../components/ui/Group';
import { Row } from '../components/ui/Row';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { hasSilenceAccess, prayerSilenceAvailable, requestSilenceAccess } from '../native/PrayerSilence';
import { useFullScreenAlarmSwitch } from '../notifications/useFullScreenAlarmSwitch';
import { isMacCatalyst } from '../responsive/breakpoints';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';

export type HomeFeature = 'fullScreen' | 'silence' | 'liveActivity';

/** Asked once per device; the answer is the asking. */
export const OFFER_KEY = 'mihrab.homeFeaturesOffer.v1';
/** Written when the walkthrough finishes: it offered the full-screen alert. */
export const FULL_SCREEN_ASKED_KEY = 'mihrab.fullScreenAsked.v1';
/** Not before this time (ms since epoch): a fresh walkthrough just ended. */
export const NOT_BEFORE_KEY = 'mihrab.homeFeaturesOffer.notBefore.v1';

/** How long after the walkthrough the offer holds off. */
export const AFTER_WALKTHROUGH_MS = 24 * 60 * 60 * 1000;
/** How long the page gets to itself before the question, ms. */
export const OFFER_DELAY_MS = 2500;

/** Called when the first-run walkthrough finishes. */
export function markWalkthroughFinished(now: number = Date.now()): void {
  AsyncStorage.multiSet([
    [FULL_SCREEN_ASKED_KEY, '1'],
    [NOT_BEFORE_KEY, String(now + AFTER_WALKTHROUGH_MS)],
  ]).catch(() => undefined);
}

/** What there is to offer. Pure, for the tests. */
export function offerableHomeFeatures(input: {
  fullScreenOffered: boolean;
  fullScreenOn: boolean;
  /** The walkthrough already asked about the full-screen alert. */
  fullScreenAsked: boolean;
  silenceAvailable: boolean;
  silenceOn: boolean;
  liveActivityAvailable: boolean;
  liveActivityOn: boolean;
}): HomeFeature[] {
  const out: HomeFeature[] = [];
  if (input.fullScreenOffered && !input.fullScreenOn && !input.fullScreenAsked) out.push('fullScreen');
  if (input.silenceAvailable && !input.silenceOn) out.push('silence');
  if (input.liveActivityAvailable && !input.liveActivityOn) out.push('liveActivity');
  return out;
}

/** True when the offer's clock says it is not yet time. Pure. */
export function offerHeldBack(notBefore: string | null, now: number): boolean {
  const at = Number(notBefore);
  return notBefore != null && Number.isFinite(at) && now < at;
}

/**
 * Mounted once on the home screen. `ready` is the page's gate: settings
 * are loaded, setup is done and no other sheet has been shown this launch.
 */
export function HomeFeaturesOffer({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const fullScreen = useFullScreenAlarmSwitch(settings.prayerAlertFullScreen, v =>
    updateSettings({ prayerAlertFullScreen: v }),
  );
  const [features, setFeatures] = useState<HomeFeature[]>([]);
  const [visible, setVisible] = useState(false);
  const [picked, setPicked] = useState<Record<HomeFeature, boolean>>({
    fullScreen: false,
    silence: false,
    liveActivity: false,
  });

  const silenceAvailable = Platform.OS === 'android' && prayerSilenceAvailable;
  const liveActivityAvailable = !isMacCatalyst;

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.multiGet([OFFER_KEY, FULL_SCREEN_ASKED_KEY, NOT_BEFORE_KEY])
      .then(rows => {
        const got = Object.fromEntries(rows) as Record<string, string | null>;
        if (!live || got[OFFER_KEY]) return;
        if (offerHeldBack(got[NOT_BEFORE_KEY] ?? null, Date.now())) return;
        const offer = offerableHomeFeatures({
          fullScreenOffered: fullScreen.offered,
          fullScreenOn: settings.prayerAlertFullScreen,
          fullScreenAsked: got[FULL_SCREEN_ASKED_KEY] === '1',
          silenceAvailable,
          silenceOn: settings.prayerSilence.enabled,
          liveActivityAvailable,
          liveActivityOn: settings.liveActivityEnabled,
        });
        if (offer.length === 0) {
          // Nothing to ask is an answer too: do not look again every launch.
          AsyncStorage.setItem(OFFER_KEY, '1').catch(() => undefined);
          return;
        }
        timer = setTimeout(() => {
          if (!live) return;
          setFeatures(offer);
          setVisible(true);
        }, OFFER_DELAY_MS);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // Once: what was off when the screen opened is what is offered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(OFFER_KEY, '1').catch(() => undefined);
  };

  const turnOn = async () => {
    const chosen = features.filter(f => picked[f]);
    close();
    for (const f of chosen) {
      if (f === 'liveActivity') updateSettings({ liveActivityEnabled: true });
      if (f === 'silence') {
        updateSettings({ prayerSilence: { ...settings.prayerSilence, enabled: true } });
        // Do Not Disturb access is the system's to give; take them there.
        if (!(await hasSilenceAccess())) await requestSilenceAccess();
      }
      if (f === 'fullScreen') await fullScreen.toggle(true);
    }
  };

  const label = (f: HomeFeature) =>
    f === 'fullScreen'
      ? {
          title: t('settings.prayerAlertFullScreen'),
          subtitle: t(
            Platform.OS === 'ios'
              ? 'settings.prayerAlertFullScreenHelpIos'
              : 'settings.prayerAlertFullScreenHelp',
          ),
        }
      : f === 'silence'
        ? { title: t('settings.silenceToggle'), subtitle: t('settings.silenceHelp') }
        : { title: t('settings.liveActivity'), subtitle: t('settings.liveActivityHelp') };

  const any = features.some(f => picked[f]);

  return (
    <ResponsiveModal visible={visible} onClose={close} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[typeStyle('title3'), { color: palette.text }]}>
            {t('featuresOffer.title')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('featuresOffer.body')}
          </Text>
        </View>
        <Group>
          {features.map(f => (
            <Row
              key={f}
              testID={`home-offer-${f}`}
              title={label(f).title}
              subtitle={label(f).subtitle}
              trailing={
                <Switch
                  testID={`home-offer-switch-${f}`}
                  value={picked[f]}
                  onValueChange={v => setPicked(p => ({ ...p, [f]: v }))}
                  trackColor={{ true: palette.accentSolid, false: String(palette.border) }}
                  thumbColor="#ffffff" // tokens-ok-line: a Switch thumb stays light in both states so it reads against an accent track
                />
              }
            />
          ))}
        </Group>
        <Pressable
          testID="home-offer-turn-on"
          accessibilityRole="button"
          onPress={() => void turnOn()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: any ? palette.accentSolid : palette.controlBg },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: any ? palette.onAccent : palette.text }]}>
            {any ? t('quran.featuresOfferTurnOn') : t('onboarding.notNow')}
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
