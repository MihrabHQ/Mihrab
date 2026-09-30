/**
 * The Android widgets are right at every size — and #31 cannot come back.
 *
 * Issue #31, as finally reported with the class name on the card:
 * ArrayIndexOutOfBoundsException on the Next-prayer, Prayer-times and
 * Prayer-times-(tall) widgets, on a phone with all three night marks on.
 * Nine rows (Sunrise, five prayers, three marks) indexed a highlight-box
 * array of eight. The Glance cards have no per-slot id arrays at all: the
 * rows are iterated with `withIndex()`, so a row count can no longer index
 * past anything.
 *
 * The size story: every Glance widget is a function of `LocalSize` and
 * nothing else (`SizeMode.Exact`, one composition per size the launcher can
 * show), and nothing inside a render reads the options bundle for the
 * "current" size.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const KT = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const GLANCE = path.join(KT, 'glance');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const read = (...p: string[]) => readFileSync(path.join(...p), 'utf8');
const kt = (name: string) => read(KT, `${name}.kt`);
const glance = (name: string) => read(GLANCE, `${name}.kt`);

const prayer = glance('PrayerGlanceWidget');

describe('the prayer rows — issue #31', () => {
  // Replaces "the column arrays are all the same length" and "every slot the
  // arrays name exists in the list layout": COL_* and prayer_widget.xml are gone.
  it('has no fixed per-slot id arrays to fall out of step', () => {
    expect(prayer).not.toMatch(/intArrayOf\(/);
    expect(prayer).not.toMatch(/R\.id\.widget_col_/);
  });

  it('makes room for all nine rows in the list', () => {
    // Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha and the three night marks.
    expect(prayer).toMatch(/private const val LIST_SLOTS = 9/);
    expect(prayer).toMatch(/val shown = m\.rows\.take\(LIST_SLOTS\)/);
  });

  it('indexes the rows by iteration, never by a fixed table', () => {
    expect(prayer).toMatch(/for \(\(i, r\) in shown\.withIndex\(\)\)/);
  });

  it('sizes the strip’s times for six columns, not nine', () => {
    expect(prayer).toMatch(/private const val STRIP_COLUMNS = 6/);
    expect(prayer).toMatch(/val columns = m\.rows\.take\(STRIP_COLUMNS\)/);
  });
});

describe('one composition per size the launcher can show', () => {
  // Replaces the WidgetSizing / RemoteViews(map) tests: SizeMode.Exact is
  // that machinery done by the library (see MihrabGlanceWidget).
  const base = glance('MihrabGlanceWidget');
  const widgets = [
    'PrayerGlanceWidget',
    'LogGlanceWidget',
    'StreakGlanceWidget',
    'ReadingGlanceWidget',
    'HijriGlanceWidget',
    'TasbihGlanceWidget',
  ];

  it('uses the library’s exact size map', () => {
    expect(base).toMatch(/override val sizeMode: SizeMode = SizeMode\.Exact/);
  });

  it.each(widgets)('%s draws through it', name => {
    expect(glance(name)).toMatch(/: MihrabGlanceWidget\("[a-z]+"\)/);
  });

  it('reads the size from LocalSize only, in one place', () => {
    expect(glance('GlanceSupport')).toMatch(/fun cardSize\(\): CardSize \{\s*val s = LocalSize\.current/);
    for (const f of readdirSync(GLANCE).filter(f => f.endsWith('.kt'))) {
      const src = read(GLANCE, f);
      // Nothing in a render asks the launcher for the "current" size.
      expect(src).not.toMatch(/getAppWidgetOptions\(/);
      expect(src).not.toMatch(/PrayerWidgetProvider\.sizeDp\(/);
    }
  });

  it('every provider class is a Glance receiver holding its widget', () => {
    for (const [cls, w] of [
      ['PrayerWidgetLogProvider', 'LogGlanceWidget'],
      ['PrayerWidgetStreakProvider', 'StreakGlanceWidget'],
      ['PrayerWidgetReadingProvider', 'ReadingGlanceWidget'],
      ['PrayerWidgetHijriProvider', 'HijriGlanceWidget'],
      ['PrayerWidgetTasbihProvider', 'TasbihGlanceWidget'],
    ]) {
      expect(kt(cls)).toMatch(new RegExp(`: GlanceAppWidgetReceiver\\(\\)[\\s\\S]*glanceAppWidget: GlanceAppWidget = ${w}\\(\\)`));
    }
  });

  it('Hijri and Tasbih drop a line at a short size instead of clipping it', () => {
    const hijri = glance('HijriGlanceWidget');
    expect(hijri).toMatch(/const val SHORT_HEIGHT_DP = 52/);
    expect(hijri).toMatch(/const val NARROW_WIDTH_DP = 170/);
    expect(hijri).toMatch(/if \(!short\) Label\(h\.year\.toString\(\)/);
    expect(hijri).toMatch(/h\.nextMonthName\.isNotEmpty\(\) && !short && !narrow/);
    // The layout's own floor stays below the threshold, so the short variant is reachable.
    expect(read(RES, 'xml', 'glance_hijri_info.xml')).toMatch(/android:minResizeHeight="40dp"/);
    const tasbih = glance('TasbihGlanceWidget');
    expect(tasbih).toMatch(/const val SHORT_HEIGHT_DP = 110/);
    expect(tasbih).toMatch(/if \(!short\) Label\(footerLine\(context, m\.todayTotal, m\.todayRounds\)/);
    expect(read(RES, 'xml', 'glance_tasbih_info.xml')).toMatch(/android:minResizeHeight="100dp"/);
    // Size 0 is "unknown" and draws the full card — the callers with no launcher to ask.
    for (const src of [hijri, tasbih]) expect(src).toMatch(/heightDp in 1 until SHORT_HEIGHT_DP/);
  });
});

/**
 * "Can't load widget" — the launcher refuses whole layouts over one class.
 *
 * RemoteViews inflates only an allow-list of view classes; anything else
 * (a bare <View> spacer, <Space>, a Material widget) throws
 * "Class not allowed to be inflated" on the launcher side, where no
 * try/catch of ours can turn it into a Mihrab error card. One of these
 * widgets shipped once with a <View> spacer and showed exactly that.
 * Every layout that reaches a RemoteViews — the picker previews, the
 * embedded card / countdown, and the error card — is held to the list.
 */
