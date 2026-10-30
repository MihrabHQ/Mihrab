// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  clampOffset,
  MAX_OFFSET_MAGNITUDE,
  type PrayerOffsetMinutes,
} from '../../settings/prayerOffsets';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { modalStyles } from './modalStyles';
import { useSheetPadding } from '../../responsive/sheetSides';

/**
 * Per-prayer offsets modal — task #22.
 *
 * Lets the user adjust each daily prayer by ±N minutes (clamped to
 * MAX_OFFSET_MAGNITUDE = 120 by `prayerOffsets.ts`). The control is a
 * stepper to keep accessibility predictable on every locale (no slider
 * RTL gotchas): a tap moves a minute, and holding a button keeps going —
 * a minute a step, then five — so an hour is a few seconds' hold, not
 * sixty taps (#117).
 *
 * The data layer (`applyOffsets`) is already consumed by the prayer-times
 * fetch pipeline before caching/widget push, so picking values here
 * translates directly into the table on Home and the alarms scheduled
 * by `syncPrayerNotifications`.
 */
const PRAYERS: ReadonlyArray<keyof PrayerOffsetMinutes> = [
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

type Props = {
  visible: boolean;
  current: PrayerOffsetMinutes;
  palette: AppPalette;
  onChange: (next: PrayerOffsetMinutes) => void;
  onClose: () => void;
};

export const PrayerOffsetsModal = memo(function PrayerOffsetsModal({
  visible,
  current,
  palette,
  onChange,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const sheetPad = useSheetPadding();
  const navigationReserve = useSystemNavigationReserve();

  // The offsets as last changed here: a held button steps faster than the
  // parent re-renders, and each step must build on the one before.
  const latest = useRef(current);
  latest.current = current;
  const setOffset = useCallback(
    (key: keyof PrayerOffsetMinutes, delta: number) => {
      const prev = latest.current[key] ?? 0;
      const next = clampOffset(prev + delta);
      if (next === prev) return;
      const merged: PrayerOffsetMinutes = { ...latest.current };
      if (next === 0) delete merged[key];
      else merged[key] = next;
      latest.current = merged;
      onChange(merged);
    },
    [onChange],
  );

  const reset = useCallback(() => {
    onChange({});
  }, [onChange]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[modalStyles.root, sheetPad]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            // The sheet sits on the window's bottom edge, which under
            // edge-to-edge is behind the system's navigation. Without this the
            // last row of the list is under the navigation bar and cannot be
            // tapped.
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.prayerOffsetsTitle')}
          </Text>
          <ScrollView contentContainerStyle={styles.list}>
            <Text
              style={[
                styles.help,
                { color: palette.muted, paddingHorizontal: SPACING.lg },
              ]}
            >
              {t('settings.prayerOffsetsHelp', {
                max: MAX_OFFSET_MAGNITUDE,
              })}
            </Text>
            {PRAYERS.map(prayer => {
              const value = current[prayer] ?? 0;
              return (
                <View key={prayer} style={styles.row}>
                  <Text style={[styles.label, { color: palette.text }]}>
                    {t(`prayer.${prayer}`)}
                  </Text>
                  <View style={styles.stepper}>
                    <StepperButton
                      label="-"
                      a11y={t('settings.prayerOffsetsDecrease', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                      onStep={big => setOffset(prayer, big ? -5 : -1)}
                      palette={palette}
                      disabled={value <= -MAX_OFFSET_MAGNITUDE}
                    />
                    <Text
                      style={[
                        styles.value,
                        tabularNumeralStyle,
                        { color: palette.accent },
                      ]}
                      maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                    >
                      {value > 0 ? `+${value}` : value}
                    </Text>
                    <StepperButton
                      label="+"
                      a11y={t('settings.prayerOffsetsIncrease', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                      onStep={big => setOffset(prayer, big ? 5 : 1)}
                      palette={palette}
                      disabled={value >= MAX_OFFSET_MAGNITUDE}
                    />
                  </View>
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.prayerOffsetsReset')}
              onPress={reset}
              style={({
                pressed,
                hovered,
              }: {
                pressed: boolean;
                hovered?: boolean;
              }) => [
                styles.reset,
                pressed && { opacity: 0.6 },
                hovered && { opacity: 0.92 },
              ]}
            >
              <Text style={[styles.resetLabel, { color: palette.danger }]}>
                {t('settings.prayerOffsetsReset')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

/** How long a hold waits before it repeats, how fast it repeats, and after how many steps they grow to five minutes. */
const HOLD_DELAY_MS = 400;
const HOLD_EVERY_MS = 90;
const HOLD_BIG_AFTER = 10;

function StepperButton({
  label,
  a11y,
  onStep,
  palette,
  disabled,
}: {
  label: string;
  a11y: string;
  /** One step: a minute, or (`big`, well into a hold) five. */
  onStep: (big: boolean) => void;
  palette: AppPalette;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  const hold = useCallback(() => {
    stop();
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      step.current(n > HOLD_BIG_AFTER);
    }, HOLD_EVERY_MS);
  }, [stop]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onStep(false)}
      onLongPress={hold}
      delayLongPress={HOLD_DELAY_MS}
      onPressOut={stop}
      disabled={disabled}
      hitSlop={8}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.stepBtn,
        {
          backgroundColor: palette.accentBg,
          borderColor: palette.border,
        },
        pressed && { opacity: 0.7 },
        hovered && { opacity: 0.92 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Text style={[styles.stepBtnLabel, { color: palette.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: SPACING.xl },
  help: { ...typeStyle('footnote'), marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  label: { ...typeStyle('headline') },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepBtn: {
    width: 36, // 36pt circular tap target
    height: 36,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnLabel: {
    ...typeStyle('title3'),
    fontWeight: '500',
  },
  value: {
    ...typeStyle('headline'),
    minWidth: 44,
    textAlign: 'center',
  },
  reset: {
    paddingVertical: SPACING.md + 2, // tokens-ok-line: 14px tap baseline
    alignItems: 'center',
  },
  resetLabel: { ...typeStyle('callout'), fontWeight: '400' },
});
