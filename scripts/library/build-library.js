#!/usr/bin/env node
/**
 * The Library's books: one pack a book, its author's text in his order.
 *
 *   node scripts/library/build-library.js                 # every book → build/hadith/v1/library/<id>.json
 *   node scripts/library/build-library.js maqamat kalila  # these
 *
 * A book here is a classical work whose author died long enough ago that
 * the work is in the public domain everywhere the app ships, read from an
 * edition that may be republished: Arabic Wikisource (CC BY-SA 4.0). The
 * pack says where its text is from and under what licence, and the app
 * shows that on the book's page.
 *
 * ── WHAT A BOOK IS NOT ─────────────────────────────────────────────────
 *
 * It is not hadith served by the app's rule (docs/hadith-policy.md §6,
 * "The Library"): a book is its author's text, whole, and whatever he
 * quotes he quotes on his own authority. Nothing in it is graded here,
 * nothing is taken out of it, and nothing of it is shown anywhere but
 * inside the book.
 *
 * ── WHOLE OR NOT AT ALL ────────────────────────────────────────────────
 *
 * Wikitext is markup, and a template this file does not know could hold
 * the author's words. So every template and tag is either one named below
 * with what becomes of it, or the build stops and names it: a chapter is
 * never written with a piece silently missing. A chapter the book's own
 * contents page lists and the fetch did not bring stops the build too.
 *
 * ── THE PACKS ──────────────────────────────────────────────────────────
 *
 * They live with the Hadith packs (build/hadith/v1, the release
 * `data-hadith-v1`, the device's hadith/v1 folder) under `library/`, and
 * are named in the same manifest under `library` — the one downloader,
 * the one check of what arrived against its SHA-256. This file adds or
 * replaces its own entries in that manifest and touches no other.
 * `scripts/hadith/upload-packs.sh` publishes them; nothing here does.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'build', 'hadith', 'v1');
const CACHE = path.join(__dirname, '.cache');
const WIKISOURCE = 'https://ar.wikisource.org/w/api.php';
const SOURCE = { name: 'Arabic Wikisource', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
/**
 * The OpenITI corpus (github.com/OpenITI): transcriptions of classical
 * texts in its own plain markup, released under CC BY-NC-SA 4.0 — it may
 * be republished with credit, not sold, and under the same terms. The
 * maintainer accepted that licence for the Library on 2026-11-26; a pack
 * built from it says so, and the app is free.
 */
