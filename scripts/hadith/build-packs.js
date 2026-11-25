#!/usr/bin/env node
/**
 * Builds the Hadith packs the app downloads, into build/hadith/v1/ — published
 * as release assets by scripts/hadith/upload-packs.sh, never committed.
 *
 *   node scripts/hadith/build-packs.js                       # everything
 *   node scripts/hadith/build-packs.js --langs en,ar          # HadeethEnc in two languages
 *   node scripts/hadith/build-packs.js --books bukhari,muslim
 *   node scripts/hadith/build-packs.js --no-books --no-henc   # manifest only
 *
 * WHERE EACH THING COMES FROM — the licensing is in "Open Hadith Data for
 * Mihrab" (docs/hadith/sources.md has the summary), and the rules below
 * follow it:
 *
 *   • HadeethEnc.com (hadeethenc.com/api/v1) — the translations, the
 *     simplified explanation, the takeaways, the grade and the topic tree.
 *     Free to republish UNMODIFIED, credited, with its version kept. So
 *     every field is copied as the API returns it: no trimming, no
 *     re-wording, no merging of fields. The retrieval date is the version
 *     the API offers, and it is written into every pack.
 *   • Open-Hadith-Data (github.com/mhashim6/Open-Hadith-Data) — seven of
 *     the nine canonical books in vowelled Arabic, ODbL 1.0 / DbCL 1.0.
 *     Only the matn column is taken (the second column is a commentary),
 *     the direction marks the editors put round narrators' names are
 *     removed, and the result is ODbL like its source (the release's
 *     NOTICE.txt).
 *   • fawazahmed0/hadith-api — the Arabic of an-Nawawi's Forty, a
 *     public-domain classical text, and its numbering; and, for the four
 *     Sunan and the Muwaṭṭaʾ, each hadith's GRADES: a grader's name and
 *     his verdict (book-grades.js). Never its English or any other
 *     translation: those are scraped from print editions that are still
 *     under copyright.
 *
 * Nothing scraped from sunnah.com, Dorar, OpenITI or a print translation
 * is ever read here.
 *
 * WHAT IS SERVED — the maintainer's rule (2026-11-25): no hadith that is
 * weak, disputed or ungraded.
 *
 *   • HadeethEnc: an entry whose Arabic grade today does not say it is
 *     sound, or says anywhere that it is weak, is left out of every
 *     language's pack (`servedGrade`). The ids go to
 *     src/hadith/withheld.json for the app.
 *   • al-Bukhārī and Muslim: whole, on the standing of the collections.
 *   • The four Sunan and the Muwaṭṭaʾ: only a hadith every grader who
 *     ruled on it calls ṣaḥīḥ or ḥasan (book-grades.js).
 *   • Musnad Aḥmad and Sunan ad-Dārimī: no pack. No open dataset grades
 *     them, and an ungraded book is not served.
 *
 * Every response is cached under scripts/hadith/.cache, so a run that is
 * stopped picks up where it was, and a second run costs nothing.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'build', 'hadith', 'v1');
const CACHE = path.join(__dirname, '.cache');
const HENC = 'https://hadeethenc.com/api/v1';
const OHD = 'https://raw.githubusercontent.com/mhashim6/Open-Hadith-Data/master';
const NAWAWI_AR = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.min.json';
const SETS = require('../../src/hadith/sets.json');
/** The one HadeethEnc pack a language has (`WHOLE_PACK` in src/hadith/catalog.ts). */
const WHOLE = 'all';

/** The app's thirteen languages; HadeethEnc uses the same codes. */
const APP_LANGS = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

/**
 * The books there is a pack of, as Open-Hadith-Data names their folders
 * and files. It has Musnad Aḥmad and Sunan ad-Dārimī as well; they are
 * not built (above).
 */
