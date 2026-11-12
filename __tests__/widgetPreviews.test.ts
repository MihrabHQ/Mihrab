/**
 * A widget's sample is the widget: composed by its own code at the size it
 * is placed at — the one held, on the widget's own settings screen; one of
 * each kind placed, in the app.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const kt = 'android/app/src/main/java/com/prayer_times/';
const live = read(kt + 'WidgetLivePreview.kt');
const drawn = read(kt + 'WidgetPreviewCard.kt');
const activity = read(kt + 'PrayerWidgetConfigureActivity.kt');
const module_ = read(kt + 'PrayerWidgetModule.kt');
const page = read('src/screens/settings/pages/WidgetsSettingsScreen.tsx');
const previews = read('src/screens/settings/WidgetPreviews.tsx');
const manifest = read('android/app/src/main/AndroidManifest.xml');

describe('the sample is the widget itself', () => {
  it('composes the card with the widget\'s own code, for every widget the app has', () => {
    expect(live).toMatch(/widget\.compose\(\s*context = if \(overrides\.isEmpty\(\)\) context else Overlay\(context, overrides\),\s*size = size,/);
    // Every receiver the manifest offers a settings screen for is one it can draw.
    const offered = fs
      .readdirSync(path.join(root, 'android/app/src/main/res/xml'))
      .filter(f => /^glance_.*_info\.xml$/.test(f))
      .filter(f => read('android/app/src/main/res/xml/' + f).includes('PrayerWidgetConfigureActivity'));
    expect(offered.length).toBe(9);
    const listed = live.slice(live.indexOf('val PROVIDERS'), live.indexOf('val DEFAULTS')).match(/(\w+)::class\.java\.name/g) ?? [];
    expect(listed).toHaveLength(9);
    for (const cls of listed.map(c => c.replace('::class.java.name', ''))) {
      expect(manifest).toContain(`android:name=".${cls}"`);
    }
  });

  it('lays the choices not yet saved over the store the cards read — and writes nothing', () => {
    expect(live).toContain('return if (name == PrayerWidgetProvider.PREFS_NAME) OverlayPrefs(real, overrides) else real');
    expect(live).toContain('override fun getBoolean(key: String?, defValue: Boolean): Boolean = over[key] as? Boolean ?: real.getBoolean(key, defValue)');
    // The cards' localized context is made from this one: it keeps the overlay.
    expect(live).toMatch(/override fun createConfigurationContext[\s\S]*?Overlay\(super\.createConfigurationContext\(overrideConfiguration\), overrides\)/);
    // What is seen before Save is what Save stores: one list for both.
    expect(activity).toContain('val choices = pending()');
    expect(activity).toMatch(/for \(\(key, value\) in pending\(\)\) \{/);
  });

  it('cannot be touched: the Log\'s card would log a prayer', () => {
    expect(live).toContain('override fun onInterceptTouchEvent(ev: MotionEvent?): Boolean = true');
    expect(live).toMatch(/val shield = Shield\(context\)\s*shield\.addView\(\s*views\.apply\(/);
  });

  it('leaves the home screen on what is stored when the screen closes', () => {
    const destroy = activity.slice(activity.indexOf('override fun onDestroy()'));
    expect(destroy.slice(0, 400)).toContain('PrayerWidgetProvider.requestUpdate(this)');
  });
});

describe('the widget\'s own settings screen', () => {
  it('shows the widget it was opened from, at the size it is placed at', () => {
    expect(activity).toContain('widget = WidgetLivePreview.widgetOf(provider)');
    expect(activity).toContain('WidgetLivePreview.sizeOf(this, widgetId, providerClass, (innerPx / m.density).toInt())');
    expect(live).toContain('options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)');
    expect(live).toContain('options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)');
  });

  it('falls back to a drawing of the prayer-times card should composing fail', () => {
    expect(activity).toMatch(/catch \(e: Exception\) \{[\s\S]*?drawnPreview\(wall, innerPx\)/);
    expect(drawn).toMatch(/TimesTallWidgetReceiver::class\.java\.name -> Kind\.TALL/);
    expect(activity).toContain('WidgetPreviewCard.fill(wall, listOf(kind ?: WidgetPreviewCard.Kind.STRIP), look, sample, innerPx)');
  });
});

describe('Settings → Widgets in the app', () => {
  it('shows one of each kind placed, the prayer times first; the two prayer cards with none placed', () => {
    expect(module_).toMatch(/WidgetLivePreview\.placed\(reactContext\)\s*\.ifEmpty \{ WidgetLivePreview\.DEFAULTS\.map \{ it to null \} \}/);
    expect(live).toContain('val DEFAULTS: List<String> = PROVIDERS.take(2)');
    const order = live.slice(live.indexOf('val PROVIDERS'), live.indexOf('val DEFAULTS'));
    expect(order.indexOf('TimesWidgetReceiver')).toBeLessThan(order.indexOf('LogWidgetReceiver'));
    expect(order.indexOf('LogTallWidgetReceiver')).toBeLessThan(order.indexOf('StreakWidgetReceiver'));
    // One card failing costs that card, not the others.
    expect(module_).toContain('Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "widget sample failed: $cls", e)');
  });

  it('stands at the head of the page, a card at a time, and is asked for again when a setting changes', () => {
    expect(page.indexOf('<WidgetPreviews />')).toBeGreaterThan(-1);
    expect(page.indexOf('<WidgetPreviews />')).toBeLessThan(page.indexOf('<WidgetCard />'));
    expect(previews).toContain('snapToInterval={cardWidth + SPACING.sm}');
    expect(previews).toContain('}, [cardWidth, widget, appearance]);');
    expect(previews).toContain('drawn ? PREVIEW_AFTER_CHANGE_MS : 0,');
    // The latest request wins.
    expect(previews).toContain('if (mine === asked.current && Array.isArray(list)) setPictures(list.filter(p => p?.uri));');
  });

  it('gives every card in the row a wallpaper of one height: the tallest card\'s', () => {
    expect(module_).toContain('val tallestDp = sized.maxOfOrNull { it.third.height.value } ?: 0f');
    expect(module_).toContain('WidgetLivePreview.bitmap(reactContext, views, size, widthPx, tallestDp)');
    expect(live).toContain('val heightPx = (maxOf(tallestDp, size.height.value) * density).toInt() + 2 * pad');
    expect(live).toContain('View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY),');
  });

  it('draws nothing where there is no such module: other platforms, older builds', () => {
    expect(previews).toContain("if (Platform.OS !== 'android' || !getPrayerWidgetModule()?.renderPreviews) return null;");
  });
});