const OPENITI = { name: 'OpenITI', license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' };

/** al-Hamadhānī's maqāmāt in the order of Muḥammad ʿAbduh's edition, by the name each page has. */
const MAQAMAT = [
  'القريضية', 'الأزاذية', 'البلخية', 'السجستانية', 'الكوفية', 'الأسدية', 'الغيلانية', 'الأذربيجانية', 'الجرجانية', 'الأصفهانية',
  'الأهوازية', 'البغدادية', 'البصرية', 'الفزارية', 'الجاحظية', 'المكفوفية', 'البخارية', 'القزوينية', 'الساسانية', 'القردية',
  'الموصلية', 'المضيرية', 'الحرزية', 'المارستانية', 'المجاعية', 'الوعظية', 'الأسودية', 'العراقية', 'الحمدانية', 'الرصافية',
  'المغزلية', 'الشيرازية', 'الحلوانية', 'النهيدية', 'الإبليسية', 'الأرمنية', 'الناجمية', 'الخلفية', 'النيسابورية', 'العلمية',
  'الوصية', 'الصيمرية', 'الدينارية', 'الشعرية', 'الملوكية', 'الصفرية', 'السارية', 'التميمية', 'الخمرية', 'المطلبية', 'البشرية',
];

const BOOKS = {
  kalila: {
    title: 'كليلة ودمنة',
    author: 'عبد الله بن المقفع',
    died: '142 هـ',
    prefix: 'كليلة ودمنة',
    cache: 'wikisource-kalila.json',
    /** The chapters, in order: the links of the book's own contents page. */
    chapters: pages => linksOf(pages['كليلة ودمنة'].text, 'كليلة ودمنة').map(l => ({ page: l.page, title: l.label })),
  },
  maqamat: {
    title: 'مقامات بديع الزمان الهمذاني',
    author: 'بديع الزمان الهمذاني',
    died: '398 هـ',
    prefix: 'مقامات بديع الزمان الهمذاني',
    cache: 'wikisource-maqamat.json',
    chapters: pages => {
      const have = Object.keys(pages).filter(k => k.startsWith('مقامات بديع الزمان الهمذاني/المقامة '));
      const named = MAQAMAT.map(n => `مقامات بديع الزمان الهمذاني/المقامة ${n}`);
      const extra = have.filter(k => !named.includes(k));
      // One the edition's order does not name is not dropped: the build says so and stops.
      if (extra.length) throw new Error(`maqamat: pages the order does not name: ${extra.join('، ')}`);
      return named.map(page => ({ page, title: page.split('/')[1] }));
    },
  },
  ighatha: {
    title: 'إغاثة اللهفان من مصائد الشيطان',
    author: 'ابن قيّم الجوزية',
    died: '751 هـ',
    prefix: 'إغاثة اللهفان',
    ownHeadings: true,
    cache: 'wikisource-ighatha.json',
    chapters: pages => {
      const contents = pages['إغاثة اللهفان'].text;
      const out = [];
      for (const l of linksOf(contents, 'إغاثة اللهفان')) {
        // The thirteenth chapter runs over thirty-four pages, numbered after its own.
        const part = /^الباب الثالث عشر\/(\d+)$/.exec(l.page.split('إغاثة اللهفان/')[1]);
        out.push({ page: l.page, title: part ? `الباب الثالث عشر (${part[1]})` : l.label });
      }
      return out;
    },
  },
  dawa: {
    title: 'الداء والدواء',
    author: 'ابن قيّم الجوزية',
    died: '751 هـ',
    openiti: '0775AH/data/0751IbnQayyimJawziyya/0751IbnQayyimJawziyya.DaWaDawa/0751IbnQayyimJawziyya.DaWaDawa.Shamela0000158-ara1',
    cache: 'openiti-dawa.txt',
    read: '2026-11-26',
  },
  bahja: {
    title: 'بهجة المجالس وأنس المجالس',
    author: 'ابن عبد البر',
    died: '463 هـ',
    openiti: '0475AH/data/0463IbnCabdBarr/0463IbnCabdBarr.BahjatMajalis/0463IbnCabdBarr.BahjatMajalis.Shamela0000558-ara1',
    cache: 'openiti-bahja.txt',
    read: '2026-11-26',
  },
  // Ibn Rajab's commentary on the Forty and the eight he added: his preface,
  // then a chapter a hadith, so chapter N is the commentary on hadith N
  // (`explains` in libraryBooks.json). The file carries none of the printed
  // edition's notes.
  jami: {
    title: 'جامع العلوم والحكم',
    author: 'ابن رجب الحنبلي',
    died: '795 هـ',
    openiti: '0800AH/data/0795IbnRajabHanbali/0795IbnRajabHanbali.JamicCulumWaHikam/0795IbnRajabHanbali.JamicCulumWaHikam.Shamela0004268-ara1',
    cache: 'openiti-jami.txt',
    read: '2026-11-26',
    // The transcription's own marks round each hadith commented on: not the author's.
    debris: /<span class="matn(?:-hr)?">|<\/span>/g,
  },
  iqd: {
    title: 'العقد الفريد',
    author: 'ابن عبد ربه الأندلسي',
    died: '328 هـ',
    openiti: '0350AH/data/0328IbnCabdRabbih/0328IbnCabdRabbih.CiqdFarid/0328IbnCabdRabbih.CiqdFarid.Shamela0023789-ara1.completed',
    cache: 'openiti-iqd.txt',
    read: '2026-11-26',
    // Twenty-five books, each of many sections: a section is a chapter and
    // its book is the part it is listed under.
    parts: true,
    // Lines the file has wrong, each written out so that nothing else is
    // touched. Two lost their mark. The eighteenth book carries the eighth
    // book's heading; its own name is in the line under it ("فرش كتاب
    // الزمردة الثانية في فضائل الشعر") and in the author's list of his books.
    mend: {
      'احذر الموتور ولا تطمئن إليه، وكن أشد ما تكون حذرا منه': '~~احذر الموتور ولا تطمئن إليه، وكن أشد ما تكون حذرا منه',
      ' ~~أبوك وعمك نعاقين «1» في فتنة ابن الأشعث. فقلت: يا أمير المؤمنين، إن مثلك': '~~أبوك وعمك نعاقين «1» في فتنة ابن الأشعث. فقلت: يا أمير المؤمنين، إن مثلك',
      // Two book headings the transcription misspelt, put as the author's own
      // list of his books in the preface has them (maintainer's decision, 2026-11-26).
      '### | كتاب السدرة في النوادي والتعاذي والمراثي': '### | كتاب الدرة في التعازي والمراثي',
      '### | كتاب اللؤلوءة الثانية في الفكاهات والملح': '### | كتاب اللؤلؤة الثانية في الفكاهات والملح',
    },
    volumes: /^# الجزء \S+\s*$/,
    editors: 7,
    mendAt: { '### | كتاب الزمردة في المواعظ والزهد': [null, '### | كتاب الزمردة الثانية في فضائل الشعر'] },
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(WIKISOURCE, {
      method: 'POST',
      headers: { 'User-Agent': 'MihrabHadithPacks/1.0 (github.com/MihrabHQ/Mihrab)' },
      body: new URLSearchParams({ format: 'json', ...params }),
    });
    if (res.ok) return res.json();
    await sleep(30_000 * (attempt + 1));
  }
  throw new Error(`${WIKISOURCE} would not answer`);
}

/** Every page under a title, as it stood when read: `{ title: { rev, ts, text } }`. Cached. */
async function wikisource(prefix, cache) {
  const file = path.join(CACHE, cache);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const titles = [];
  let cont = {};
  for (;;) {
    const d = await api({ action: 'query', list: 'allpages', apprefix: prefix, aplimit: '500', ...cont });
    titles.push(...d.query.allpages.map(p => p.title));
    if (!d.continue) break;
    cont = d.continue;
    await sleep(3000);
  }
  const out = {};
  for (let i = 0; i < titles.length; i += 25) {
    const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main', titles: titles.slice(i, i + 25).join('|') });
    for (const p of Object.values(d.query.pages)) {
      const r = p.revisions[0];
      out[p.title] = { rev: r.revid, ts: r.timestamp, text: r.slots.main['*'] };
    }
    await sleep(4000);
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

/** The links of a contents page to the book's own pages, in order, each once: `[{ page, label }]`. */
function linksOf(text, book) {
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(/\[\[([^|\]]+)\|([^\]]+)\]\]/g)) {
    const target = m[1].trim();
    const page = target.startsWith('/') ? `${book}${target}` : target;
    if (!page.startsWith(`${book}/`) || seen.has(page)) continue;
    seen.add(page);
    out.push({ page, label: m[2].trim() });
  }
  return out;
}

