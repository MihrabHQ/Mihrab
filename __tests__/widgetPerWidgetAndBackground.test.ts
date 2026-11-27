/**
 * Issue #144: two prayer-times widgets, set up differently, each keep what
 * they show. And the widgets' background: the app's colouring, or a colour
 * that stays (dark, light, one's own).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_SETTINGS, WIDGET_BACKGROUND_DARK, WIDGET_BACKGROUND_LIGHT, WIDGET_BACKGROUND_MODES } from '../src/settings/types';
import { widgetBackgroundUpdates } from '../src/widget/syncWidgetUiHints';

const kt = (name: string) =>
  readFileSync(join(__dirname, '..', 'android/app/src/main/java/com/prayer_times', name), 'utf8');
const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

describe('what a prayer-times widget shows is its own', () => {
  const display = kt('PrayerWidgetDisplay.kt');
  const screen = kt('PrayerWidgetConfigureActivity.kt');

  it('keeps the four choices under the widget’s id, and no others', () => {
    expect(display).toContain(
      'val PER_WIDGET_KEYS = listOf(KEY_SHOW_LOCATION, KEY_SHOW_COUNTDOWN, KEY_SHOW_TABLE, KEY_TIME_SCALE)',
    );
    expect(display).toContain('fun ownKey(key: String, appWidgetId: Int): String = "$key#$appWidgetId"');
  });

  it('draws a widget from its own answer, and from the common one where it has none', () => {
    expect(display).toMatch(/if \(placed\(appWidgetId\) && p\.contains\(own\)\) p\.getBoolean\(own, true\) else p\.getBoolean\(key, true\)/);
    // A sample (a settings page's) has no id of the launcher's: the common answer.
    expect(display).toContain('private fun placed(appWidgetId: Int): Boolean = appWidgetId > 0');
    expect(kt('glance/PrayerGlanceWidget.kt')).toContain('PrayerWidgetDisplay.read(context, widgetId)');
    expect(kt('glance/MihrabGlanceWidget.kt')).toContain('LocalWidgetId provides appWidgetId');
  });

  it('saves them under the widget’s id and leaves the common answer alone', () => {
    expect(screen).toContain(
      'val key = if (name in PrayerWidgetDisplay.PER_WIDGET_KEYS) PrayerWidgetDisplay.ownKey(name, appWidgetId) else name',
    );
    expect(screen).toContain('PrayerWidgetDisplay.read(this, widgetId)');
  });

  it('forgets a removed widget’s choices, and moves a restored one’s', () => {
    const provider = kt('PrayerWidgetProvider.kt');
    expect(provider).toMatch(/override fun onDeleted[\s\S]{0,200}PrayerWidgetDisplay\.forget\(context, appWidgetIds\)/);
    expect(provider).toMatch(/override fun onRestored[\s\S]{0,260}PrayerWidgetDisplay\.moved\(context, oldWidgetIds, newWidgetIds\)/);
  });

  it('says so, in every language, on the widget’s screen and in the app', () => {
    for (const l of LOCALES) {
      const app = JSON.parse(readFileSync(join(__dirname, '..', `src/i18n/locales/${l}.json`), 'utf8'));
      const en = JSON.parse(readFileSync(join(__dirname, '..', 'src/i18n/locales/en.json'), 'utf8'));
      expect(app.settings.prayerWidgetOnly.length).toBeGreaterThan(40);
      if (l !== 'en') expect(app.settings.prayerWidgetOnly).not.toBe(en.settings.prayerWidgetOnly);
    }
  });
});

describe('the widgets’ background', () => {
  const provider = kt('PrayerWidgetProvider.kt');

  it('follows the app until asked not to', () => {
    expect(DEFAULT_SETTINGS.androidWidgetBackgroundMode).toBe('app');
    expect(WIDGET_BACKGROUND_MODES).toEqual(['app', 'dark', 'light', 'custom']);
    expect(provider).toContain('prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_BG_MODE, PrayerWidgetProvider.BG_APP)');
    expect(provider).toContain('else -> null');
  });

  it('draws the same dark and light the app names', () => {
    expect(provider).toContain(`const val BG_DARK_RGB = 0xFF${WIDGET_BACKGROUND_DARK.slice(1)}.toInt()`);
    expect(provider).toContain(`const val BG_LIGHT_RGB = 0xFF${WIDGET_BACKGROUND_LIGHT.slice(1)}.toInt()`);
  });

  it('takes neither the Sky theme’s hour nor the tint on a card of its own colour', () => {
    expect(provider).toContain(
      'return WidgetStyle(opacity.coerceIn(0, 100), hid.ifEmpty { "green" }, hex, false, "", "", fixed)',
    );
    expect(provider).toMatch(/fixedBg\?\.let \{ return Color\.argb\(a,/);
  });

  it('keeps the text readable on it: the light or the dark, whichever it holds better', () => {
    const display = kt('PrayerWidgetDisplay.kt');
    expect(display).toContain('PrayerWidgetProvider.skyCard(context) ?: PrayerWidgetProvider.fixedCard(context)');
    expect(display).toContain(
      'return if (contrast(DEFAULT_TEXT, card.first) >= contrast(DARK_TEXT, card.first)) DEFAULT_TEXT else DARK_TEXT',
    );
  });

  it('adopts a choice made on the widget’s own screen, and only a real one', () => {
    const cur = DEFAULT_SETTINGS;
    expect(widgetBackgroundUpdates({ bgMode: 'app', bgHex: '' }, cur)).toEqual({});
    expect(widgetBackgroundUpdates({ bgMode: 'light', bgHex: '' }, cur)).toEqual({ androidWidgetBackgroundMode: 'light' });
    expect(widgetBackgroundUpdates({ bgMode: 'custom', bgHex: '#0a2540' }, cur)).toEqual({
      androidWidgetBackgroundMode: 'custom',
      androidWidgetBackgroundCustomHex: '#0A2540',
    });
    expect(widgetBackgroundUpdates({ bgMode: 'wallpaper', bgHex: 'blue' }, cur)).toEqual({});
    expect(widgetBackgroundUpdates({}, cur)).toEqual({});
  });

  it('is offered on the widget’s screen and in the app, named in every language', () => {
    expect(kt('PrayerWidgetConfigureActivity.kt')).toContain('out[PrayerWidgetProvider.PREFS_WIDGET_BG_MODE] = bgMode');
    const card = readFileSync(join(__dirname, '..', 'src/screens/settings/WidgetCard.tsx'), 'utf8');
    expect(card).toContain('<WidgetBackground />');
    for (const l of LOCALES) {
      const app = JSON.parse(readFileSync(join(__dirname, '..', `src/i18n/locales/${l}.json`), 'utf8')).settings;
      for (const k of ['widgetBackgroundColor', 'widgetBackground_app', 'widgetBackgroundHelp']) {
        expect(typeof app[k]).toBe('string');
        expect(app[k].length).toBeGreaterThan(1);
      }
      const dir = l === 'en' ? 'values' : l === 'id' ? 'values-in' : `values-${l}`;
      const xml = readFileSync(join(__dirname, '..', 'android/app/src/main/res', dir, 'strings.xml'), 'utf8');
      for (const k of ['widget_configure_bg_colour', 'widget_configure_bg_app', 'widget_configure_bg_note']) {
        expect(xml).toContain(`name="${k}"`);
      }
    }
  });
});

describe('the strip in a cell taller than the layout it was given', () => {
  // The launcher shows the tallest rung of STRETCHABLE_SIZES that fits its
  // cell; a 90dp one-row cell takes the 66dp layout, and the 24dp between
  // them stood empty under the times.
  const widget = kt('glance/PrayerGlanceWidget.kt');

  it('shares the spare height above and below, where nothing else takes it', () => {
    expect(widget).toContain('val shareSpare = practice == null && !centreTimes');
    expect(widget).toMatch(
      /DirColumn\(modifier = GlanceModifier\.fillMaxSize\(\)\) \{\s*if \(shareSpare\) Spacer\(GlanceModifier\.defaultWeight\(\)\)\s*if \(!oneRow \|\| topNext\) Header\(/,
    );
    expect(widget).toMatch(
      /if \(showFoot\) Foot\(pr, top = 7, d\)\s*\}\s*if \(shareSpare\) Spacer\(GlanceModifier\.defaultWeight\(\)\)\s*\}\s*\}/,
    );
  });

  it('by weight, not by a number: the launcher measures it against the cell it has', () => {
    // No height of any launcher's is written into the fix.
    const at = widget.indexOf('val shareSpare');
    expect(widget.slice(at, at + 80)).not.toMatch(/\d/);
  });
});