const BOOKS = {
  bukhari: { dir: 'Sahih_Al-Bukhari', file: 'sahih_al-bukhari_ahadith_mushakkala_mufassala' },
  muslim: { dir: 'Sahih_Muslim', file: 'sahih_muslim_ahadith_mushakkala_mufassala' },
  abudawud: { dir: 'Sunan_Abu-Dawud', file: 'sunan_abu-dawud_ahadith_mushakkala_mufassala' },
  tirmidhi: { dir: 'Sunan_Al-Tirmidhi', file: 'sunan_al-tirmidhi_ahadith_mushakkala_mufassala' },
  nasai: { dir: 'Sunan_Al-Nasai', file: 'sunan_al-nasai_ahadith_mushakkala_mufassala' },
  ibnmajah: { dir: 'Sunan_Ibn-Maja', file: 'sunan_ibn-maja_ahadith_mushakkala_mufassala' },
  malik: { dir: 'Maliks_Muwataa', file: 'maliks_muwataa_ahadith_mushakkala_mufassala' },
};
const { GRADED_BOOKS, gradesUrl, gradeBook } = require('./book-grades');
/** How a graded book's rows were chosen, as its pack says it. */
const BOOK_RULE = 'sound-by-all';

// ── Arguments ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = name => args.includes(`--${name}`);
const LANGS = (opt('langs') ?? APP_LANGS.join(',')).split(',');
const ONLY_BOOKS = opt('books')?.split(',');
const CONCURRENCY = Number(opt('concurrency') ?? 4);

// ── Fetching, politely, through the cache ──────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mihrab hadith pack builder (github.com/MihrabHQ/Mihrab)';

async function fetchText(url, { attempts = 4 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (i + 1 >= attempts) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}

function cachePath(key) {
  return path.join(CACHE, key.replace(/[^a-z0-9._-]+/gi, '_'));
}

/** A JSON response, kept on disk. `null` for a 404. */
async function cachedJson(key, url) {
  const file = cachePath(key);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const text = await fetchText(url);
  const value = text == null ? null : JSON.parse(text);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  await sleep(120);
  return value;
}

async function pool(items, worker, n = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
        done++;
        if (done % 100 === 0) process.stdout.write(`    ${done}/${items.length}\n`);
      }
    }),
  );
  return out;
}

// ── HadeethEnc ─────────────────────────────────────────────────────────

const hencCategories = lang =>
  cachedJson(`henc-cats-${lang}.json`, `${HENC}/categories/list/?language=${lang}`);

/** Every hadith in a category (and its children) in a language: [{id, title}]. */
async function hencList(lang, categoryId) {
  const out = [];
  for (let page = 1; ; page++) {
    const body = await cachedJson(
      `henc-list-${lang}-${categoryId}-${page}.json`,
      `${HENC}/hadeeths/list/?language=${lang}&category_id=${categoryId}&page=${page}&per_page=500`,
    );
    if (!body || !Array.isArray(body.data)) break;
    out.push(...body.data.map(d => ({ id: String(d.id), title: d.title })));
    if (Number(body.meta?.current_page) >= Number(body.meta?.last_page)) break;
  }
  return out;
}

/**
 * Is this entry reported in al-Bukhārī's Ṣaḥīḥ or in Muslim's — by
 * HadeethEnc's own Arabic attribution, which is written one way where the
 * translations write it a dozen ("Narrated by Bukhari", "Al-Bukhāri",
 * "Agreed upon"…)?
 *
 * Read strictly. The attribution OPENS with it ("متفق عليه", "رواه
 * البخاري", "رواه مسلم"), or it is a list of narrations and every line of
 * it says so ("الرواية الأولى: متفق عليها. الرواية الثانية: رواها مسلم").
 * "رواه أحمد، وأصله في صحيح مسلم" is neither; nor is a report al-Bukhārī
 * gives in another of his books ("رواه البخاري في الأدب المفرد"), in
 * Muslim's introduction ("رواه مسلم في مقدمته"), or without its chain
 * ("معلقًا", "تعليقًا"). An entry that misses the flag is still found by
 * every other search; one that wrongly had it would be a claim the app
 * makes about a hadith.
 *
 * The same rule as `reportedInSahihayn` in src/hadith/sahihayn.ts
 * (__tests__/hadithSahihayn.test.ts holds the two together).
 */