// ── Wikitext to the author's text ──────────────────────────────────────

/** Templates that are the page's furniture and hold none of the book: taken out whole. */
const FURNITURE = /^(?:ترويسة|رأسية|مطبوعة|ويكيبيديا|AuxTOC|حواشي|نثر|تصفحية|هامش|مقامات_الهمذاني|إغاثة اللهفان|SUBPAGENAME)$/;
/** Templates that stand for words: what they stand for. */
const WORDS = { صل: 'ﷺ', صلى: 'ﷺ', صلل: 'ﷺ', 'صل.': 'ﷺ.', بسملة: 'بسم الله الرحمن الرحيم' };
const VERSE_OPEN = '\u0001';
const VERSE_CLOSE = '\u0002';

/**
 * One page's wikitext as blocks: a paragraph (a string), a heading
 * (`{ h }`) or lines of verse (`{ v: [...] }`, a line's two halves
 * joined by `HALVES`). Throws on markup it does not know.
 */
// Two em spaces: wide enough to read as the gap of a line of verse, and not a run of spaces the cleaning below would close.
const HALVES = '\u2003\u2003';
function blocksOf(wikitext, where) {
  let t = wikitext.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/__[^_\s]+__/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  // Innermost templates first, until none is left.
  for (let guard = 0; guard < 50 && /\{\{/.test(t); guard++) {
    const before = t;
    t = t.replace(/\{\{([^{}]*)\}\}/g, (whole, body) => {
      const bar = body.indexOf('|');
      const name = (bar < 0 ? body : body.slice(0, bar)).trim();
      const rest = bar < 0 ? '' : body.slice(bar + 1);
      if (name in WORDS) return ` ${WORDS[name]} `;
      if (name === 'قرآن') return ` ﴿${rest.trim()}﴾ `;
      if (name === 'أبيات') {
        const lines = rest
          .split('|')
          .map(l => l.replace(/\n/g, ' ').trim())
          .filter(Boolean)
          .map(l => l.split('\\\\').map(h => h.trim()).filter(Boolean).join(HALVES));
        return `\n\n${VERSE_OPEN}${lines.join('\n')}${VERSE_CLOSE}\n\n`;
      }
      if (FURNITURE.test(name)) return '';
      throw new Error(`${where}: a template this file does not know: {{${name}}}`);
    });
    if (t === before) break;
  }
  if (/\{\{|\}\}/.test(t)) throw new Error(`${where}: an unclosed template`);
  t = t
    .replace(/<\/?div[^>]*>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?(?:center|big|small|poem|span)[^>]*>/g, '')
    .replace(/\[\[(?:تصنيف|Category):[^\]]*\]\]/g, '')
    .replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/[ \t]+/g, ' ');
  const tag = /<[a-zA-Z/][^>]*>/.exec(t);
  if (tag) throw new Error(`${where}: a tag this file does not know: ${tag[0]}`);

  const blocks = [];
  for (const raw of t.split(/\n\s*\n/)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith(VERSE_OPEN)) {
      const v = part.replace(VERSE_OPEN, '').replace(VERSE_CLOSE, '').split('\n').map(l => l.trim()).filter(Boolean);
      if (v.length) blocks.push({ v });
      continue;
    }
    // A line is a paragraph: these pages were typed a paragraph a line,
    // and run together they are ten thousand characters without a break.
    for (const line of part.split('\n')) {
      const h = /^=+\s*(.*?)\s*=+$/.exec(line.trim());
      if (h) {
        if (h[1]) blocks.push({ h: h[1] });
        continue;
      }
      const s = line.replace(/^[*#:;]+\s*/, '').replace(/\s+/g, ' ').trim();
      if (s) blocks.push(s);
    }
  }
  for (const b of blocks) {
    const s = typeof b === 'string' ? b : b.h ?? b.v.join(' ');
    // A single brace or bracket is the edition's own: it sets a verse in { } and its reference in [ ].
    if (/\{\{|\}\}|[\u0001\u0002]|\[\[|\]\]/.test(s)) throw new Error(`${where}: markup left in the text: ${s.slice(0, 80)}`);
  }
  return blocks.filter(b => typeof b !== 'string' || b.length > 0);
}

// ── OpenITI's markup to the author's text ──────────────────────────────

/** A book's file from the OpenITI corpus, as it stood when read. Cached. */
async function openiti(repoPath, cache) {
  const file = path.join(CACHE, cache);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const res = await fetch(`https://raw.githubusercontent.com/OpenITI/${repoPath.replace('/data/', '/master/data/')}`);
  if (!res.ok) throw new Error(`${repoPath}: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/**
 * OpenITI's file as chapters: `[{ t, b }]`.
 *
 * Its markup is a line's first characters: `### |` a heading, `# ` a
 * paragraph, `~~` the same paragraph going on; `PageV01P007` and `ms012`
 * mark the printed page and a counting unit and are not the text. A
 * chapter is a heading and what follows it. A heading with nothing under
 * it runs into the next one: where that begins with "و" it is the rest of
 * a title set on two lines ("باب في اجتناب اللحن" / "وذم الغريب في
 * الخطاب"); otherwise it is a line of the chapter (the basmala under
 * "مقدمة المؤلف"). A line of verse is two halves with " ... " between
 * them; lines of verse one after another are one block.
 *
 * A leading "؟" is the conversion's mark for something it could not read
 * in the margin, not a word of the author's, and is taken off the start
 * of a line. Throws on a line it does not know.
 */
function openitiChapters(text, where) {
  const start = text.indexOf('#META#Header#End#');
  if (start < 0) throw new Error(`${where}: not an OpenITI file`);
  const clean = s => s.replace(/PageV\d+P\d+|ms\d+/g, ' ').replace(/\s+/g, ' ').replace(/^(?:؟+\s*)+/, '').trim();
  const chapters = [];
  let para = null;
  const flush = () => {
    if (para == null) return;
    const s = clean(para);
    para = null;
    if (!s) return;
    if (!chapters.length) chapters.push({ t: '', b: [] });
    const b = chapters[chapters.length - 1].b;
    const halves = s.split(' ... ');
    if (halves.length === 2 && s.length < 160) {
      const line = halves.map(h => h.trim()).join(HALVES);
      const last = b[b.length - 1];
      if (last && typeof last === 'object' && last.v) last.v.push(line);
      else b.push({ v: [line] });
    } else b.push(s);
  };
  for (const line of text.slice(start).split('\n').slice(1)) {
    if (!line.trim()) continue;
    if (line.startsWith('~~')) {
      if (para == null) throw new Error(`${where}: a line going on from nothing: ${line.slice(0, 60)}`);
      para += ` ${line.slice(2)}`;
      continue;
    }
    flush();
    const h = /^### \|+ ?(.*)$/.exec(line);
    if (h) {
      const title = clean(h[1]).replace(/^\[(.*)\]$/, '$1').trim();
      const prev = chapters[chapters.length - 1];
      if (prev && !prev.b.length && prev.t) {
        if (title.startsWith('و')) prev.t = `${prev.t} ${title}`;
        else if (title) prev.b.push(title);
      } else if (title) chapters.push({ t: title, b: [] });
      continue;
    }
    if (line.startsWith('# ')) {
      para = line.slice(2);
      continue;
    }
    throw new Error(`${where}: a line this file does not know: ${line.slice(0, 60)}`);
  }
  flush();
  for (const c of chapters) {
    if (!c.t) throw new Error(`${where}: text before the first heading`);
    if (!c.b.length) throw new Error(`${where}: "${c.t}" has no text`);
    for (const b of c.b) {
      const s = typeof b === 'string' ? b : b.v.join(' ');
      if (/#|~~|PageV|\bms\d|@[A-Z]|%~%|<\/?[a-z]/.test(s)) throw new Error(`${where}: markup left in the text: ${s.slice(0, 80)}`);
    }
  }
  return chapters;
}

/**
 * OpenITI's file as chapters under parts: `[{ t, p, b }]`, for a book of
 * books (`parts: true`).
 *
 * A first-level heading names a part; a second-level one begins a chapter
 * in it; anything deeper is a heading inside the chapter (`{ h }`). Text
 * straight under a part (the author's preface) is a chapter of the part's
 * own name. Beyond what `openitiChapters` takes off:
 *
 * - `«12»` points at a note of the printed edition's editor. The notes are
 *   not in the file and are not the author's; the marks go.
 * - `</span>` is the conversion's debris.
 * - `### |EDITOR|` opens what the printer wrote at a volume's end; it is
 *   left out up to the next heading, and `editors` says how many to expect.
 * - `volumes` matches the printed edition's volume on a line of its own
 *   ("الجزء الأول"): where the printer cut the book, not the author.
 * - A paragraph the printed page cut in two (`# PageV02P019` on a line of
 *   its own between the halves) is one paragraph, unless the first half
 *   ends a sentence or is a line of verse.
 *
 * `mend` puts right a line the file has wrong, by its whole text; `mendAt`
 * does the same for a line that occurs more than once, by which occurrence
 * (`null` leaves that one alone). Every mend must be used. Throws on a
 * line it does not know.
 */
function openitiParts(text, where, spec) {
  const start = text.indexOf('#META#Header#End#');
  if (start < 0) throw new Error(`${where}: not an OpenITI file`);
  const clean = s =>
    s
      .replace(/PageV\d+P\d+|ms\d+|<\/span>|«\d+»|\d+»|«\d+/g, ' ')
      .replace(/\s+/g, ' ')
      // The space a note's mark left before a stop; the three dots between a verse's halves keep theirs.
      .replace(/ (?=[،؛:؟!]|\.(?!\.))/g, '')
      // A heading's colon, set at the head of the paragraph under it.
      .replace(/^(?:[؟:]+\s*)+/, '')
      .trim();
  const mend = spec.mend ?? {};
  const mendAt = spec.mendAt ?? {};
  const used = new Set();
  const seen = {};
  const chapters = [];
  let part = '';
  let fresh = false; // a part was named and has no chapter yet
  let para = null;
  let cut = false; // the last line was a page mark alone
  let volumes = 0;
  let editors = 0;
  let skipping = false;
  const chapter = () => {
    if (fresh) {
      chapters.push({ t: part, p: part, b: [] });
      fresh = false;
    }
    if (!chapters.length) throw new Error(`${where}: text before the first heading`);
    return chapters[chapters.length - 1];
  };
  const flush = () => {
    if (para == null) return;
    const s = clean(para);
    para = null;
    // A stop left alone on its line, where a note's mark stood.
    if (!/[\u0621-\u064A]/.test(s)) return;
    const b = chapter().b;
    const halves = s.split(' ... ');
    if (halves.length === 2 && s.length < 160) {
      const line = halves.map(h => h.trim()).join(HALVES);
      const last = b[b.length - 1];
      if (last && typeof last === 'object' && last.v) last.v.push(line);
      else b.push({ v: [line] });
    } else b.push(s);
  };
  for (let line of text.slice(start).split('\n').slice(1)) {
    if (!line.trim()) continue;
    if (line in mendAt) {
      const n = (seen[line] = (seen[line] ?? 0) + 1);
      const to = mendAt[line][n - 1];
      if (to != null) {
        used.add(`${line}#${n}`);
        line = to;
      }
    } else if (line in mend) {
      used.add(line);
      line = mend[line];
    }
    // What the printer added at a volume's end ("تم الجزء الأول … ويليه
    // الجزء الثاني"), which OpenITI marks as the editor's: left out, up to
    // the next heading.
    if (/^### \|EDITOR\|\s*$/.test(line)) {
      flush();
      editors++;
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!line.startsWith('### ')) continue;
      skipping = false;
    }
    if (line.startsWith('~~')) {
      if (para == null) throw new Error(`${where}: a line going on from nothing: ${line.slice(0, 60)}`);
      para += ` ${line.slice(2)}`;
      continue;
    }
    if (/^# PageV\d+P\d+\s*$/.test(line)) {
      cut = para != null;
      continue;
    }
    // The printed edition's volume, on a line of its own: not the author's division.
    if (spec.volumes?.test(line)) {
      volumes++;
      continue;
    }
    const h = /^### (\|+) ?(.*)$/.exec(line);
    if (h) {
      flush();
      cut = false;
      const title = clean(h[2]).replace(/^\[(.*)\]$/, '$1').replace(/:$/, '').trim();
      if (!title) continue;
      if (h[1].length === 1) {
        part = title;
        fresh = true;
      } else if (h[1].length === 2) {
        fresh = false;
        chapters.push({ t: title, p: part, b: [] });
      } else chapter().b.push({ h: title });
      continue;
    }
    if (line.startsWith('# ')) {
      const rest = line.slice(2);
      if (cut && para != null && !/[.؟!:]\s*$|\.\.\./.test(clean(para)) && !rest.includes(' ... ')) {
        para += ` ${rest}`;
      } else {
        flush();
        para = rest;
      }
      cut = false;
      continue;
    }
    throw new Error(`${where}: a line this file does not know: ${line.slice(0, 60)}`);
  }
  flush();
  const wanted = [...Object.keys(mend), ...Object.entries(mendAt).flatMap(([l, tos]) => tos.map((to, i) => (to == null ? null : `${l}#${i + 1}`)).filter(Boolean))];
  if (editors !== (spec.editors ?? 0)) throw new Error(`${where}: ${editors} passages marked as the editor's, not ${spec.editors ?? 0}`);
  if (spec.volumes && !volumes) throw new Error(`${where}: no volume mark was met`);
  for (const w of wanted) if (!used.has(w)) throw new Error(`${where}: a mend that mended nothing: ${w.slice(0, 60)}`);
  for (const c of chapters) {
    if (!c.t || !c.p) throw new Error(`${where}: a chapter without a name or a part`);
    if (!c.b.some(b => typeof b === 'string' || b.v)) throw new Error(`${where}: "${c.t}" has no text`);
    for (const b of c.b) {
      const s = typeof b === 'string' ? b : b.h ?? b.v.join(' ');
      if (/#|~~|PageV|\bms\d|@[A-Z]|%~%|[<>]|«\d/.test(s)) throw new Error(`${where}: markup left in the text: ${s.slice(0, 80)}`);
    }
  }
  return chapters;
}

/** A pack from an OpenITI file. */
function openitiPack(id, spec, text) {
  const body = spec.debris ? text.replace(spec.debris, ' ') : text;
  const chapters = spec.parts ? openitiParts(body, id, spec) : openitiChapters(body, id);
  const meta = key => (new RegExp(`#META# ${key}\\s*:: (.*)`).exec(text)?.[1] ?? '').trim();
  const edition = [meta('043.EdPUBLISHER'), meta('041.EdNUMBER')].filter(v => v && v !== 'NODATA' && v !== 'NOTGIVEN').join('، ');
  return {
    id,
    title: spec.title,
    author: spec.author,
    died: spec.died,
    lang: 'ar',
    source: { ...OPENITI, url: `https://github.com/OpenITI/${spec.openiti.split('/data/')[0]}/tree/master/data/${spec.openiti.split('/data/')[1].split('/').slice(0, 2).join('/')}`, ...(edition ? { edition } : null) },
    // The day the file was read, written down: a pack built again is the same bytes.
    asOf: spec.read,
    chapters,
  };
}

/** A pack: the book, and where its text is from. */
function packOf(id, spec, pages) {
  const chapters = [];
  let asOf = '';
  for (const c of spec.chapters(pages)) {
    const page = pages[c.page];
    if (!page) throw new Error(`${id}: the contents list "${c.page}" and it was not fetched`);
    if (page.ts > asOf) asOf = page.ts;
    let b = blocksOf(page.text, `${id} · ${c.page}`);
    // The page's own heading, when it only repeats the chapter's name.
    const same = s => s.replace(/[\s:=]/g, '');
    if (b.length && typeof b[0] === 'object' && b[0].h && (same(b[0].h) === same(c.title) || same(c.title).startsWith(same(b[0].h)) || same(b[0].h).startsWith(same(c.title)))) {
      // Where the contents page shortens a chapter's name, the chapter's own heading is its name.
      if (spec.ownHeadings && same(b[0].h).length > same(c.title).length && !/\(\d+\)$/.test(c.title)) c.title = b[0].h;
      b = b.slice(1);
    }
    if (!b.length) throw new Error(`${id}: "${c.page}" has no text`);
    chapters.push({ t: c.title, b });
  }
  if (!chapters.length) throw new Error(`${id}: no chapters`);
  return {
    id,
    title: spec.title,
    author: spec.author,
    died: spec.died,
    lang: 'ar',
    source: { ...SOURCE, url: `https://ar.wikisource.org/wiki/${encodeURIComponent(spec.prefix.replace(/ /g, '_'))}` },
    // The newest revision read: the text is the pages as they stood then.
    asOf: asOf.slice(0, 10),
    chapters,
  };
}

async function main() {
  const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const ids = want.length ? want : Object.keys(BOOKS);
  const manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`no ${manifestFile}: the hadith packs are built first (scripts/hadith/build-packs.js)`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const others = JSON.stringify({ ...manifest, library: undefined });
  manifest.library = manifest.library ?? {};
  for (const id of ids) {
    const spec = BOOKS[id];
    if (!spec) throw new Error(`no such book: ${id} (${Object.keys(BOOKS).join(', ')})`);
    const pack = spec.openiti ? openitiPack(id, spec, await openiti(spec.openiti, spec.cache)) : packOf(id, spec, await wikisource(spec.prefix, spec.cache));
    const json = JSON.stringify(pack);
    const file = path.join(OUT, 'library', `${id}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
    const words = pack.chapters.reduce((n, c) => n + c.b.reduce((m, b) => m + (typeof b === 'string' ? b : b.h ?? b.v.join(' ')).split(/\s+/).length, 0), 0);
    manifest.library[id] = {
      bytes: Buffer.byteLength(json),
      sha256: crypto.createHash('sha256').update(json).digest('hex'),
      count: pack.chapters.length,
      retrieved: pack.asOf,
    };
    console.log(`${id}: ${pack.chapters.length} chapters, about ${words} words, ${(Buffer.byteLength(json) / 1e6).toFixed(2)} MB`);
  }
  if (JSON.stringify({ ...manifest, library: undefined }) !== others) throw new Error('the manifest changed outside `library`: nothing written');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  console.log(`manifest: library names ${Object.keys(manifest.library).join(', ')}`);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
module.exports = { blocksOf, linksOf, packOf, openitiChapters, openitiParts, openitiPack, BOOKS, MAQAMAT, HALVES };
