/**
 * What a prayer widget does when something goes wrong — issue #31.
 *
 * The report is a Huawei Nova 11i on 2.17.1 showing "Could not load
 * widget data" on the two widgets this provider draws, while the five
 * that do not use it were fine, and remove-and-re-add not helping. The
 * cause is on that phone and cannot be reproduced here, which is the
 * whole point of this file: the SHAPE of the failure was wrong in three
 * ways that can be fixed without owning the device.
 *
 *  1. The reason was discarded. `catch (_: Exception)` threw away the
 *     one piece of information that existed, in the one process that
 *     had it, and left a user and a maintainer looking at a sentence
 *     with no cause attached.
 *  2. An extra could take the times down. Everything after the six times
 *     — the night line, the streak, the practice grid — shared one
 *     try/catch with them, so any throw in a decoration replaced a
 *     perfectly good prayer card with an error.
 *  3. `Calendar.getInstance()` follows the default locale. On Thai and
 *     Japanese locales that is not a Gregorian year, and the payload's
 *     dateKey always is, so no day would ever match.
 *
 * Plus the tap, reported in the same issue and confirmed by reading the
 * code rather than by reproducing it: the root of these two widgets was
 * a bare MainActivity intent, which is what "opens the app wherever I
 * was before" means.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const JAVA = 'android/app/src/main/java/com/prayer_times';
const PROVIDER = read(`${JAVA}/PrayerWidgetProvider.kt`);
// The widgets are drawn by Glance now; these are where its guards live.
const SUPPORT = read(`${JAVA}/glance/GlanceSupport.kt`);
const PRAYER_GLANCE = read(`${JAVA}/glance/PrayerGlanceWidget.kt`);
const BASE_GLANCE = read(`${JAVA}/glance/MihrabGlanceWidget.kt`);
const CONTRACT = read(`${JAVA}/contract/WidgetContract.kt`);

describe('a tapped prayer widget has somewhere to go', () => {
  it('opens Today rather than wherever the app was left', () => {
    expect(PRAYER_GLANCE).toContain('openRoute(context, "mihrab://today", clearTop = true)');
    // A bare MainActivity intent is the bug, not a style.
    expect(PRAYER_GLANCE).not.toMatch(/Intent\(context, MainActivity::class\.java\)/);
    expect(SUPPORT).toMatch(/Intent\(Intent\.ACTION_VIEW, Uri\.parse\(uri\)\)/);
  });

  it('keeps the link inside this app', () => {
    // An implicit VIEW for a scheme somebody else registers is an app
    // chooser on a home-screen tap.
    const at = SUPPORT.indexOf('internal fun openRoute(');
    expect(at).toBeGreaterThan(-1);
    expect(SUPPORT.slice(at, at + 400)).toMatch(/setPackage\(context\.packageName\)/);
  });
});

describe('when a render fails, it says why', () => {
  it('does not swallow the exception', () => {
    // The model build logs the throw and hands it on to the error card.
    expect(SUPPORT).toMatch(
      /catch \(e: Exception\) \{\s*\n\s*Log\.e\(PrayerWidgetProvider\.WIDGET_LOG_TAG, "\$what glance widget failed", e\)\s*\n\s*Result\.failure\(e\)/,
    );
    // A throw in the composition itself is logged too, then drawn as the card.
    expect(BASE_GLANCE).toMatch(/Log\.e\(PrayerWidgetProvider\.WIDGET_LOG_TAG, "\$what glance widget failed", throwable\)/);
  });

  it('puts the cause on the card, and only the cause', () => {
    // A screenshot of a broken widget should be a diagnosis. The message
    // is deliberately not shown — it can carry payload content.
    expect(SUPPORT).toMatch(/\$\{e\.javaClass\.simpleName\}/);
    expect(SUPPORT).not.toMatch(/\$\{e\.message\}/);
    expect(SUPPORT).not.toMatch(/\$\{throwable\.message\}/);
  });
});

describe('an extra cannot take the times down', () => {
  // Removed: bindLoggedLine / bindStripHeader "is wrapped" — those were
  // RemoteViews binders with no Glance counterpart (the header and the
  // logged line are plain text in the model). Replaced by the `extra(...)`
  // wrapper the strip's model uses for the parts that can throw.
  it.each(['nightRow', 'practice', 'practiceGrid'])('%s is wrapped', (what: string) => {
    // Each call site sits inside extra(), so the practice grid failing
    // costs the grid rather than Maghrib.
    expect(PRAYER_GLANCE).toContain(`extra("${what}") {`);
  });

  it('the extras are the only thing that is contained', () => {
    // The rows themselves are not wrapped: a throw there is the error card.
    expect(PRAYER_GLANCE).not.toMatch(/extra\("(rows|times)"\)/);
  });

  it('says which extra failed', () => {
    expect(PRAYER_GLANCE).toMatch(
      /Log\.w\(PrayerWidgetProvider\.WIDGET_LOG_TAG, "glance widget extra failed: \$what", e\)/,
    );
  });
});

describe('the day the widget thinks it is', () => {
  /** Just this function — the next one down calls Calendar.getInstance(). */
  const fn = (() => {
    const from = PROVIDER.indexOf('fun todayDateKey(): String {');
    const rest = PROVIDER.slice(from);
    // Comments only, stripped: the comment in this very function
    // explains what `Calendar.getInstance()` would do, and an assertion
    // that reads comments is an assertion about prose.
    return rest
      .slice(0, rest.indexOf('\n    }') + 6)
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
  })();

  // It is WallClock's answer now, the one every widget reader and the Live
  // Activity share; the rules are held there, and by the Kotlin contract
  // tests (WallClockCalendarTest) under every calendar a locale can pick.
  const WALLCLOCK = readFileSync(
    path.join(ROOT, 'android/app/src/main/java/com/prayer_times/contract/WallClock.kt'),
    'utf8',
  );

  it('is Gregorian whatever the phone’s locale calendar is', () => {
    expect(fn).toMatch(/WallClock\.dateKey\(System\.currentTimeMillis\(\)\)/);
    // `Calendar.getInstance()` is a BuddhistCalendar on th-TH and a
    // JapaneseImperialCalendar on ja-JP-JP. The payload's dateKey is
    // written by JavaScript and is always Gregorian.
    expect(fn).not.toMatch(/Calendar\.getInstance\(\)/);
    expect(WALLCLOCK).toMatch(/GregorianCalendar\(zone, Locale\.ROOT\)/);
    expect(WALLCLOCK).toMatch(/String\.format\(\s*Locale\.ROOT,\s*"%04d-%02d-%02d"/);
  });

  it('still follows the phone’s time zone', () => {
    // Which DAY it is has to be the device's answer; only the calendar
    // system is pinned.
    expect(WALLCLOCK).toMatch(/fun dateKey\(epochMs: Long, zone: TimeZone = TimeZone\.getDefault\(\)\)/);
  });
});

