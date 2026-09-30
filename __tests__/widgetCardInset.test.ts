/**
 * Android widgets draw a card, not a slab.
 *
 * Reported with a screenshot of two Mihrab widgets stacked on a Pixel home
 * screen: their backgrounds ran together into one block with a seam
 * through it. A widget's host view IS its cell — measured on a Pixel
 * launcher, a 4x1 got [50,966]–[1030,1227] and the next row began where
 * that one ended — so nothing separates two widgets except what they
 * decline to paint, and these painted every pixel of it. Being translucent
 * (88% by default) made it worse: any overlap composited twice and drew a
 * dark line.
 *
 * Measured on an emulator, before and after, same wallpaper and launcher:
 *
 *   before   card 981x261 at x 50..1030   two cards 30px apart
 *   after    card 949x229 at x 66..1014   two cards 62px apart
 *
 * 16px on each side at that density is the 6dp inset below, and the card
 * colour composited to exactly rgb(27,27,29) in BOTH builds — which is the
 * evidence that recolouring the shape reproduces the old fill exactly,
 * alpha included.
 *
 * Three things have to stay true for that to keep working, and each is a
 * different file, which is why they are pinned here rather than trusted:
 *   1. every card a widget draws is inset + the recolourable card ImageView
 *      (Glance: `MihrabCard` embeds glance_card.xml inside a
 *      widget_card_inset-padded Box; the error card is glance_error_card.xml),
 *   2. nothing calls `setBackgroundColor` on a widget root again — that
 *      REPLACES the drawable with a flat ColorDrawable and takes the
 *      rounding with it, which is how the slab happened in the first
 *      place,
 *   3. the card radius defers to the platform's on API 31+, so our corner
 *      lands under the launcher's mask instead of inside it.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ANDROID_RES = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res',
);
const PROVIDER_DIR = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
);
const GLANCE_DIR = path.join(PROVIDER_DIR, 'glance');

const read = (...parts: string[]) =>
  readFileSync(path.join(...parts), 'utf8');

const ktIn = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.kt'));

/**
 * The Glance widgets: every glance/*.kt that draws a card of its own.
 * (Replaces the old list of live RemoteViews layouts.)
 */
const CARD_WIDGETS = [
  'HijriGlanceWidget.kt',
  'LogGlanceWidget.kt',
  'PrayerGlanceWidget.kt',
  'ReadingGlanceWidget.kt',
  'StreakGlanceWidget.kt',
  'TasbihGlanceWidget.kt',
];

