/**
 * The shopfront speaks the languages the app does.
 *
 * Both Play and F-Droid build their listing out of
 * `fastlane/metadata/android/<locale>/` — title, short description, full
 * description, screenshots. For a long time exactly one of those existed,
 * `en-US`, while the app itself shipped in thirteen languages. So someone
 * browsing F-Droid's Religion category in Arabic, or searching Play in
 * Turkish, met an English shopfront for an app that would have spoken to
 * them in their own language. The listing is the only part of the product
 * a person reads BEFORE installing, and it was the only part not
 * translated.
 *
 * Worse, the failure is silent in both directions: a missing folder falls
 * back to English and looks like a choice, and a folder present but copied
 * from English looks like a translation. Neither shows up anywhere except
 * by opening the store in that language.
 *
 * ── AND THE TITLE IS NOT A BRAND SLOT ─────────────────────────────────
 *
 * Play weights the title above every other indexed field, and this one
 * read `Mihrab` — six of the thirty characters, and not a word anybody
 * searches for. The comparable app with half a million installs is titled
 * *Namaz Vakti*: the search term, not the brand. Every title here now
 * carries the name AND what the thing is, in the language of the person
 * reading it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'src', 'i18n', 'locales');
const STORE = path.join(ROOT, 'fastlane', 'metadata', 'android');

/**
 * App locale → the directory name Play and F-Droid read it from.
 *
 * Play wants a region on most of these (`de-DE`, not `de`) and refuses a
 * bare language for them; `ar`, `id` and `ur` are the ones it takes plain.
 * F-Droid is happy with either and follows whatever is here. Adding a
 * language to the app means adding a row here — and the first test below
 * is what says so out loud, rather than letting that locale's listing
 * quietly fall back to English.
 */
const STORE_DIR: Record<string, string> = {
  en: 'en-US',
  sv: 'sv-SE',
  ar: 'ar',
  bn: 'bn-BD',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  hi: 'hi-IN',
  id: 'id',
  ru: 'ru-RU',
  tr: 'tr-TR',
  ur: 'ur',
  zh: 'zh-CN',
};

/** Play's hard limits. Over them, the upload is rejected. */
const LIMITS = {
  title: 30,
  short_description: 80,
  full_description: 4000,
} as const;

type Field = keyof typeof LIMITS;
const FIELDS = Object.keys(LIMITS) as Field[];

const APP_LOCALES = readdirSync(I18N)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace(/\.json$/, ''))
  .sort();

const field = (dir: string, f: Field) =>
  readFileSync(path.join(STORE, dir, `${f}.txt`), 'utf8').trim();

describe('every language the app speaks has a listing', () => {
  it('maps each app locale to a store directory', () => {
    // The app's own locale files are the source of truth: add a language
    // and this fails until the shopfront learns it too.
    expect(APP_LOCALES.filter(l => !STORE_DIR[l])).toEqual([]);
  });

  it.each(APP_LOCALES)('%s has all three listing files', locale => {
    const dir = path.join(STORE, STORE_DIR[locale]);
    expect(existsSync(dir)).toBe(true);
    for (const f of FIELDS) {
      expect(existsSync(path.join(dir, `${f}.txt`))).toBe(true);
    }
  });

  it('has no store directory that belongs to no language', () => {
    // A directory Play uploads from but the app cannot display is a
    // listing nobody maintains.
    const known = new Set(Object.values(STORE_DIR));
    const dirs = readdirSync(STORE).filter(d =>
      statSync(path.join(STORE, d)).isDirectory(),
    );
    expect(dirs.filter(d => !known.has(d))).toEqual([]);
  });
});

describe('every field is inside the limit that would reject the upload', () => {
  it.each(APP_LOCALES.flatMap(l => FIELDS.map(f => [l, f] as const)))(
    '%s %s',
    (locale, f) => {
      const text = field(STORE_DIR[locale], f);
      // Report the overflow rather than a bare false — a failure here is
      // fixed by cutting a specific number of characters.
      expect({
        locale,
        field: f,
        over: Math.max(0, text.length - LIMITS[f]),
      }).toEqual({ locale, field: f, over: 0 });
    },
  );

  it.each(APP_LOCALES)('%s says something in every field', locale => {
    for (const f of FIELDS) {
      expect(field(STORE_DIR[locale], f).length).toBeGreaterThan(10);
    }
  });
});

describe('nothing is silently still in English', () => {
  const nonEnglish = APP_LOCALES.filter(l => l !== 'en');

  it.each(nonEnglish.flatMap(l => FIELDS.map(f => [l, f] as const)))(
    '%s %s is not the English text',
    (locale, f) => {
      // A copied English file is the one failure that looks exactly like
      // success from the outside: the folder is there, the upload works,
      // and the reader gets English anyway.
      expect(field(STORE_DIR[locale], f)).not.toBe(field('en-US', f));
    },
  );
});

describe('the title is not just the app name', () => {
  it.each(APP_LOCALES)('%s carries the name and what it is', locale => {
    const title = field(STORE_DIR[locale], 'title');
    expect(title).not.toBe('Mihrab');
    // Half the field is the floor, not the target: `Mihrab` alone was six
    // characters of thirty and indexed for nothing.
    expect(title.length).toBeGreaterThanOrEqual(12);
  });
});

describe('the per-release translation cost stays at three languages', () => {
  // Play and F-Droid fall back to en-US for "What's New" when a locale has
  // no changelog, which is the right trade: the listing is written once and
  // the changelog is written every release. release.sh gates on these three
  // and only these three.
  it.each(['en-US', 'sv-SE', 'ar'])('%s keeps its changelogs', dir => {
    expect(existsSync(path.join(STORE, dir, 'changelogs'))).toBe(true);
  });

  it('does not quietly acquire a fourth', () => {
    const withChangelogs = Object.values(STORE_DIR)
      .filter(d => existsSync(path.join(STORE, d, 'changelogs')))
      .sort();
    // If this grows, release.sh's LOCALES has to grow with it — otherwise a
    // locale carries a changelog that stops being written.
    expect(withChangelogs).toEqual(['ar', 'en-US', 'sv-SE']);
  });
});

