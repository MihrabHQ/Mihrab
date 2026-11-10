/**
 * The prayer-times widget's display options (Settings → Appearance → widget):
 * text colour, what is shown, and the size of the times.
 */
import { coerceWidgetTimeScale } from '../src/settings/storage';
import {
  DEFAULT_SETTINGS,
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
} from '../src/settings/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { prayerWidgetDisplayUpdates } from '../src/widget/syncWidgetUiHints';
import { normaliseHex, WIDGET_TEXT_SWATCHES } from '../src/screens/settings/PrayerWidgetCard';

describe('widget display defaults', () => {
  it('draws the card as it always was until something is changed', () => {
    expect(DEFAULT_SETTINGS.androidWidgetTextColor).toBe('#E8EAED');
    expect(DEFAULT_SETTINGS.androidWidgetShowLocation).toBe(true);
    expect(DEFAULT_SETTINGS.androidWidgetShowCountdown).toBe(true);
    expect(DEFAULT_SETTINGS.androidWidgetShowTable).toBe(true);
    expect(DEFAULT_SETTINGS.androidWidgetTimeScale).toBe(100);
  });
});

describe('coerceWidgetTimeScale', () => {
  it('keeps a value on the ladder', () => {
    expect(coerceWidgetTimeScale(120)).toBe(120);
  });

  it('snaps between rungs and clamps to the ends', () => {
    expect(coerceWidgetTimeScale(113)).toBe(110);
    expect(coerceWidgetTimeScale(10)).toBe(WIDGET_TIME_SCALE_MIN);
    expect(coerceWidgetTimeScale(400)).toBe(WIDGET_TIME_SCALE_MAX);
  });

  it('falls back to 100% on anything that is not a number', () => {
    expect(coerceWidgetTimeScale('big')).toBe(100);
    expect(coerceWidgetTimeScale(NaN)).toBe(100);
    expect(coerceWidgetTimeScale(undefined)).toBe(100);
  });
});

describe('normaliseHex (the custom text colour)', () => {
  it.each([
    ['#ffd27f', '#FFD27F'],
    ['FFD27F', '#FFD27F'],
    [' #abc123 ', '#ABC123'],
  ])('reads %p as %p', (input, out) => expect(normaliseHex(input)).toBe(out));

  it.each(['', '#FFF', '#GGGGGG', '#FFD27F0', 'red'])('refuses %p', input => {
    expect(normaliseHex(input)).toBeNull();
  });
});

describe('options changed on the widget itself', () => {
  const current = { ...DEFAULT_SETTINGS };
  const same = {
    textHex: '#E8EAED',
    showLocation: true,
    showCountdown: true,
    showTable: true,
    timeScale: 100,
  };

  it('changes nothing when they match', () => {
    expect(prayerWidgetDisplayUpdates(same, current)).toEqual({});
  });

  it('adopts what differs', () => {
    expect(
      prayerWidgetDisplayUpdates({ ...same, textHex: '#ffd27f', showTable: false, timeScale: 130 }, current),
    ).toEqual({ androidWidgetTextColor: '#FFD27F', androidWidgetShowTable: false, androidWidgetTimeScale: 130 });
  });

  it('adopts the time since the adhan set on the widget\'s own screen', () => {
    expect(prayerWidgetDisplayUpdates({ ...same, sinceAdhan: 20 }, current)).toEqual({
      widgetSinceAdhanMinutes: 20,
    });
    // Never stored natively (-1), not one of the choices, or the same: nothing.
    expect(prayerWidgetDisplayUpdates({ ...same, sinceAdhan: -1 }, current)).toEqual({});
    expect(prayerWidgetDisplayUpdates({ ...same, sinceAdhan: 45 }, current)).toEqual({});
    expect(prayerWidgetDisplayUpdates({ ...same, sinceAdhan: current.widgetSinceAdhanMinutes }, current)).toEqual({});
  });

  it('ignores a colour that is not one, and clamps the size', () => {
    expect(prayerWidgetDisplayUpdates({ ...same, textHex: '', timeScale: 400 }, current)).toEqual({
      androidWidgetTimeScale: 150,
    });
  });
});

describe('the widget screen and the app offer the same colours', () => {
  it('lists the same presets, in the same order', () => {
    const kt = readFileSync(
      join(__dirname, '../android/app/src/main/java/com/prayer_times/PrayerWidgetConfigureActivity.kt'),
      'utf8',
    );
    const native = [...kt.matchAll(/R\.string\.widget_configure_text_(\w+) to "(#[0-9A-F]{6})"/g)].map(m => ({
      id: m[1],
      hex: m[2],
    }));
    expect(native).toEqual(WIDGET_TEXT_SWATCHES.map(s => ({ id: s.id, hex: s.hex })));
  });
});

describe('the widget\'s own settings screen', () => {
  const dir = join(__dirname, '../android/app/src/main');
  const kt = readFileSync(join(dir, 'java/com/prayer_times/PrayerWidgetConfigureActivity.kt'), 'utf8');
  const display = readFileSync(join(dir, 'java/com/prayer_times/PrayerWidgetDisplay.kt'), 'utf8');
  const layout = readFileSync(join(dir, 'res/layout/activity_prayer_widget_configure.xml'), 'utf8');

  it('shows a sample of the card above the controls, outside the scroll', () => {
    const preview = layout.indexOf('widget_configure_preview"');
    const scroll = layout.indexOf('<ScrollView');
    expect(preview).toBeGreaterThan(-1);
    expect(preview).toBeLessThan(scroll);
    // Every control redraws it.
    expect((kt.match(/renderPreview\(\)/g) ?? []).length).toBeGreaterThan(6);
  });

  it('offers the time since the adhan, with the app\'s choices', () => {
    expect(layout).toContain('widget_configure_since_adhan_group');
    expect(display).toMatch(/SINCE_ADHAN_CHOICES = listOf\(0, 10, 20, 30\)/);
    expect(kt).toMatch(/putInt\(PrayerWidgetDisplay\.KEY_SINCE_ADHAN, sinceAdhan\)/);
  });

  it('the card counts with the stored window, not only the published one', () => {
    const card = readFileSync(join(dir, 'java/com/prayer_times/glance/PrayerGlanceWidget.kt'), 'utf8');
    const provider = readFileSync(join(dir, 'java/com/prayer_times/PrayerWidgetProvider.kt'), 'utf8');
    expect(card).toMatch(/PrayerWidgetDisplay\.sinceAdhanMinutes\(context, p\.sinceAdhanMinutes\)/);
    expect(provider).toMatch(/PrayerWidgetDisplay\.sinceAdhanMinutes\(context,/);
  });

  it('the Next prayer card is not offered a table or a time size', () => {
    expect(kt).toMatch(/widget_configure_show_table\)\.visibility = if \(isSmallWidget\) View\.GONE/);
    expect(kt).toMatch(/widget_configure_time_size_group\)\.visibility = if \(isSmallWidget\) View\.GONE/);
  });
});
