// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import notifee from '@notifee/react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { formatUtcOffset } from '../../utils/utcOffset';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';

/**
 * Four banner conditions surfaced above the next-prayer card:
 *   • `usingLocalFallback` — the network provider failed and the widget is
 *     showing on-device adhan computations.
 *   • `exactAlarmDenied` — Android revoked SCHEDULE_EXACT_ALARM (task #3).
 *   • `notifPermDenied` — iOS notification permission denied.
 *   • `timezoneShift` — the clocks changed where the reader is, and every
 *     time on this screen has just moved with them (issue #56).
 *   • `methodNote` — the calculation behind the times is not current.
 */
type PermissionBannersProps = {
  usingLocalFallback: boolean;
  exactAlarmDenied: boolean;
  notifPermDenied: boolean;
  onRetryFetch: () => void;
  /**
   * The offset change that caused this refresh, if one did.
   *
   * WHY IT IS SAID AT ALL. Morocco left GMT+1 on 2026-09-20 and every
   * prayer time in the country moved an hour earlier the same morning
   * (issue #56). An app that changes Fajr from 05:49 to 04:49 without a
   * word is indistinguishable, to the person reading it, from an app that
   * has broken — and the whole value of the correction is that they trust
   * the new number enough to pray by it.
   *
   * Dismissible and never sticky: it explains something that has just
   * happened in front of them, so it goes when they have read it.
   */
  timezoneShift?: { from: number; to: number } | null;
  onDismissTimezoneShift?: () => void;
  /**
   * The calculation behind these times is not current — past its correction
   * list, newer tables still being checked, or a method that has moved on
   * and needs an app update (`methodCurrency.ts`). Dismissible.
   */
  methodNote?: string | null;
  onDismissMethodNote?: () => void;
  /**
   * The phone's zone data is stale for the place it is in, and its clock —
   * and these times, written on it — run ahead of the place's (#82).
   * Dismissible; says what to set by hand.
   */
  zoneNote?: string | null;
  onDismissZoneNote?: () => void;
  /**
   * The status bar's height, when these are the first thing on a page
   * that runs to the top edge of the screen — the phone's Today.
   *
   * A banner there was drawn through the clock and behind the camera
   * cutout. It is padding rather than a margin so the tint fills the
   * strip behind the bar rather than leaving a band of page above it.
   */
  topInset?: number;
  /**
   * Drawn OVER the page, as cards under the status bar, instead of in the
   * page's column above the hero (the phone): a notice is a word to the
   * reader about the page, and in the column it pushed the sky, the
   * countdown and the day's times down by its own height for as long as
   * it stood — a different page, cramped, with a band of paper over the
   * sky. A card takes the page's card colour, an edge and a shadow, since
   * what is under it is the sky and not the page; and every card can be
   * put away, the ones with an action of their own too (until the app is
   * next opened), because a card that cannot be closed covers the
   * place's name for good.
   */
  floating?: boolean;
};

/** Notices put away for this run of the app (floating cards only). */
const putAway = new Set<string>();

/**
 * Whether any notice is drawn at all. The Home page asks it too: the
 * notices' wrapper is a child of a column with a gap, and a wrapper left
 * mounted with nothing in it still took the gap — a band of page colour
 * across the top of the screen, above the sky.
 */
export function permissionBannersShown(p: {
  usingLocalFallback?: boolean;
  exactAlarmDenied?: boolean;
  notifPermDenied?: boolean;
  timezoneShift?: unknown;
  methodNote?: unknown;
  zoneNote?: unknown;
}): boolean {
  return Boolean(
    p.usingLocalFallback ||
      p.exactAlarmDenied ||
      p.notifPermDenied ||
      p.timezoneShift ||
      p.methodNote ||
      p.zoneNote,
  );
}