/**
 * One app, one description, on every shelf.
 *
 * Play was filled from a CSV written separately from the fastlane files
 * F-Droid reads, and the two drifted until they described different apps:
 * "The Muslim Companion" on one, "Prayer Times & Quran" on the other. Both
 * now come from branding/IDENTITY.md through the fastlane files, the CSV
 * is generated from them, and the App Store copy sits beside them.
 */
describe('the listings are one listing', () => {
  it('the Play import is generated from the fastlane files', () => {
    const { render, OUT } = require('../scripts/store-listing-csv.js');
    expect(readFileSync(OUT, 'utf8')).toBe(render());
  });

  it.each(APP_LOCALES)(
    '%s keeps price and promotion words out of the short description',
    locale => {
      // Play: "must not contain keywords that indicate price or promotion",
      // and "No ads." tripped it — an app that does cannot be featured.
      expect(field(STORE_DIR[locale], 'short_description')).not.toMatch(
        /\bads?\b|\bfree\b|annons|gratis|إعلان|مجان|Werbung|kostenlos|\bpub\b|gratuit|anuncio|reklam|ücretsiz|iklan|реклам|бесплат|বিজ্ঞাপন|বিনামূল্যে|विज्ञापन|मुफ़्त|اشتہار|مفت|广告|免费/i,
      );
    },
  );

  it.each(APP_LOCALES)('%s leads its title with the name', locale => {
    const title = field(STORE_DIR[locale], 'title');
    expect(title).toMatch(/^(Mihrab|محراب|মিহরাব|मिहराब)/);
  });
});

describe('the App Store copy fits App Store Connect', () => {
  const IOS = path.join(ROOT, 'fastlane', 'metadata', 'ios');
  const IOS_LIMITS = {
    name: 30,
    subtitle: 30,
    promotional_text: 170,
    description: 4000,
  } as const;
  const locales = readdirSync(IOS).filter(d =>
    statSync(path.join(IOS, d)).isDirectory(),
  );
  const ios = (loc: string, f: string) =>
    readFileSync(path.join(IOS, loc, `${f}.txt`), 'utf8').trim();

  /**
   * Every language the app speaks, keyed by the App Store's locale code
   * and mapped to the Play directory the same words come from. It was
   * English, Swedish and Arabic until 2026-09-28, while the app and its
   * Play listing had thirteen — so a search in Turkish or Urdu found
   * nothing to match on the iPhone. scripts/appstore-metadata.py writes
   * exactly these, and says so in the same table.
   */
  const IOS_TO_PLAY: Record<string, string> = {
    'en-US': 'en-US',
    sv: 'sv-SE',
    'ar-SA': 'ar',
    'de-DE': 'de-DE',
    'es-ES': 'es-ES',
    'fr-FR': 'fr-FR',
    id: 'id',
    tr: 'tr-TR',
    ru: 'ru-RU',
    'zh-Hans': 'zh-CN',
    hi: 'hi-IN',
    bn: 'bn-BD',
    ur: 'ur',
  };

  it('has all thirteen languages, and the script writes the same ones', () => {
    expect(locales.sort()).toEqual(Object.keys(IOS_TO_PLAY).sort());
    const script = readFileSync(
      path.join(ROOT, 'scripts', 'appstore-metadata.py'),
      'utf8',
    );
    for (const [appStore, play] of Object.entries(IOS_TO_PLAY)) {
      expect(script).toContain(`"${appStore}": "${play}"`);
    }
  });

  it.each(Object.entries(IOS_TO_PLAY))(
    '%s is called what Play calls it',
    (appStore, play) => {
      const playTitle = readFileSync(
        path.join(ROOT, 'fastlane', 'metadata', 'android', play, 'title.txt'),
        'utf8',
      ).trim();
      expect(
        readFileSync(path.join(IOS, appStore, 'name.txt'), 'utf8').trim(),
      ).toBe(playTitle);
    },
  );

  it.each(
    locales.flatMap(l =>
      (Object.keys(IOS_LIMITS) as Array<keyof typeof IOS_LIMITS>).map(
        f => [l, f] as const,
      ),
    ),
  )('%s %s', (loc, f) => {
    const text = ios(loc, f);
    expect(text.length).toBeGreaterThan(5);
    expect({ loc, f, over: Math.max(0, text.length - IOS_LIMITS[f]) }).toEqual({
      loc,
      f,
      over: 0,
    });
  });

  it.each(locales)('%s keywords fit in 100 bytes, without spaces', loc => {
    // App Store Connect counts the keyword field in bytes, so an Arabic
    // letter costs two of the hundred.
    const k = ios(loc, 'keywords');
    expect(Buffer.byteLength(k, 'utf8')).toBeLessThanOrEqual(100);
    expect(k).not.toMatch(/,\s/);
  });

  it.each(locales)('%s names no other platform', loc => {
    // App Review guideline 2.3.10: no other mobile platform in the
    // metadata. And nothing Android-only, which would be a promise the
    // iPhone cannot keep.
    for (const f of [
      'description',
      'promotional_text',
      'subtitle',
      'keywords',
    ]) {
      expect(ios(loc, f)).not.toMatch(
        /Android|أندرويد|اینڈرائیڈ|Андроид|एंड्रॉ|অ্যান্ড্রয়েড|安卓|Google Play|F-Droid|Material You/i,
      );
    }
  });
});
