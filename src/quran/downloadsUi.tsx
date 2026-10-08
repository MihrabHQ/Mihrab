/**
 * The pieces Settings → Downloads is drawn from.
 *
 * The page sits in `SettingsPage` and is built from `SettingsGroup`s like
 * every other settings page: one card per family, hairlines between the
 * rows, the heading above doing the work. What it used to be was a stack
 * of separately bordered cards, each with its own grey and outlined
 * buttons — a box per download and a box per button inside it. These are
 * the replacements, and none of them draws an outline:
 *
 *   • `DownloadRow`  — a row inside a group: name and size, one line of
 *     what is there, a bar when it is part way, and its actions.
 *   • `TextAction`   — a button that is only its word, tinted by what it
 *     does (accent to continue, danger to delete). The row is the
 *     surface; a filled or outlined pill inside it is a box in a box.
 *   • `ProgressTrack`— the thin bar, on `controlBg`, which every palette
 *     paints. (`border` is transparent under iOS's grouped chrome, so a
 *     track drawn in it vanished there.)
 *   • `StorageBar`   — the device's storage in three parts: Mihrab, the
 *     rest of the phone, and what is free.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A size dropped into a sentence, kept whole in a right-to-left one.
 * "3.6 GB" is left-to-right text; inside Arabic or Urdu the bidi algorithm
 * otherwise splits number from unit and the headline read "3.6 GB 5.8 …
 * GB". An isolate (LRI … PDI) makes it one unit. The direction is the
 * LANGUAGE's (`i18n.dir()`), not `I18nManager.isRTL`: the app lays out
 * right-to-left itself, so the native flag can be false in Arabic.
 */
export function inlineSize(bytes: number, rtl: boolean): string {
  const label = formatBytes(bytes);
  return rtl ? `\u2066${label}\u2069` : label;
}

/** A button that is only its word. */
export function TextAction({
  label,
  onPress,
  color,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  color: ColorValue;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 },
      ]}>
      <Text numberOfLines={1} style={[styles.textActionLabel, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A thin bar, 0–1. */
export function ProgressTrack({ progress }: { progress: number }) {
  const { palette } = useAppPalette();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.track, { backgroundColor: palette.controlBg }]}>
      <View
        style={[
          styles.fill,
          { width: `${Math.round(pct * 100)}%`, backgroundColor: palette.accentSolid },
        ]}
      />
    </View>
  );
}

/** One download inside a `SettingsGroup`. Draws no surface of its own. */
export function DownloadRow({
  title,
  sub,
  bytes,
  progress,
  actions,
}: {
  title: string;
  sub?: string;
  /** Omitted for a row that holds nothing yet. */
  bytes?: number;
  /** How far a part-way download is, 0–1. */
  progress?: number;
  actions?: ReactNode;
}) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.row}>
      {/* The name has the row's width; the size sits beside it and the
          actions go on a line of their own under it. In one line with
          Continue downloading and Delete, a reciter's name was squeezed
          into a column a word wide. */}
      <View style={styles.cardHead}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        {bytes != null ? (
          <Text style={[styles.rowBytes, { color: palette.muted }]}>
            {formatBytes(bytes)}
          </Text>
        ) : null}
      </View>
      {sub ? <Text style={[styles.rowSub, { color: palette.muted }]}>{sub}</Text> : null}
      {progress != null ? <ProgressTrack progress={progress} /> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

export type DeviceStorage = { total: number; free: number };

/**
 * The phone's storage: what Mihrab holds, what everything else holds, and
 * what is left. Without the device's own figures (`df` unanswered) it says
 * only what Mihrab holds — a bar built on a guess would be worse than none.
 */
export function StorageBar({
  mihrabBytes,
  device,
  loading,
}: {
  mihrabBytes: number;
  device: DeviceStorage | null;
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const rtl = i18n?.dir?.() === 'rtl';

  const total = device?.total ?? 0;
  const free = device ? Math.max(0, Math.min(device.free, total)) : 0;
  const used = Math.max(0, total - free);
  // Mihrab's bytes are inside "used"; the rest is everyone else's.
  const mihrab = Math.min(mihrabBytes, used);
  const other = Math.max(0, used - mihrab);
  const share = (n: number) => (total > 0 ? n / total : 0);
  // A few hundred megabytes of a 256 GB phone is a fraction of a pixel.
  // It is the one part this page is about, so it is always visible.
  const mihrabShare = mihrab > 0 ? Math.max(share(mihrab), 0.012) : 0;

  const legend: Array<{ key: string; color: ColorValue; label: string; value: number }> = [
    {
      key: 'mihrab',
      color: palette.accentSolid,
      label: t('downloads.storageMihrab', 'Mihrab'),
      value: mihrabBytes,
    },
  ];
  if (device) {
    legend.push(
      {
        key: 'other',
        color: palette.mutedSolid,
        label: t('downloads.storageOther', 'Other apps and system'),
        value: other,
      },
      {
        key: 'free',
        color: palette.accentBg,
        label: t('downloads.storageFree', 'Free'),
        value: free,
      },
    );
  }

  return (
    <View style={styles.storage}>
      <Text
        style={[styles.storageHeadline, { color: palette.text }]}
        accessibilityRole="header">
        {loading
          ? t('quran.loading', 'Loading…')
          : device
            ? t('downloads.storageFreeOf', {
                defaultValue: '{{free}} free of {{total}}',
                free: inlineSize(free, rtl),
                total: inlineSize(total, rtl),
              })
            : t('downloads.total', {
                defaultValue: 'Total on device: {{size}}',
                size: inlineSize(mihrabBytes, rtl),
              })}
      </Text>
      {device ? (
        <View
          accessible
          accessibilityLabel={legend
            .map(l => `${l.label} ${formatBytes(l.value)}`)
            .join(', ')}
          // The track IS the free space, in the accent's pale tint, so its
          // dot in the legend can be seen.
          style={[styles.bar, { backgroundColor: palette.accentBg }]}>
          {mihrabShare > 0 ? (
            <View
              style={{
                width: `${mihrabShare * 100}%`,
                backgroundColor: palette.accentSolid,
              }}
            />
          ) : null}
          <View
            style={[
              mihrabShare > 0 ? styles.barGap : null,
              {
                width: `${Math.max(0, share(other) - (mihrabShare - share(mihrab))) * 100}%`,
                backgroundColor: palette.mutedSolid,
              },
            ]}
          />
        </View>
      ) : null}
      <View style={styles.legend}>
        {legend.map(l => (
          <View key={l.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: l.color }]} />
            <Text style={[styles.legendLabel, { color: palette.muted }]}>{l.label}</Text>
            <Text style={[styles.legendValue, { color: palette.text }]}>
              {formatBytes(l.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.md,
  },
  rowTitle: { fontSize: TYPE.body.fontSize, fontWeight: '500', flex: 1 },
  rowBytes: { fontSize: TYPE.callout.fontSize, fontVariant: ['tabular-nums'] },
  rowSub: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    columnGap: SPACING.xl,
    rowGap: SPACING.xs,
  },
  textAction: { paddingVertical: 2 },
  textActionLabel: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  track: {
    height: 4,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  fill: { height: 4, borderRadius: RADIUS.full },
  storage: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, gap: SPACING.md },
  storageHeadline: { fontSize: TYPE.title3.fontSize, fontWeight: '600' },
  bar: {
    height: 10,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  // A hairline of the track between Mihrab and the rest, so two segments
  // that sit side by side still read as two.
  barGap: { marginStart: 2 },
  legend: { gap: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: TYPE.footnote.fontSize },
  legendValue: { fontSize: TYPE.footnote.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