// sahihayn-rule:start
const SAHIHAYN_OPENS = /^(?:متفق عليه|رواه (?:البخاري|مسلم)(?! في))/;
const SAHIHAYN_LINE = /(?:متفق عليه|روا(?:ه|ها) (?:البخاري|مسلم))(?! في)/;
const NOT_SAHIHAYN = /معلق|تعليق/;
function reportedInSahihayn(attributionAr) {
  const a = String(attributionAr ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .trim();
  if (!a || NOT_SAHIHAYN.test(a)) return false;
  if (SAHIHAYN_OPENS.test(a)) return true;
  const lines = a
    .split(/[\n.]+/)
    .map(l => l.trim())
    .filter(Boolean);
  return lines.length > 1 && lines.every(l => SAHIHAYN_LINE.test(l));
}
// sahihayn-rule:end

/**
 * Which of two grades an entry carries outright — 1 ṣaḥīḥ, 2 ḥasan, 0
 * neither — by HadeethEnc's Arabic grade. The same rule as `gradeClass`
 * in src/hadith/grade.ts, which says why it is read strictly
 * (__tests__/hadithFirstUse.test.ts holds the two together).
 */
// grade-rule:start
const GRADE_RESERVED = /ضعيف|ضعف|موقوف|مدرج|ملحوظ|تنبيه|إسناد|سنده|رجال|نقل/;
const GRADE_RESERVING = ['إلا', 'دون', 'لكن', 'غير', 'سوى'];
const GRADE_HASAN = ['حسن', 'حسنه', 'حسنة', 'حسنان'];
const GRADE_SAHIH = ['صحيح', 'صحيحة', 'صحيحان', 'صححه'];
function gradeClass(gradeAr) {
  const g = String(gradeAr ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .trim();
  if (!g || GRADE_RESERVED.test(g)) return 0;
  const words = g.split(/[^\u0621-\u064A]+/).filter(Boolean);
  if (words.some(w => GRADE_RESERVING.includes(w))) return 0;
  if (words.some(w => GRADE_HASAN.includes(w))) return 2;
  return words.some(w => GRADE_SAHIH.includes(w)) ? 1 : 0;
}
// grade-rule:end

/**
 * The class a translated entry carries: the one its own Arabic grade and
 * the Arabic entry's grade TODAY both say, or none (`agreedGradeClass` in
 * src/hadith/grade.ts has why — a translation keeps the grade it was
 * translated with, and HadeethEnc has since revised some).
 */
function agreedGradeClass(gradeAr, currentAr) {
  const q = gradeClass(gradeAr);
  return q && gradeClass(currentAr) === q ? q : 0;
}

/**
 * Is an entry served at all — does HadeethEnc's Arabic grade say it is
 * sound, and nowhere that it is weak? The same rule as `servedGrade` in
 * src/hadith/grade.ts, which has what it is for
 * (__tests__/hadithBookGrades.test.ts holds the two together).
 */
// served-rule:start
const SERVED_WEAK = /ضعيف|ضعف|موضوع|منكر|باطل|شاذ|لا يصح|لم يصح|لا يثبت|لم يثبت|غير صحيح|ليس بصحيح|لا اصل/;
const SERVED_SOUND = /صحيح|حسن|صحح/;
function servedGrade(gradeAr) {
  const g = String(gradeAr ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا');
  return SERVED_SOUND.test(g) && !SERVED_WEAK.test(g);
}
// served-rule:end

const hencOne = (lang, id) =>
  cachedJson(`henc-one-${lang}-${id}.json`, `${HENC}/hadeeths/one/?language=${lang}&id=${id}`);

/**
 * One entry as the pack keeps it. Every value is HadeethEnc's own, as
 * sent; only the keys are shortened. `ar` (the Arabic matn) rides in every
 * language's pack so the reader needs one file per language.
 *
 * `s` and `q` are the two keys that are ours and not HadeethEnc's: `s` is 1
 * where its Arabic attribution says al-Bukhārī or Muslim
 * (`reportedInSahihayn`), `q` is 1 or 2 where its Arabic grade is ṣaḥīḥ
 * or ḥasan outright (`gradeClass`), so the search can keep to those in
 * any language. They add to an entry and change nothing in it.
 */
function packEntry(lang, d, currentGradeAr) {
  const e = {
    id: String(d.id),
    t: d.title,
    h: d.hadeeth,
    a: d.attribution,
    g: d.grade,
    e: d.explanation,
    x: Array.isArray(d.hints) ? d.hints : [],
    c: (d.categories ?? []).map(String),
  };
  if (lang === 'ar') {
    if (Array.isArray(d.words_meanings) && d.words_meanings.length) e.w = d.words_meanings;
  } else {
    e.ar = d.hadeeth_ar;
    if (Array.isArray(d.words_meanings) && d.words_meanings.length) e.w = d.words_meanings;
  }
  if (d.reference) e.r = d.reference;
  if (reportedInSahihayn(lang === 'ar' ? d.attribution : d.attribution_ar)) e.s = 1;
  const q = lang === 'ar' ? gradeClass(d.grade) : agreedGradeClass(d.grade_ar, currentGradeAr);
  if (q) e.q = q;
  return e;
}

// ── Arabic, for matching an-Nawawi's Forty to HadeethEnc ───────────────

const { foldArabic, mismatches, MIN_OVERLAP } = require('./nawawi-check');

/**
 * Which HadeethEnc entry each of the Forty is. A HadeethEnc Arabic title
 * is the hadith's own opening words, so a long run of a title's words
 * inside the Forty's text names the entry: six words or more, because the
 * Forty are short and four common words would match half the
 * encyclopedia. A title shorter than that ("لا تغضب") counts only whole,
 * and only when nothing longer matched.
 *
 * The encyclopedia sometimes holds one hadith twice — once as an
 * Arabic-only study entry — so among the strong matches the one
 * translated into the most languages wins. `translationsOf` reads that
 * from the cached Arabic entry.
 */
async function matchNawawi(nawawi, titles, translationsOf) {
  const folded = titles.map(t => ({ id: t.id, words: foldArabic(t.title).split(' ').filter(Boolean) }));
  const out = [];
  for (const h of nawawi) {
    const text = ` ${foldArabic(h.text)} `;
    const long = [];
    const short = [];
    for (const t of folded) {
      if (t.words.length >= 6) {
        // The title's whole opening, or no match: a part of it is usually
        // the narrator's chain ("عن أبي هريرة رضي الله عنه أن رسول الله…"),
        // which half the Forty share.
        const n = Math.min(t.words.length, 14);
        if (text.includes(` ${t.words.slice(0, n).join(' ')} `)) long.push({ id: t.id, n });
      } else if (t.words.length >= 2 && text.includes(` ${t.words.join(' ')} `)) {
        short.push({ id: t.id, n: t.words.length });
      }
    }
    const pool = long.length ? long : short;
    const top = Math.max(0, ...pool.map(c => c.n));
    const strong = pool.filter(c => c.n >= Math.min(top, 8));
    let best = null;
    for (const c of strong) {
      const langs = (await translationsOf(c.id)).length;
      if (!best || langs > best.langs || (langs === best.langs && c.n > best.n)) best = { ...c, langs };
    }
    // Read by a person, against the English, where the wording differs
    // from the title by a word ("إن الله تعالى فرض…" against "إن الله فرض…").
    // A person's reading wins over the matcher's.
    const reviewed = SETS.nawawiReviewed[String(h.hadithnumber)];
    out.push({ n: h.hadithnumber, henc: reviewed ?? (best ? best.id : null) });
  }
  return out;
}

// ── Open-Hadith-Data ───────────────────────────────────────────────────

/** RFC 4180, the whole file: rows of fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The editors' direction marks out, their double spaces single. */
function cleanMatn(s) {
  return s.replace(/[\u200E\u200F]/g, '').replace(/\s+/g, ' ').trim();
}

async function buildBook(id) {
  const { dir, file } = BOOKS[id];
  const cached = cachePath(`ohd-${id}.csv`);
  let text;
  if (fs.existsSync(cached)) text = fs.readFileSync(cached, 'utf8');
  else {
    text = await fetchText(`${OHD}/${dir}/${file}.utf8.csv`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cached, text);
  }
  const hadiths = [];
  for (const row of parseCsv(text)) {
    if (row.length < 2) continue;
    const n = Number(row[0]);
    const matn = cleanMatn(row[1]);
    if (!matn) continue;
    // Some Sunan rows carry no number where the editors could not map one.
    hadiths.push([Number.isFinite(n) && n > 0 ? n : null, matn]);
  }
  return hadiths;
}

// ── Writing ────────────────────────────────────────────────────────────

function write(rel, value) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(value);
  fs.writeFileSync(file, json);
  return Buffer.byteLength(json);
}

/**
 * What each pack IS, written from the files themselves: its size and its
 * SHA-256. The app compares the SHA-256 with the pack on the device and
 * fetches ours again when they differ (src/hadith/packUpdates.ts) — it is
 * how a correction reaches a pack downloaded before it. From the files and
 * not from this run's writes, so `--no-books --no-henc` (the manifest
 * alone) names every pack in the tree, not only the ones just rebuilt.
 */
function fingerprint(manifest) {
  const stamp = (rel, entry) => {
    const file = path.join(OUT, rel);
    if (!entry || !fs.existsSync(file)) return;
    const bytes = fs.readFileSync(file);
    entry.bytes = bytes.length;
    entry.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  };
  for (const [pack, v] of Object.entries(manifest.henc)) {
    for (const [lang, entry] of Object.entries(v.langs)) stamp(`henc/${pack}/${lang}.json`, entry);
  }
  for (const [lang, entry] of Object.entries(manifest.categories)) stamp(`categories/${lang}.json`, entry);
  for (const [id, entry] of Object.entries(manifest.books)) stamp(`books/${id}.json`, entry);
  stamp('nawawi/ar.json', manifest.nawawi);
}

function readManifest() {
  const file = path.join(OUT, 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const old = readManifest();
  const manifest = {
    v: 1,
    sources: {
      hadeethenc: {
        name: 'HadeethEnc.com — Encyclopedia of Translated Prophetic Hadiths',
        url: 'https://hadeethenc.com',
        terms: 'Republished unmodified with permission; credit HadeethEnc.com.',
      },
      openHadithData: {
        name: 'Open-Hadith-Data',
        url: 'https://github.com/mhashim6/Open-Hadith-Data',
        license: 'ODbL-1.0 (database), DbCL-1.0 (contents)',
      },
      nawawiArabic: {
        name: 'Forty Hadith of an-Nawawi (Arabic), via fawazahmed0/hadith-api',
        url: 'https://github.com/fawazahmed0/hadith-api',
        license: 'Public-domain classical text; Arabic only.',
      },
      bookGrades: {
        name: "The graders' verdicts on the four Sunan and the Muwatta, as recorded in fawazahmed0/hadith-api",
        url: 'https://github.com/fawazahmed0/hadith-api',
        rule: 'A hadith is in its pack only when every grader who ruled on it calls it sahih or hasan.',
      },
    },
    henc: old?.henc ?? {},
    books: old?.books ?? {},
    nawawi: old?.nawawi ?? null,
    categories: old?.categories ?? {},
  };

  if (!has('no-henc')) {
    console.log('categories');
    for (const lang of LANGS) {
      const cats = await hencCategories(lang);
      if (!Array.isArray(cats)) continue;
      const items = cats.map(c => [String(c.id), c.parent_id == null ? null : String(c.parent_id), c.title, Number(c.hadeeths_count)]);
      const bytes = write(`categories/${lang}.json`, { lang, retrieved: today, items });
      manifest.categories[lang] = { retrieved: today, bytes };
    }

    console.log("an-Nawawi's Forty");
    const nawawi = (await cachedJson('nawawi-ar.json', NAWAWI_AR)).hadiths;
    const titles = [];
    for (const root of ['1', '2', '3', '4', '5', '6', '7']) titles.push(...(await hencList('ar', root)));
    const cross = await matchNawawi(nawawi, titles, async id => (await hencOne('ar', id))?.translations ?? []);
    // Every match read again, whole (nawawi-check.js): an entry that only
    // opens like an-Nawawi's hadith is another narration, not his.
    const arabic = new Map();
    for (const c of cross) if (c.henc) arabic.set(c.henc, (await hencOne('ar', c.henc))?.hadeeth ?? '');
    const wrong = mismatches(cross, nawawi, id => arabic.get(id));
    if (wrong.length) {
      for (const w of wrong) console.error(`  an-Nawawi ${w.n} → HadeethEnc ${w.henc}: only ${w.overlap.toFixed(2)} of its words (needs ${MIN_OVERLAP})`);
      throw new Error("an-Nawawi's Forty: a HadeethEnc entry is not the same hadith. Fix nawawiReviewed in src/hadith/sets.json.");
    }
    const nBytes = write('nawawi/ar.json', {
      source: 'fawazahmed0/hadith-api (ara-nawawi), Arabic only',
      retrieved: today,
      hadiths: nawawi.map(h => [h.hadithnumber, h.text]),
    });
    manifest.nawawi = { bytes: nBytes, count: nawawi.length };
    write('sets/nawawi40.json', cross);
    // The app keeps its own copy: it is the Forty's order, and how a
    // browser fetches them from HadeethEnc one by one (src/hadith/origin.ts).
    fs.writeFileSync(path.join(ROOT, 'src', 'hadith', 'nawawi40.json'), `${JSON.stringify(cross, null, 1)}\n`);
    // What the check above read, kept for jest: the two Arabic texts of
    // each number, so the suite holds the crosswalk without the network
    // (__tests__/hadithNawawiCrosswalk.test.ts).
    fs.writeFileSync(
      path.join(ROOT, '__tests__', 'fixtures', 'hadithNawawi.json'),
      `${JSON.stringify(
        {
          note: "an-Nawawi's Forty beside the HadeethEnc entry each is shown as. Written by scripts/hadith/build-packs.js; do not edit.",
          sources: {
            nawawi: 'fawazahmed0/hadith-api, ara-nawawi (the classical text, Arabic)',
            henc: 'HadeethEnc.com, Arabic entries, unmodified',
          },
          rows: cross.map(c => ({
            n: c.n,
            henc: c.henc,
            nawawi: nawawi.find(h => h.hadithnumber === c.n)?.text ?? '',
            hencArabic: c.henc ? arabic.get(c.henc) ?? '' : '',
          })),
        },
        null,
        1,
      )}\n`,
    );
    console.log(`  ${cross.filter(c => c.henc).length}/${cross.length} matched to HadeethEnc`);

    // ONE pack a language: every entry under the seven topics, in the order
    // Browse shows the topics and HadeethEnc lists each. It was eight (a
    // starter set and a pack a topic), and every tile in Browse was its own
    // download; a browser, which keeps nothing, still builds small ones
    // from HadeethEnc itself (src/hadith/origin.ts). Which entries: from the
    // Arabic lists (every entry has Arabic; a translation may be missing,
    // and is then skipped).
    const ids = [];
    const seen = new Set();
    for (const root of SETS.roots) {
      for (const e of await hencList('ar', root)) {
        if (!seen.has(e.id)) (seen.add(e.id), ids.push(e.id));
      }
    }
    for (const c of cross) if (c.henc && !seen.has(c.henc)) (seen.add(c.henc), ids.push(c.henc));

    console.log(`pack ${WHOLE}: ${ids.length} entries`);
    const arEntries = await pool(ids, id => hencOne('ar', id));
    const translated = new Map(ids.map((id, i) => [id, arEntries[i]?.translations ?? []]));
    /** The Arabic entry's grade as it stands: a translation's class must agree with it. */
    const gradeNow = new Map(arEntries.filter(Boolean).map(d => [String(d.id), d.grade]));
    // What is not served, in any language: by the Arabic entry's grade today.
    const withheld = arEntries
      .filter(d => d && d.id && d.hadeeth && !servedGrade(d.grade))
      .map(d => String(d.id))
      .sort((a, b) => Number(a) - Number(b));
    const isWithheld = new Set(withheld);
    for (const id of withheld) console.log(`  not served: ${id} — ${String(gradeNow.get(id)).replace(/\s+/g, ' ').slice(0, 80)}`);
    for (const set of SETS.sets) {
      const lost = (set.ids ?? []).filter(id => isWithheld.has(id));
      if (lost.length) throw new Error(`set ${set.id} holds entries that are not served: ${lost.join(', ')}. Take them out of src/hadith/sets.json.`);
    }
    const lostForty = cross.filter(c => c.henc && isWithheld.has(c.henc));
    if (lostForty.length) throw new Error(`an-Nawawi's Forty: HadeethEnc does not grade ${lostForty.map(c => c.n).join(', ')} sound.`);
    // The app's copy: a pack rebuilt on the device from a translation has
    // not got the Arabic entry to ask (src/hadith/grade.ts).
    fs.writeFileSync(
      path.join(ROOT, 'src', 'hadith', 'withheld.json'),
      `${JSON.stringify(
        {
          note: 'HadeethEnc entries its Arabic grade does not call sound, and so not served. Written by scripts/hadith/build-packs.js; do not edit.',
          asOf: today,
          henc: withheld,
        },
        null,
        1,
      )}\n`,
    );
    // The packs this replaced are not carried on: out of the manifest, out of the tree.
    for (const pack of Object.keys(manifest.henc)) {
      if (pack === WHOLE) continue;
      delete manifest.henc[pack];
      fs.rmSync(path.join(OUT, 'henc', pack), { recursive: true, force: true });
    }
    manifest.henc[WHOLE] = manifest.henc[WHOLE] ?? { langs: {} };
    for (const lang of LANGS) {
      const want = lang === 'ar' ? ids : ids.filter(id => translated.get(id).includes(lang));
      console.log(`  ${lang}: ${want.length}`);
      const raw = lang === 'ar' ? arEntries.filter(Boolean) : (await pool(want, id => hencOne(lang, id))).filter(Boolean);
      const entries = raw
        .filter(d => d && d.id && d.hadeeth && !isWithheld.has(String(d.id)))
        .map(d => packEntry(lang, d, gradeNow.get(String(d.id))));
      if (lang !== 'ar') {
        const moved = raw.filter(d => d && gradeClass(d.grade_ar) !== gradeClass(gradeNow.get(String(d.id))));
        if (moved.length) console.log(`    graded otherwise in the Arabic today, left out of the grade filter: ${moved.map(d => d.id).join(', ')}`);
      }
      const bytes = write(`henc/${WHOLE}/${lang}.json`, {
        pack: WHOLE,
        lang,
        source: 'HadeethEnc.com',
        retrieved: today,
        entries,
      });
      manifest.henc[WHOLE].langs[lang] = { count: entries.length, bytes, retrieved: today };
    }
  }

  // A book that is no longer built is not carried on: out of the manifest, out of the tree.
  for (const id of Object.keys(manifest.books)) {
    if (BOOKS[id]) continue;
    delete manifest.books[id];
    fs.rmSync(path.join(OUT, 'books', `${id}.json`), { force: true });
  }

  if (!has('no-books')) {
    for (const id of Object.keys(BOOKS)) {
      if (ONLY_BOOKS && !ONLY_BOOKS.includes(id)) continue;
      console.log(`book ${id}`);
      const hadiths = await buildBook(id);
      const file = { book: id, source: 'Open-Hadith-Data', license: 'ODbL-1.0', retrieved: today, hadiths };
      const entry = { count: hadiths.length, retrieved: today };
      if (GRADED_BOOKS[id]) {
        const api = await cachedJson(`hadith-api-${GRADED_BOOKS[id]}.json`, gradesUrl(id));
        if (!api || !Array.isArray(api.hadiths)) throw new Error(`${id}: no grades from ${gradesUrl(id)}`);
        const graded = gradeBook(hadiths, api.hadiths);
        file.hadiths = graded.rows;
        file.grades = { source: 'fawazahmed0/hadith-api', rule: BOOK_RULE, graders: graded.graders };
        file.of = graded.of;
        Object.assign(entry, { count: graded.rows.length, of: graded.of, left: graded.left });
        console.log(`  ${graded.rows.length} of ${graded.of} served; left out: ${JSON.stringify(graded.left)}`);
      }
      entry.bytes = write(`books/${id}.json`, file);
      manifest.books[id] = entry;
    }
  }

  fingerprint(manifest);
  write('manifest.json', manifest);
  console.log('done');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
