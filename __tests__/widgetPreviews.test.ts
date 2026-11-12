/**
 * The prayer-times widget's sample is the card the reader is setting up:
 * the one held, on the widget's own settings screen; both, in the app.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const kt = 'android/app/src/main/java/com/prayer_times/';
const card = read(kt + 'WidgetPreviewCard.kt');
const activity = read(kt + 'PrayerWidgetConfigureActivity.kt');
const module_ = read(kt + 'PrayerWidgetModule.kt');
const page = read('src/screens/settings/pages/WidgetsSettingsScreen.tsx');
const previews = read('src/screens/settings/WidgetPreviews.tsx');

describe('the widget\'s own settings screen', () => {
  it('shows the card it was opened from, by the widget\'s receiver', () => {
    expect(card).toMatch(/NextPrayerWidgetReceiver::class\.java\.name -> Kind\.SMALL/);
    expect(card).toMatch(/TimesWidgetReceiver::class\.java\.name -> Kind\.STRIP/);
    expect(card).toMatch(/TimesTallWidgetReceiver::class\.java\.name -> Kind\.TALL/);
    expect(activity).toContain('kind = WidgetPreviewCard.kindOf(provider)');
    // One card, the held one; the strip only from a widget that is not a prayer-times one.
    expect(activity).toContain('WidgetPreviewCard.fill(wall, listOf(kind ?: WidgetPreviewCard.Kind.STRIP), look, sample, innerPx)');
  });

  it('draws the tall card with its graph, and the Next prayer card without a table', () => {
    expect(card).toContain('val withTable = kind != Kind.SMALL && look.showTable');
    const tall = card.slice(card.indexOf('// THE TALL CARD'));
    expect(tall).toContain('graph(context, practice, innerPx, accent)');
    expect(card).toContain('if (kind != Kind.TALL) {');
  });

  it('keeps no second drawing of the sample in the screen itself', () => {
    expect(activity).not.toContain('widget_configure_preview_row');
    expect(read('android/app/src/main/res/layout/activity_prayer_widget_configure.xml')).not.toContain('widget_configure_preview_card');
  });
});

describe('Settings → Widgets in the app', () => {
  it('shows both the strip and the tall card: it cannot know which is placed', () => {
    expect(module_).toMatch(/fun renderPreviews\(widthDp: Double, promise: Promise\)/);
    expect(module_).toContain('listOf(WidgetPreviewCard.Kind.STRIP, WidgetPreviewCard.Kind.TALL)');
    // Drawn as the widgets are drawn now, from their own store.
    expect(module_).toContain('WidgetPreviewCard.storedLook(reactContext)');
  });

  it('stands at the head of the page and is asked for again when a setting changes', () => {
    expect(page.indexOf('<WidgetPreviews />')).toBeGreaterThan(-1);
    expect(page.indexOf('<WidgetPreviews />')).toBeLessThan(page.indexOf('<WidgetCard />'));
    expect(previews).toContain('}, [width, widget, appearance]);');
    expect(previews).toContain('picture ? PREVIEW_AFTER_CHANGE_MS : 0,');
    // The latest request wins.
    expect(previews).toContain('if (mine === asked.current && p?.uri) setPicture(p);');
  });

  it('draws nothing where there is no such module: other platforms, older builds', () => {
    expect(previews).toContain("if (Platform.OS !== 'android' || !getPrayerWidgetModule()?.renderPreviews) return null;");
  });
});
