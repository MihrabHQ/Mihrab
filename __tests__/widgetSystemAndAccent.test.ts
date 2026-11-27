/**
 * The widgets' background can follow the phone (System) or the app's own
 * light and dark (App), and the app's accent is on offer — as the highlight
 * and as the text — on any background.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_SETTINGS, WIDGET_BACKGROUND_MODES } from '../src/settings/types';
import { APP_ACCENT_SWATCHES, appAccentHexForWidget } from '../src/settings/widgetAccent';
import { widgetBackgroundUpdates } from '../src/widget/syncWidgetUiHints';

const root = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const kt = (name: string) => root(`android/app/src/main/java/com/prayer_times/${name}`);
const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

describe('a background that follows the phone', () => {
  const provider = kt('PrayerWidgetProvider.kt');

  it('is a choice of its own, beside App', () => {
    expect(WIDGET_BACKGROUND_MODES).toEqual(['app', 'system', 'dark', 'light', 'custom']);
    expect(provider).toContain('val BG_MODES = listOf(BG_APP, BG_SYSTEM, BG_DARK, BG_LIGHT, BG_CUSTOM)');
  });

  it('is the same dark and the same light the fixed choices are, by the phone’s mode', () => {
    expect(provider).toContain('BG_SYSTEM -> if (night) BG_DARK_RGB else BG_LIGHT_RGB');
    expect(provider).toContain('UI_MODE_NIGHT_YES');
  });

  it('is redrawn when the phone’s mode turns, and only then', () => {
    const watch = kt('WidgetNightWatch.kt');
    expect(watch).toContain('IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED)');
    // Asked a moment after the broadcast, and once more: the broadcast can
    // arrive before the process's resources have the new mode.
    expect(watch).toContain('private val CHECKS_MS = longArrayOf(300L, 2_000L)');
    expect(watch).toContain('for (ms in CHECKS_MS) main.postDelayed(check, ms)');
    expect(watch).toMatch(/if \(now != night\) \{\s*night = now\s*try \{\s*PrayerWidgetProvider\.requestUpdate\(app\)/);
    expect(kt('MainApplication.kt')).toContain('WidgetNightWatch.install(this)');
  });

  it('adopts System when it was chosen on the widget’s own screen', () => {
    expect(widgetBackgroundUpdates({ bgMode: 'system' }, DEFAULT_SETTINGS)).toMatchObject({
      androidWidgetBackgroundMode: 'system',
    });
  });
});

describe('App follows the app’s own light and dark', () => {
  const provider = kt('PrayerWidgetProvider.kt');

  it('the app tells the widgets its theme', () => {
    expect(root('src/widget/syncWidgetUiHints.ts')).toMatch(/setAndroidWidgetAppLook\?\.\(\s*settings\.appearance,/);
    expect(kt('PrayerWidgetModule.kt')).toContain('.putString(PrayerWidgetProvider.PREFS_WIDGET_APP_THEME, theme.trim().lowercase())');
  });

  it('a light app has a light card; an app on System has the phone’s', () => {
    expect(provider).toContain('val light = theme == "light" || (theme == "system" && !night)');
    expect(provider).toMatch(/if \(light\) return WidgetStyle\(.*PrayerWidgetProvider\.BG_LIGHT_RGB\)/);
  });

  it('the Sky theme’s hour still comes first, and a phone the app never wrote to stays dark', () => {
    expect(provider).toContain('if (skyBg.isEmpty()) {');
    // No theme written: neither "light" nor "system" — the dark card, as before.
    expect(provider).toContain('getString(PrayerWidgetProvider.PREFS_WIDGET_APP_THEME, "")');
  });
});

describe('the app’s accent on any background', () => {
  it('is one colour the widget can move: the brighter of a swatch’s pair, a custom one as it is', () => {
    for (const sw of APP_ACCENT_SWATCHES) expect(appAccentHexForWidget(sw.id)).toBe(sw.dark.toUpperCase());
    expect(appAccentHexForWidget('custom', '#a1b2c3')).toBe('#A1B2C3');
    expect(appAccentHexForWidget('custom', 'nope')).toBeNull();
    expect(appAccentHexForWidget('custom')).toBeNull();
  });

  it('is the highlight unless the widgets were given their own', () => {
    expect(DEFAULT_SETTINGS.androidWidgetHighlightOwn).toBe(false);
    const provider = kt('PrayerWidgetProvider.kt');
    expect(provider).toContain('val useApp = (followsApp || !own) && appAccent.matches(Regex("^#[0-9A-Fa-f]{6}$"))');
    // Mirrored from the accent shelf on the same rule.
    expect(root('src/components/AccentShelf.tsx')).toContain(
      "if (widget.androidWidgetBackgroundMode === 'app' || !widget.androidWidgetHighlightOwn) writeWidget(patch);",
    );
  });

  it('is not sent under Material You, where the app has none to give', () => {
    expect(root('src/widget/syncWidgetUiHints.ts')).toContain(
      'settings.useSystemDynamicTheme ? null : appAccentHexForWidget(settings.appAccentId, settings.appAccentCustomHex)',
    );
    expect(kt('PrayerWidgetConfigureActivity.kt')).toContain('if (appAccent == null) highlightOwn = true');
  });

  it('is the first swatch on both screens, and choosing another makes the highlight the widgets’ own', () => {
    const screen = kt('PrayerWidgetConfigureActivity.kt');
    expect(screen).toContain('getString(R.string.widget_configure_highlight_app_accent), !highlightOwn)');
    expect(screen).toMatch(/highlightOwn = true\s+highlightId = id/);
    const card = root('src/screens/settings/WidgetCard.tsx');
    expect(card).toContain('testID="widget-highlight-app"');
    expect(card).toContain('androidWidgetHighlightOwn: false,');
    expect(card).toContain('updateSettings({ androidWidgetHighlightOwn: true, ...widgetPatchForAccent(sw.id) })');
  });

  it('can be the text too, kept readable on the card as text must be', () => {
    expect(DEFAULT_SETTINGS.androidWidgetTextAccent).toBe(false);
    const display = kt('PrayerWidgetDisplay.kt');
    expect(display).toContain('inAccent -> card?.let { CardInk.accentText(accent, it) }');
    const ink = kt('cardfit/CardInk.kt');
    expect(ink).toContain('const val ACCENT_TEXT_MIN = 4.5');
    expect(ink).toContain('fun accentText(accent: Int, card: Int): Int = tint(accent, card, ACCENT_TEXT_MIN)');
  });

  it('judges light and dark by the card, since a text in the accent can be either', () => {
    expect(kt('PrayerWidgetDisplay.kt')).toContain(
      'val onLight: Boolean get() = card?.let { !CardInk.lightTextCard(it) } ?: CardInk.onLight(text)',
    );
    expect(kt('glance/GlanceSupport.kt')).toContain('val onLight: Boolean get() = style.onLight');
  });

  it('adopts both choices from the widget’s own screen, and only a change', () => {
    expect(widgetBackgroundUpdates({ highlightOwn: true, textAccent: true }, DEFAULT_SETTINGS)).toEqual({
      androidWidgetHighlightOwn: true,
      androidWidgetTextAccent: true,
    });
    expect(widgetBackgroundUpdates({ highlightOwn: false, textAccent: false }, DEFAULT_SETTINGS)).toEqual({});
    expect(widgetBackgroundUpdates({}, DEFAULT_SETTINGS)).toEqual({});
  });

  it('is named in every language, in the app and on the widget’s screen', () => {
    for (const l of LOCALES) {
      const s = JSON.parse(root(`src/i18n/locales/${l}.json`)).settings;
      for (const k of ['widgetHighlightAppAccent', 'widgetTextAccent', 'widgetBackground_system']) {
        expect(typeof s[k]).toBe('string');
        expect(s[k].length).toBeGreaterThan(0);
      }
      const dir = l === 'en' ? 'values' : `values-${l === 'id' ? 'in' : l}`;
      const xml = root(`android/app/src/main/res/${dir}/strings.xml`);
      for (const k of ['widget_configure_highlight_app_accent', 'widget_configure_text_accent', 'widget_configure_bg_system']) {
        expect(xml).toContain(`<string name="${k}">`);
      }
      // The two screens say the same thing about the background and the text.
      expect(xml).toContain(`<string name="widget_configure_bg_note">${s.widgetBackgroundHelp}</string>`);
      expect(xml).toContain(`<string name="widget_configure_text_note">${s.widgetTextAutoHelp}</string>`);
    }
  });
});
