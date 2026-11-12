/**
 * The widgets under the app's Sky theme: every hour's card holds the
 * widgets' light text and its own accent, the highlight is the hour's (and
 * the widget's settings screen says so in the swatches' place), and a text
 * colour chosen for another card is not left dark on the Sky's dark one.
 */
import fs from 'fs';
import path from 'path';
import { widgetSkySchedule } from '../src/widget/widgetSkySchedule';
import { SKY_VARIANTS } from '../src/theme/skyMoods';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const kt = 'android/app/src/main/java/com/prayer_times/';

/** WCAG contrast of two #RRGGBB colours — PrayerWidgetDisplay.contrast, in the app's language. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const DAYS = [
  // Stockholm in November and at midsummer; Makkah; Jakarta.
  { day: '2026-11-12', times: { Fajr: '05:09', Sunrise: '07:27', Dhuhr: '11:37', Asr: '13:10', Maghrib: '15:37', Isha: '17:39' }, tomorrowFajr: '05:11', where: { latitude: 59.33, longitude: 18.07 } },
  { day: '2026-06-21', times: { Fajr: '02:10', Sunrise: '03:31', Dhuhr: '12:50', Asr: '17:20', Maghrib: '22:08', Isha: '23:40' }, tomorrowFajr: '02:10', where: { latitude: 59.33, longitude: 18.07 } },
  { day: '2026-03-20', times: { Fajr: '05:10', Sunrise: '06:26', Dhuhr: '12:29', Asr: '15:53', Maghrib: '18:32', Isha: '20:02' }, tomorrowFajr: '05:09', where: { latitude: 21.42, longitude: 39.83 } },
  { day: '2026-09-01', times: { Fajr: '04:38', Sunrise: '05:52', Dhuhr: '11:55', Asr: '15:13', Maghrib: '17:55', Isha: '19:05' }, tomorrowFajr: '04:38', where: { latitude: -6.2, longitude: 106.85 } },
];
const LIGHT_TEXT = '#E8EAED';
const WHITE = '#FFFFFF';

describe('every hour of the Sky theme on a widget', () => {
  it('is a card the light text reads on, with an accent that stands out from it', () => {
    let segments = 0;
    for (const variant of SKY_VARIANTS) {
      for (const day of DAYS) {
        const schedule = widgetSkySchedule(day, variant);
        expect(schedule.length).toBeGreaterThan(5);
        for (const [minute, bg, accent] of schedule) {
          segments += 1;
          const where = `${variant} ${day.day} ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')} ${bg} ${accent}`;
          // The times, in the card's own text (4.5: body text) and in white.
          expect([where, contrast(LIGHT_TEXT, bg) >= 4.5]).toEqual([where, true]);
          expect([where, contrast(WHITE, bg) >= 4.5]).toEqual([where, true]);
          // The next prayer, in the accent (3: large text and marks).
          expect([where, contrast(accent, bg) >= 3]).toEqual([where, true]);
        }
      }
    }
    expect(segments).toBeGreaterThan(100);
  });
});

describe('the widget under the Sky theme, natively', () => {
  const provider = read(kt + 'PrayerWidgetProvider.kt');
  const display = read(kt + 'PrayerWidgetDisplay.kt');
  const activity = read(kt + 'PrayerWidgetConfigureActivity.kt');
  const layout = read('android/app/src/main/res/layout/activity_prayer_widget_configure.xml');

  it('takes the hour\'s card and accent before anything the widget settings say', () => {
    expect(provider).toMatch(/fun backgroundArgb\(\): Int \{[\s\S]*?parseHexOrNull\(skyBg\)\?\.let \{ return Color\.argb\(a,/);
    expect(provider).toMatch(/private fun highlightInt\(\): Int \{\s*parseHexOrNull\(skyAccent\)\?\.let \{ return it \}/);
    // The day written ahead first; the hour the app was last open in after it.
    expect(provider).toContain('val skyBg = sky?.first ?: prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_SKY_BG, "") ?: ""');
  });

  it('does not leave a dark text on the Sky\'s dark card', () => {
    expect(display).toContain('text = legibleOnSky(context, text),');
    expect(display).toContain('if (card.second < SKY_CARD_MIN_OPACITY) return text');
    expect(display).toContain('return if (contrast(text, card.first) < SKY_TEXT_MIN_CONTRAST) DEFAULT_TEXT else text');
    // The rule, in numbers: the Dark preset fails on any hour's card, the light ones never do.
    for (const day of DAYS) {
      for (const [, bg] of widgetSkySchedule(day)) {
        expect(contrast('#1C1C1E', bg)).toBeLessThan(3);
        for (const preset of ['#E8EAED', '#FFFFFF', '#F3E9D2', '#E5C07B', '#A8C7FA']) {
          expect(contrast(preset, bg)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('says whose the highlight is on the widget\'s settings screen, in the swatches\' place', () => {
    expect(activity).toMatch(/val skyOn = try \{\s*PrayerWidgetProvider\.skyCard\(this\) != null/);
    expect(activity).toContain('findViewById<View>(R.id.widget_configure_highlight_scroll).visibility = if (skyOn) View.GONE else View.VISIBLE');
    expect(layout).toContain('android:id="@+id/widget_configure_highlight_sky"');
    const res = path.join(root, 'android/app/src/main/res');
    const dirs = fs.readdirSync(res).filter(d => /^values(-[a-z]{2})?$/.test(d) && fs.existsSync(path.join(res, d, 'strings.xml')));
    const withTitle = dirs.filter(d => read(`android/app/src/main/res/${d}/strings.xml`).includes('name="widget_configure_highlight"'));
    expect(withTitle.length).toBe(13);
    for (const d of withTitle) {
      expect([d, read(`android/app/src/main/res/${d}/strings.xml`).includes('name="widget_configure_highlight_sky"')]).toEqual([d, true]);
    }
  });
});
