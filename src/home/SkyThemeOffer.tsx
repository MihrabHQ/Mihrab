/**
 * "There is a new look — want to see the sky?" The home screen's one-time
 * offer of the Sky theme to the people who were here before it.
 *
 * ── WHY ASK AT ALL ────────────────────────────────────────────────────
 *
 * Sky is offered in the first-run walkthrough (PersonaliseScreen shows
 * the strip of six skies under the theme control), so anybody who
 * installs now is shown it. Anybody who was here before it was added
 * went through a walkthrough that did not have it, and a new theme is
 * a thing people do not go looking for under Settings → Appearance.
 * So the home screen shows them the strip, once, the way the muṣḥaf
 * shows its two extras (quran/QuranFeaturesOffer).
 *
 * ── WHO, AND WHEN NOT ─────────────────────────────────────────────────
 *
 * - Only somebody the walkthrough never showed Sky: the walkthrough
 *   writes `SKY_ASKED_KEY` when it finishes, and a fresh install of a
 *   build that has this file always goes through it.
 * - Not somebody who already chose Sky — from Settings, say.
 * - Once per device: "Not now" is an answer, not a snooze.
 * - Never on the launch that shows the what's-new sheet (the home
 *   screen's gate), and never before the alerts offer has had its
 *   answer: that one goes first, and two sheets in a row is one too
 *   many. For somebody who has just finished the walkthrough, not for
 *   a day — the same hold the alerts offer keeps.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SkyMoodStrip } from '../components/SkyMoodStrip';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { nativeInstallMs } from '../journal/installDate';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import {
  NOT_BEFORE_KEY,
  OFFER_KEY as FEATURES_OFFER_KEY,
  SKY_ASKED_KEY,
  offerHeldBack,
  offerNotBefore,
} from './HomeFeaturesOffer';

/** Asked once per device; the answer is the asking. */
export const SKY_OFFER_KEY = 'mihrab.skyThemeOffer.v1';
/** How long the page gets to itself before the question, ms. */
export const OFFER_DELAY_MS = 2500;

/** Whether to ask this launch. Pure, for the tests. */
export function skyOfferDue(input: {
  /** `SKY_OFFER_KEY`: already asked, or decided there was nothing to ask. */
  answered: boolean;
  /** `SKY_ASKED_KEY`: the walkthrough this install went through showed Sky. */
  walkthroughShowedSky: boolean;
  /** The alerts offer (HomeFeaturesOffer) has had its answer. */
  featuresOfferAnswered: boolean;
  skyOn: boolean;
  heldBack: boolean;
}): 'ask' | 'never' | 'later' {
  if (input.answered) return 'never';
  if (input.walkthroughShowedSky || input.skyOn) return 'never';
  if (!input.featuresOfferAnswered || input.heldBack) return 'later';
  return 'ask';
}

/**
 * Mounted once on the home screen. `ready` is the page's gate: settings
 * are loaded, setup is done and no other sheet has been shown this launch.
 */
export function SkyThemeOffer({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.multiGet([SKY_OFFER_KEY, SKY_ASKED_KEY, FEATURES_OFFER_KEY, NOT_BEFORE_KEY])
      .then(rows => {
        if (!live) return;
        const got = Object.fromEntries(rows) as Record<string, string | null>;
        const due = skyOfferDue({
          answered: got[SKY_OFFER_KEY] === '1',
          walkthroughShowedSky: got[SKY_ASKED_KEY] === '1',
          featuresOfferAnswered: got[FEATURES_OFFER_KEY] === '1',
          skyOn: settings.appearance === 'sky',
          heldBack: offerHeldBack(offerNotBefore(got[NOT_BEFORE_KEY] ?? null, nativeInstallMs()), Date.now()),
        });
        if (due === 'never') {
          // Nothing to ask is an answer too: do not look again every launch.
          if (got[SKY_OFFER_KEY] !== '1') AsyncStorage.setItem(SKY_OFFER_KEY, '1').catch(() => undefined);
          return;
        }
        if (due === 'later') return;
        timer = setTimeout(() => {
          if (live) setVisible(true);
        }, OFFER_DELAY_MS);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // Once: what the theme was when the screen opened is what is asked about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(SKY_OFFER_KEY, '1').catch(() => undefined);
  };

  const trySky = () => {
    close();
    updateSettings({ appearance: 'sky' });
  };

  return (
    <ResponsiveModal visible={visible} onClose={close} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[typeStyle('title3'), { color: palette.text }]}>
            {t('skyOffer.title')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('skyOffer.body')}
          </Text>
        </View>
        <SkyMoodStrip
          testID="sky-offer-strip"
          selected={false}
          accent={String(palette.accent)}
          accessibilityLabel={t('settings.themeSky')}
          onPress={trySky}
        />
        <Pressable
          testID="sky-offer-try"
          accessibilityRole="button"
          onPress={trySky}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.accentSolid },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.onAccent }]}>
            {t('skyOffer.tryIt')}
          </Text>
        </Pressable>
        <Pressable
          testID="sky-offer-not-now"
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.controlBg },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.text }]}>
            {t('onboarding.notNow')}
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