describe('every widget layout inflates under RemoteViews', () => {
  // https://developer.android.com/reference/android/widget/RemoteViews (API 31+, without the
  // collection views this app does not use).
  const ALLOWED = new Set([
    'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout',
    'TextView', 'ImageView', 'ImageButton', 'Button', 'Chronometer', 'ProgressBar',
    'AnalogClock', 'TextClock', 'ViewFlipper', 'AdapterViewFlipper',
    'ListView', 'GridView', 'StackView',
  ]);
  const layoutDir = path.join(RES, 'layout');
  const layouts = readdirSync(layoutDir).filter(f => /^(prayer_widget|glance_).*\.xml$/.test(f));

  it('covers the previews and the Glance-embedded layouts', () => {
    expect(layouts.length).toBeGreaterThanOrEqual(12);
    for (const f of [
      'prayer_widget_tasbih_preview.xml', 'prayer_widget_strip_preview.xml',
      'glance_card.xml', 'glance_error_card.xml', 'glance_countdown.xml',
    ]) {
      expect(layouts).toContain(f);
    }
    // The old live layouts are gone: a resurrected one would be a second drawing path.
    expect(layouts).not.toContain('prayer_widget.xml');
  });

  for (const f of layouts) {
    it(`${f} uses only allow-listed classes`, () => {
      const src = read(layoutDir, f);
      const classes = [...src.matchAll(/^\s*<([A-Za-z][A-Za-z0-9_.]*)/gm)].map(m => m[1]);
      expect(classes.length).toBeGreaterThan(0);
      const offenders = classes.filter(c => !ALLOWED.has(c));
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * A throw in ANY widget's render is a Mihrab error card, not the
 * launcher's. Each Glance card builds its model inside `guarded` and shows
 * `ErrorContent` on failure; a throw in the composition itself lands in
 * `MihrabGlanceWidget.onCompositionError`, which draws
 * `WidgetErrorCard.errorCard`; and the guard itself never trusts the state
 * it is called in.
 */
describe('every widget degrades to a Mihrab error card', () => {
  for (const name of ['Prayer', 'Log', 'Streak', 'Reading', 'Hijri', 'Tasbih']) {
    it(`${name}GlanceWidget builds its model guarded and shows ErrorContent on failure`, () => {
      const src = glance(`${name}GlanceWidget`);
      expect(src).toMatch(/guarded\(/);
      expect(src).toMatch(/onFailure = \{ ErrorContent\(context, it\) \}/);
    });
  }

  it('a throw in the composition draws the Mihrab error card, and the library’s is a Mihrab card too', () => {
    const base = glance('MihrabGlanceWidget');
    expect(base).toMatch(/GlanceAppWidget\(errorUiLayout = R\.layout\.glance_error_card\)/);
    expect(base).toMatch(/override fun onCompositionError\(/);
    expect(base).toMatch(/WidgetErrorCard\.errorCard\(context, R\.layout\.glance_error_card, throwable\)/);
    // Only exceptions, as WidgetErrorCard: an Error is not a rendering fault.
    expect(base).toMatch(/if \(throwable !is Exception\)/);
  });

  it('the in-card error puts the class name on the card, never the message', () => {
    const support = glance('GlanceSupport');
    expect(support).toMatch(/Placeholder\("\$label \(\$\{e\.javaClass\.simpleName\}\)", color = Palette\.DANGER\)/);
    expect(support).not.toMatch(/e\.message/);
    expect(support).toMatch(/Log\.e\(PrayerWidgetProvider\.WIDGET_LOG_TAG, "\$what glance widget failed", e\)/);
  });

  it('the guard shows the class name, not the message, and survives a broken context', () => {
    const src = kt('WidgetErrorCard');
    expect(src).toMatch(/catch \(e: Exception\)/);
    expect(src).not.toMatch(/catch \(e: Throwable\)/);
    expect(src).toMatch(/e\.javaClass\.simpleName/);
    expect(src).not.toMatch(/e\.message/);
    expect(src).toMatch(/try \{ PrayerWidgetProvider\.localized\(base\) \} catch/);
    expect(src).toMatch(/R\.id\.widget_placeholder, View\.VISIBLE/);
    expect(src).toMatch(/R\.id\.widget_content, View\.GONE/);
    expect(src).toMatch(/Log\.e\(PrayerWidgetProvider\.WIDGET_LOG_TAG/);
  });

  it('the error card layout has the placeholder the guard fills in', () => {
    expect(read(RES, 'layout', 'glance_error_card.xml')).toContain('android:id="@id/widget_placeholder"');
  });
});

/**
 * The launch burst is one redraw, not ten. The app pushes the same payload
 * several times in the first second; `setData` stores an unchanged payload
 * and redraws only when the last drawn one is over a minute old — and a
 * taken tap queue always forces the next redraw, so a projected tap never
 * outlives the app's verdict on it.
 */
describe('setData coalesces identical pushes', () => {
  const module = kt('PrayerWidgetModule');

  it('skips the fan-out for an unchanged payload drawn within the window', () => {
    // An empty v1 is a removed key since step 1.7, which reads back as null.
    expect(module).toMatch(
      /val unchanged = json\.ifEmpty \{ null \} == prefs\.getString\(PrayerWidgetProvider\.PREFS_KEY, null\)/,
    );
    expect(module).toMatch(/in 0\.\.FANOUT_COALESCE_MS/);
    expect(module).toMatch(/if \(unchanged && drawnRecently\) \{\s*promise\.resolve\(null\)\s*return\s*\}/);
    expect(module).toMatch(/const val FANOUT_COALESCE_MS = 60_000L/);
  });

  it('still stores the payload and marks the draw when it does redraw', () => {
    expect(module).toMatch(/\.putString\(PrayerWidgetProvider\.PREFS_KEY, json\)[\s\S]*?\.putLong\(PREFS_LAST_FANOUT_MS, now\)[\s\S]*?PrayerWidgetProvider\.requestUpdate\(reactContext\)/);
  });

  it('a taken tap queue forces the next redraw', () => {
    expect(module).toMatch(/WidgetLogQueue\.take\(reactContext\)\s*if \(entries\.isNotEmpty\(\)\) forceNextFanout\(\)/);
    expect(module).toMatch(/WidgetTasbihQueue\.take\(reactContext\)\s*if \(entries\.isNotEmpty\(\)\) forceNextFanout\(\)/);
    expect(module).toMatch(/\.remove\(PREFS_LAST_FANOUT_MS\)/);
  });

  it('appearance and UI-hint changes are never coalesced', () => {
    const appearance = module.slice(
      module.indexOf('fun setAndroidWidgetAppearance'),
      module.indexOf('private fun forceNextFanout'),
    );
    expect(appearance).not.toMatch(/FANOUT_COALESCE_MS|PREFS_LAST_FANOUT_MS/);
    expect(appearance).toMatch(/PrayerWidgetProvider\.requestUpdate\(reactContext\)/);
  });
});
