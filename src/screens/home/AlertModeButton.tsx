/**
 * How this prayer announces itself — the control, on the row.
 *
 * A mosque for the adhan, a bell for the plain alert, a struck bell for
 * silence. One tap cycles; the label under it names the state, because a
 * glyph alone asks the reader to remember which of three it is looking
 * at and this is a control people will set once and then rely on.
 *
 * It lives beside the time, not in Settings, because the question it
 * answers is a question about THIS prayer — Fajr at 04:30 is a different
 * decision from Maghrib — and a setting three screens away that has to
 * be changed twice a day is a setting people abandon.
 */
import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import type { AppPalette } from '../../theme/appPalette';
import type { PrayerAlertMode } from '../../settings/alertModes';

const SIZE = 20;

/**
 * A mosque — a dome between two minarets. It was a speaker, which sat one
 * glance from the bell beside it (both are "a thing that makes a sound") and
 * made the adhan and the plain alert easy to mix up. A building is nothing
 * like a bell, and it is where the call comes from.
 */
function AdhanGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
      {/* The two minarets: a cap on a shaft. */}
      <Path d="M3.1 8L4.6 4.3L6.1 8z" fill={color} />
      <Path d="M3.6 8h2v12.5h-2z" fill={color} />
      <Path d="M17.9 8L19.4 4.3L20.9 8z" fill={color} />
      <Path d="M18.4 8h2v12.5h-2z" fill={color} />
      {/* The dome and its finial. */}
      <Path
        d="M7.5 15C7.5 11.5 9.5 9.5 12 8C14.5 9.5 16.5 11.5 16.5 15z"
        fill={color}
      />
      <Circle cx={12} cy={6.2} r={1} fill={color} />
      {/* The hall, with its doorway cut out. */}
      <Path
        d="M5.6 15h12.8v5.5H5.6z M10.8 20.5v-2.6a1.2 1.2 0 0 1 2.4 0v2.6z"
        fill={color}
        fillRule="evenodd"
      />
      {/* The ground. */}
      <Path d="M2.5 20.5h19v1.5h-19z" fill={color} />
    </Svg>
  );
}

/** A bell — an alert, not a call. */
function BellGlyph({
  color,
  struck,
}: {
  color: ColorValue;
  struck?: boolean;
}) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
      <Path
        d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M10 19a2 2 0 0 0 4 0"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      {struck ? (
        <Line
          x1="4"
          y1="20"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

type Props = {
  mode: PrayerAlertMode;
  palette: AppPalette;
  /** Cycle to the next mode this row allows. */
  onPress: () => void;
  /** The localised prayer name, for the accessibility label. */
  prayerLabel: string;
  /** Muted styling for Sunrise and the night marks. */
  secondary?: boolean;
  /** This prayer differs from the standing setting — the one case that
   *  earns the accent. */
  emphasised?: boolean;
};

function AlertModeButtonImpl({
  mode,
  palette,
  onPress,
  prayerLabel,
  secondary = false,
  emphasised = false,
}: Props) {
  const { t } = useTranslation();

  const label =
    mode === 'adhan'
      ? t('settings.alertModeAdhan', 'Adhan')
      : mode === 'notification'
        ? t('settings.alertModeNotification', 'Alert')
        : t('settings.alertModeSilent', 'Silent');

  // Quiet by default. The accent marks only a prayer set DIFFERENTLY from
  // the standing setting — seven rows all saying "Adhan" in green was a
  // setting drawn as a button seven times (redesign-plan B.1.5). Silence
  // still reads as absence: the struck bell sits back whatever else is true.
  const tint =
    mode === 'silent' || secondary || !emphasised
      ? palette.muted
      : palette.accentSolid;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prayerLabel} — ${label}`}
      accessibilityHint={t(
        'settings.alertModeHint',
        'Changes how this prayer alerts you',
      )}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {/* The glyph alone. The word under it ("Silent", "Adhan") was a
          second line on every row of a list that has to fit the screen,
          and the glyph already says it — a struck bell is silence, the
          bell is an alert, the mosque is the adhan. The word stays in
          the accessibility label, where it is read rather than looked at. */}
      <View style={styles.glyph}>
        {mode === 'adhan' ? (
          <AdhanGlyph color={tint} />
        ) : (
          <BellGlyph color={tint} struck={mode === 'silent'} />
        )}
      </View>
    </Pressable>
  );
}

export const AlertModeButton = memo(AlertModeButtonImpl);

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    paddingVertical: 2,
  },
  pressed: { opacity: 0.55 },
  glyph: { height: SIZE, justifyContent: 'center' },
});