function PermissionBannersImpl({
  usingLocalFallback,
  exactAlarmDenied,
  notifPermDenied,
  onRetryFetch,
  timezoneShift,
  onDismissTimezoneShift,
  methodNote,
  onDismissMethodNote,
  zoneNote,
  onDismissZoneNote,
  topInset = 0,
  floating = false,
}: PermissionBannersProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [, redraw] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const away = (key: string) => floating && putAway.has(key);
  const card = floating
    ? [styles.card, { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.text }]
    : { backgroundColor: palette.accentBg };
  /** The close on a card whose own button is an action, not a dismissal. */
  const close = (key: string) =>
    floating ? (
      <Pressable
        onPress={() => {
          putAway.add(key);
          redraw(n => n + 1);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('common.dismiss', 'Dismiss')}>
        <Text style={[styles.close, { color: palette.muted }]}>✕</Text>
      </Pressable>
    ) : null;

  if (
    !permissionBannersShown({
      usingLocalFallback,
      exactAlarmDenied,
      notifPermDenied,
      timezoneShift,
      methodNote,
      zoneNote,
    })
  ) {
    return null;
  }

  // Only the FIRST banner clears the bar; any others stack under it.
  // The strip runs behind the bar rather than starting under it: the tint
  // fills the top of the screen, so the clock sits on the notice instead
  // of on a band of page above it. Its top corners square off for that.
  const lead =
    topInset > 0
      ? {
          paddingTop: topInset + SPACING.sm,
          borderTopStartRadius: 0,
          borderTopEndRadius: 0,
        }
      : null;
  let first = true;
  const leadStyle = () => {
    if (!first) return null;
    first = false;
    return lead;
  };

  // The notices, in the order they are said. FIRST, above the offline
  // notice, the clocks' change: it is the one that explains why the
  // numbers underneath are not the numbers the reader remembers, and the
  // others are about how they were obtained.
  type Notice = {
    key: string;
    text: string;
    action: string;
    onAction?: () => void;
    /** The action is not a dismissal: the floating card gets a close of its own. */
    closable?: boolean;
    /** In the column, the text is held to two lines. */
    clamp?: boolean;
  };
  const dismiss = t('common.dismiss', 'Dismiss');
  const notices: Notice[] = [];
  if (timezoneShift) {
    notices.push({
      key: 'timezone',
      text: t('home.timezoneShiftNotice', {
        defaultValue: 'The clocks here changed ({{from}} → {{to}}). Prayer times have been refreshed.',
        from: formatUtcOffset(timezoneShift.from),
        to: formatUtcOffset(timezoneShift.to),
      }),
      action: dismiss,
      onAction: onDismissTimezoneShift,
    });
  }
  if (methodNote) notices.push({ key: 'method', text: methodNote, action: dismiss, onAction: onDismissMethodNote });
  if (zoneNote) notices.push({ key: 'zone', text: zoneNote, action: dismiss, onAction: onDismissZoneNote });
  if (usingLocalFallback && !away('fallback')) {
    notices.push({ key: 'fallback', text: t('home.localFallbackNotice'), action: t('common.retry'), onAction: onRetryFetch, closable: true });
  }
  if (exactAlarmDenied && !away('exactAlarm')) {
    notices.push({
      key: 'exactAlarm',
      text: t('home.exactAlarmDenied'),
      action: t('common.openSettings'),
      onAction: () => notifee.openAlarmPermissionSettings().catch(() => {}),
      closable: true,
      clamp: true,
    });
  }
  if (notifPermDenied && !away('notifications')) {
    notices.push({
      key: 'notifications',
      text: t('home.notifPermDenied'),
      action: t('common.openSettings'),
      onAction: () => Linking.openSettings().catch(() => {}),
      closable: true,
      clamp: true,
    });
  }
  if (notices.length === 0) return null;

  // OVER THE PAGE, ONE AT A TIME. Three cards under the status bar covered
  // the place's name, the date and half the sky, and a long note (a
  // method's, four lines of it) did the same alone. The card on show is
  // the first; the rest wait behind it, counted (+2), and each comes
  // forward as the one before it is put away. A note longer than two
  // lines is held to two until it is touched.
  if (floating) {
    const n = notices[0];
    const more = notices.length - 1;
    const open = openKey === n.key;
    return (
      <View style={[styles.banner, card]}>
        <Pressable
          style={styles.grow}
          onPress={() => setOpenKey(open ? null : n.key)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={n.text}>
          <Text style={[styles.text, styles.textFloating, { color: palette.text }]} numberOfLines={open ? undefined : FLOATING_LINES}>
            {n.text}
          </Text>
        </Pressable>
        {more > 0 ? (
          <Text style={[styles.more, tabularNumeralStyle, { color: palette.muted, borderColor: palette.border }]}>
            {`+${more}`}
          </Text>
        ) : null}
        <Pressable onPress={n.onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={n.action}>
          <Text style={[styles.action, { color: palette.accent }]}>{n.action}</Text>
        </Pressable>
        {n.closable ? close(n.key) : null}
      </View>
    );
  }

  return (
    <>
      {notices.map(n => (
        <View key={n.key} style={[styles.banner, card, leadStyle()]}>
          <Text style={[styles.text, { color: palette.text }]} numberOfLines={n.clamp ? 2 : undefined}>
            {n.text}
          </Text>
          <Pressable onPress={n.onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={n.action}>
            <Text style={[styles.action, { color: palette.accent }]}>{n.action}</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}

/** A floating card's note, until it is touched: this many lines. */
export const FLOATING_LINES = 2;

export const PermissionBanners = memo(PermissionBannersImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  text: { flex: 1, fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  grow: { flex: 1 },
  textFloating: { flex: 0 },
  more: {
    fontSize: TYPE.caption.fontSize,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  action: { fontSize: TYPE.footnote.fontSize, fontWeight: '400' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  close: { fontSize: TYPE.footnote.fontSize, paddingStart: SPACING.xs },
});