describe('every plural the widgets format has an “other”', () => {
  // `getQuantityString` throws Resources.NotFoundException when the
  // selected quantity has no entry and no `other` to fall back on — and
  // Arabic selects zero/two/few/many where English never does. It would
  // land exactly where #31 lands: inside a widget render, as an
  // exception, on one user's phone and nobody else's.
  const RES = path.join(ROOT, 'android/app/src/main/res');
  const valueDirs = readdirSync(RES).filter(d => d.startsWith('values'));

  it.each(valueDirs)('%s', (dir: string) => {
    let xml = '';
    try {
      xml = read(path.join('android/app/src/main/res', dir, 'strings.xml'));
    } catch {
      return; // Not every values-* dir carries strings.
    }
    const plurals = xml.match(/<plurals name="[^"]+">[\s\S]*?<\/plurals>/g) ?? [];
    for (const block of plurals) {
      const name = /name="([^"]+)"/.exec(block)?.[1];
      expect([name, block.includes('quantity="other"')]).toEqual([name, true]);
    }
  });
});

describe('the render survives a payload it does not recognise', () => {
  // The Huawei cause in #31 is still unknown, but every throw that WAS
  // reachable in this path is now a missing row or a placeholder. The
  // payload is read by WidgetContract now, which never uses the throwing
  // org.json accessors (its own suites, and the Kotlin contract tests,
  // exercise the values).
  it('does not throw on a payload with no rows', () => {
    expect(CONTRACT).not.toMatch(/\.getJSONArray\(/);
    // A day with no prayers is no day; the card then draws its placeholder.
    expect(CONTRACT).toMatch(/prayers = o\.wcList\("prayers"\) \{ Row\.fromJson\(it as\? JSONObject\) \} \?: return null/);
    expect(read(`${JAVA}/glance/PrayerGlanceWidget.kt`)).toContain('if (m == null) {');
  });

  it('drops a malformed row rather than the card', () => {
    expect(CONTRACT).not.toMatch(/\.getJSONObject\(/);
    expect(CONTRACT).toMatch(/element\(a\.optJSONObject\(i\)\)\?\.let/);
  });

  it('reads a row’s fields without demanding them', () => {
    // `getString` throws when the key is absent; every field is read
    // through the tolerant wc* helpers instead.
    expect(CONTRACT).not.toMatch(/\b\w+\.(?:getString|getInt|getLong|getDouble|getBoolean)\(/);
  });
});

describe('the two entries in the widget picker', () => {
  // Reported as "duplicate ... widgets (4x1) in the choices". They are
  // not duplicates — one is the strip and one carries the graph — but on
  // a launcher that ignores targetCellWidth/Height (API 31) and falls
  // back to minWidth/minHeight, both advertised 250x60 and previewed
  // identically.
  const xml = (rel: string) => read(`android/app/src/main/res/xml/${rel}`);
  const dp = (src: string, attr: string) =>
    Number(new RegExp(`android:${attr}="(\\d+)dp"`).exec(src)?.[1] ?? 0);

  it.each([
    ['glance_prayer_info.xml', 'glance_prayer_tall_info.xml'],
    ['glance_log_info.xml', 'glance_log_tall_info.xml'],
  ])('%s and %s ask for different heights', (shortFile, tallFile) => {
    const short = xml(shortFile);
    const tall = xml(tallFile);
    expect(dp(tall, 'minHeight')).toBeGreaterThanOrEqual(
      dp(short, 'minHeight') * 2,
    );
  });

  it.each(['glance_prayer_tall_info.xml', 'glance_log_tall_info.xml'])(
    '%s can still be dragged down to the strip',
    (file: string) => {
      // minHeight is where the picker PLACES it; minResizeHeight is how
      // small it may then go. The tall entry losing the second was the
      // thing to avoid while fixing the first.
      const src = xml(file);
      expect(dp(src, 'minResizeHeight')).toBeLessThanOrEqual(60);
    },
  );
});