describe('the Glance widgets draw on the inset card', () => {
  it('are the complete set that call MihrabCard', () => {
    const callers = ktIn(GLANCE_DIR).filter(f =>
      f !== 'GlanceSupport.kt' && /\bMihrabCard\(/.test(read(GLANCE_DIR, f)),
    );
    // If a widget is added and not listed above, it would silently skip
    // every assertion here — so the list is checked, not assumed.
    expect(callers.sort()).toEqual([...CARD_WIDGETS].sort());
  });

  it('MihrabCard insets the card from the host view, so neighbours cannot touch', () => {
    const support = read(GLANCE_DIR, 'GlanceSupport.kt');
    expect(support).toMatch(/fun MihrabCard\(/);
    expect(support).toMatch(/fillMaxSize\(\)\.padding\(R\.dimen\.widget_card_inset\)/);
  });

  it('MihrabCard draws the rounded, recolourable card, not a Glance background', () => {
    const support = read(GLANCE_DIR, 'GlanceSupport.kt');
    expect(support).toContain('R.layout.glance_card');
    expect(support).toMatch(/WidgetCard\.paint\(it, background\)/);
    const body = support.slice(support.indexOf('fun MihrabCard('));
    // Glance's cornerRadius is Android 12+ only — a slab below that.
    expect(body.slice(0, body.indexOf('\n}\n'))).not.toMatch(/cornerRadius|\.background\(/);
  });

  for (const name of ['glance_card.xml', 'glance_error_card.xml']) {
    describe(name, () => {
      const xml = () => read(ANDROID_RES, 'layout', name);

      it('draws the rounded card behind its content', () => {
        expect(xml()).toContain('android:id="@id/widget_card"');
        expect(xml()).toContain('android:src="@drawable/widget_card"');
      });

      it('no longer paints a flat colour edge to edge', () => {
        expect(xml()).not.toContain('android:background="#E01C1C1E"');
        expect(xml()).not.toMatch(/android:background="#/);
      });
    });
  }

  it('the error card is inset from the host view like the live ones', () => {
    // glance_card.xml is embedded inside MihrabCard's padded Box; the error
    // card is a whole RemoteViews of its own, so it carries the inset itself.
    const xml = read(ANDROID_RES, 'layout', 'glance_error_card.xml');
    expect(xml).toContain('android:id="@id/widget_shell"');
    expect(xml).toContain('android:padding="@dimen/widget_card_inset"');
  });
  // The old "keeps widget_root, which providers still pad and make
  // clickable" test is gone with the RemoteViews layouts; Glance pads and
  // clicks its own Box inside MihrabCard.
});

describe('the widget code', () => {
  const sources = [
    ...ktIn(PROVIDER_DIR).map(f => [PROVIDER_DIR, f] as const),
    ...ktIn(GLANCE_DIR).map(f => [GLANCE_DIR, f] as const),
  ];

  it('never calls setBackgroundColor on a widget root again', () => {
    for (const [dir, f] of sources) {
      if (f === 'WidgetCard.kt') continue; // its doc comment quotes the old call
      expect(read(dir, f)).not.toContain(
        'setInt(R.id.widget_root, "setBackgroundColor"',
      );
    }
  });

  it('paints the card through the one helper', () => {
    // Every Glance card goes through MihrabCard -> WidgetCard.paint, and the
    // error card paints through it too.
    expect(read(GLANCE_DIR, 'GlanceSupport.kt')).toContain('WidgetCard.paint(');
    expect(read(PROVIDER_DIR, 'WidgetErrorCard.kt')).toContain('WidgetCard.paint(');
  });

  it('recolours the shape rather than replacing it', () => {
    const helper = read(PROVIDER_DIR, 'WidgetCard.kt');
    expect(helper).toContain('"setColorFilter"');
    // Without this the shape paints at full opacity and the user's
    // background-strength setting silently stops working.
    expect(helper).toContain('"setImageAlpha"');
    expect(helper).toContain('Color.alpha(argb)');
  });
});

describe('the card geometry', () => {
  it('has an inset and a fallback radius for pre-Android-12', () => {
    const dimens = read(ANDROID_RES, 'values', 'dimens.xml');
    expect(dimens).toMatch(/name="widget_card_inset">\s*\d+dp/);
    expect(dimens).toMatch(/name="widget_card_radius">\s*\d+dp/);
  });

  it('defers to the platform radius on API 31+', () => {
    const v31 = read(ANDROID_RES, 'values-v31', 'dimens.xml');
    expect(v31).toContain(
      '@android:dimen/system_app_widget_background_radius',
    );
  });

  it('draws the card white, so the colour filter is an exact recolour', () => {
    const drawable = read(ANDROID_RES, 'drawable', 'widget_card.xml');
    expect(drawable).toContain('android:color="#FFFFFFFF"');
    expect(drawable).toContain('@dimen/widget_card_radius');
  });

  it('rounds the picker previews to match what gets placed', () => {
    for (const f of readdirSync(path.join(ANDROID_RES, 'layout'))) {
      if (!/^prayer_widget.*_preview\.xml$/.test(f)) continue;
      expect(read(ANDROID_RES, 'layout', f)).not.toContain(
        'android:background="#E01C1C1E"',
      );
    }
  });
});
