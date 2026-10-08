// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * Settings → Prayer times → Hijri calendar: which calendar the Hijri date is
 * read in, and a day either side of it. See `hijri/calendar.ts`.
 *
 * Asked for from Indonesia (2026-10-08), where the government and Nahdlatul
 * Ulama begin a month by one rule and Muhammadiyah by another, and the two
 * are a day apart at Ramadan and Eid more often than not. Each row says
 * whose calendar it is; the adjustment covers a local announcement that
 * differs from any of them.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  HIJRI_ADJUST_MAX,
  HIJRI_ADJUST_MIN,
  HIJRI_CALENDAR_IDS,
  type HijriCalendarId,
} from '../../hijri/calendar';
import { formatHijriLabel } from '../../hijri/formatHijriLabel';
import { useHijriCalendarVersion } from '../../hijri/useHijriCalendarVersion';
import { SettingsBlock, SettingsGroup } from './SettingsGroup';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

const NAME_DEFAULTS: Record<HijriCalendarId, string> = {
  tabular: 'Standard (calculated)',
  mabims: 'Indonesia — Government & NU',
  khgt: 'Indonesia — Muhammadiyah',
};

const DESC_DEFAULTS: Record<HijriCalendarId, string> = {
  tabular: 'A fixed arithmetic calendar. It can differ from local announcements by a day.',
  mabims:
    'The MABIMS rule (crescent 3° high, 6.4° from the sun, seen from Indonesia) used by Kemenag and Nahdlatul Ulama. The final dates for Ramadan and the Eids are confirmed by sighting (sidang isbat).',
  khgt: 'The Global Hijri Calendar (KHGT, crescent 5° high, 8° from the sun anywhere on Earth) used by Muhammadiyah.',
};

function HijriCalendarCardImpl() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  // Re-render when the calendar moves, so the preview below follows.
  // (The fasting reminders are rescheduled by AppNavigationRoot.)
  useHijriCalendarVersion();
  const adjust = settings.hijriAdjustDays;


  // Today's date as the app will now print it, so a change is seen at once.
  const today = formatHijriLabel(new Date());

  const adjustLabel =
    adjust === 0
      ? t('settings.hijriAdjustNone', 'No adjustment')
      : t('settings.hijriAdjustDays', {
          defaultValue: '{{sign}}{{count}} day',
          defaultValue_other: '{{sign}}{{count}} days',
          count: Math.abs(adjust),
          sign: adjust > 0 ? '+' : '−',
        });

  return (
    <SettingsGroup
      title={t('settings.hijriCalendarTitle', 'Hijri calendar')}
      footer={t(
        'settings.hijriCalendarFooter',
        'Calculated in advance from each rule. If the date announced where you live differs, adjust it by a day.',
      )}>
      {HIJRI_CALENDAR_IDS.map(id => {
        const selected = settings.hijriCalendar === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => updateSettings({ hijriCalendar: id })}
            style={({ pressed }) => [
              styles.option,
              { borderColor: selected ? palette.accent : palette.border },
              pressed ? styles.pressed : null,
            ]}>
            <View style={styles.optionHead}>
              <Text style={[styles.optionTitle, { color: palette.text }]}>
                {t(`settings.hijriCalendar_${id}`, NAME_DEFAULTS[id])}
              </Text>
              {selected ? (
                <Text style={[styles.check, { color: palette.accent }]}>✓</Text>
              ) : null}
            </View>
            <Text style={[styles.optionDesc, { color: palette.muted }]}>
              {t(`settings.hijriCalendarDesc_${id}`, DESC_DEFAULTS[id])}
            </Text>
          </Pressable>
        );
      })}

      <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('settings.hijriAdjust', 'Adjust the date')}
        </Text>
        <View style={styles.stepRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.hijriAdjustEarlier', 'One day earlier')}
            disabled={adjust <= HIJRI_ADJUST_MIN}
            onPress={() => updateSettings({ hijriAdjustDays: adjust - 1 })}
            style={[
              styles.stepBtn,
              { borderColor: palette.border, opacity: adjust <= HIJRI_ADJUST_MIN ? 0.4 : 1 },
            ]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>−</Text>
          </Pressable>
          <Text
            style={[styles.stepValue, tabularNumeralStyle, { color: palette.text }]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {adjustLabel}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.hijriAdjustLater', 'One day later')}
            disabled={adjust >= HIJRI_ADJUST_MAX}
            onPress={() => updateSettings({ hijriAdjustDays: adjust + 1 })}
            style={[
              styles.stepBtn,
              { borderColor: palette.border, opacity: adjust >= HIJRI_ADJUST_MAX ? 0.4 : 1 },
            ]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>+</Text>
          </Pressable>
        </View>
        <Text style={[styles.today, { color: palette.muted }]}>
          {t('settings.hijriToday', { defaultValue: 'Today: {{date}}', date: today })}
        </Text>
      </SettingsBlock>
    </SettingsGroup>
  );
}

export const HijriCalendarCard = memo(HijriCalendarCardImpl);

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  pressed: { opacity: 0.7 },
  optionHead: { flexDirection: 'row', alignItems: 'center' },
  optionTitle: { flex: 1, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  check: { fontSize: TYPE.body.fontSize, fontWeight: '700', marginStart: SPACING.sm },
  optionDesc: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.xs },
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: TYPE.title2.fontSize },
  stepValue: {
    fontSize: TYPE.body.fontSize,
    fontWeight: '600',
    minWidth: 120,
    textAlign: 'center',
  },
  today: { fontSize: TYPE.footnote.fontSize, textAlign: 'center', marginTop: SPACING.md },
});
