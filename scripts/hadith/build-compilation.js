#!/usr/bin/env node
/**
 * A compilation, as an index into the hadith the app already serves.
 *
 *   node scripts/hadith/build-compilation.js riyad            # writes src/hadith/compilations/riyad.json
 *   node scripts/hadith/build-compilation.js riyad --review   # and prints a sample of what it paired, to be read
 *
 * Riyāḍ aṣ-Ṣāliḥīn is not graded hadith by hadith in any open dataset,
 * and does not need to be: an-Nawawī says, at the end of each hadith,
 * which book it is from. The maintainer's rule (2026-11-26,
 * docs/hadith-policy.md §1): a hadith in a compilation is served when its
 * compiler attributes it to al-Bukhārī or to Muslim, and what is served is
 * the app's OWN row of it in that book — the text and the standing it
 * already has.
 *
 * So nothing of the compilation is published. Its text is read here, once,
 * to answer two questions of each hadith, and is never written anywhere:
 *
 *   1. Which book does the compiler say it is from?   (`attribution`)
 *   2. Which row of ours, in that book, is it?         (`pair`)
 *
 * and the answer is a list of numbers: an-Nawawī's number, the book, the
 * row's place in Open-Hadith-Data's file (the `i` of an id `b:<book>:<i>`),
 * and the HadeethEnc entry that is the same hadith, where there is one —
 * that entry is what a reader in another language is shown, with its
 * translation and explanation.
 *
 * ── 1. THE ATTRIBUTION IS THE COMPILER'S, READ STRICTLY ────────────────
 *
 * The FIRST attribution after the hadith decides: "متفق عليه", or "رواه"
 * and the names that follow it, up to where the sentence turns to
 * something else. "رواه أبو داود بإسناد صحيح على شرط البخاري ومسلم" is
 * Abū Dāwūd's, not al-Bukhārī's and Muslim's; "رواه البخاري في الأدب
 * المفرد" is not his Ṣaḥīḥ; "وفي رواية لمسلم" further down is another
 * narration, and does not make the first one Muslim's. A hadith whose
 * first attribution is to anything else is LEFT OUT — the four Sunan and
 * the Muwaṭṭaʾ are graded here hadith by hadith and can be added by the
 * same rule; nobody has yet.
 *
 * ── 2. THE ROW IS FOUND WITH CONFIDENCE, OR NOT AT ALL ─────────────────
 *
 * The one mistake this file must not make is to show one hadith under
 * another's number. A compiler quotes the report and not its chain, often
 * one narration of several and sometimes shortened; a row of ours is the
 * chain and the report whole. So a hadith is paired with the row that
 * holds its words IN ORDER and CLOSE TOGETHER (`inOrderNear`: the most of
 * the hadith's words found, in their order, within one stretch of the row
 * about as long as the hadith — as a share of the hadith's words), and
 * only when:
 *
 *   • that share is PAIR_AT or more;
 *   • the hadith has MIN_WORDS words of its own to be told by, once the
 *     narrator's name, the blessings and the small words are set aside;
 *   • the book is one the compiler named.
 *
 * Another row nearly as close is no objection: in these two books it is
 * the same report by a second chain, and the best is taken. A hadith that
 * falls short is left out and counted (`left.notFound`): it is in the
 * book, and this could not say where.
 *
 * ── THE INPUT ──────────────────────────────────────────────────────────
 *
 * Arabic Wikisource's text of the book (CC BY-SA; the work itself is
 * seven centuries in the public domain), one request a batch of pages,
 * cached under scripts/hadith/.cache like every other source here. Read,
 * never republished: the output holds no word of it.
 *
 * Reads the packs in build/hadith/v1 (scripts/hadith/build-packs.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PACKS = path.join(ROOT, 'build', 'hadith', 'v1');
const CACHE = path.join(__dirname, '.cache');
const OUT_DIR = path.join(ROOT, 'src', 'hadith', 'compilations');

const COMPILATIONS = {
  riyad: {
    /** The book's hadith, by an-Nawawī's count in the edition read. */
    of: 1896,
    numbered: true,
    input: { wikisource: 'رياض الصالحين', cache: 'wikisource-riyad.json' },
    items: pages => numbered(pages),
  },
  /**
   * ʿUmdat al-Aḥkām, ʿAbd al-Ghanī al-Maqdisī (d. 600 AH): the hadith of
   * rulings "مما اتفق عليه الإمامان" — his own condition, stated in his
   * introduction, is that each is in al-Bukhārī AND Muslim. So the
   * attribution is the book's, of every hadith in it, and a hadith is
   * served from whichever of the two has its words. A second narration he
   * adds under a hadith ("ولمسلم: …") is not the hadith and is not read.
   *
   * The input is a transcription of the book in a public repository that
   * states no licence (github.com/okabe-r/Umdat-al-Ahkam): read, like
   * every input here, and never republished.
   */
  umdah: {
    of: 414,
    numbered: true,
    input: { url: 'https://raw.githubusercontent.com/okabe-r/Umdat-al-Ahkam/main/hadith.json', cache: 'github-umdah.json' },
    items: list => new Map(list.map(h => [h.id, h.content.split(/\n(?=\s*و(?:ل|في|عن|زاد|قال))/)[0]])),
    attribution: () => ['bukhari', 'muslim'],
  },
  /**
   * al-Kalim aṭ-Ṭayyib, Ibn Taymiyyah (d. 728 AH): remembrances and
   * supplications, each with where it is from — after it ("خرجه مسلم",
   * "أخرجه البخاري", "رواه الترمذي وقال: حديث حسن", "متفق عليه") or before
   * it ("في الصحيحين عن…", "وفي صحيح مسلم"). He does not number them: they
   * are counted here in his order, and the app shows no number.
   */
  kalim: {
    numbered: false,
    input: { wikisource: 'الكلم الطيب', cache: 'wikisource-kalim.json' },
    items: pages => bracketed(pages),
    attribution: body => attributionAround(body),
    report: body => plain(body.slice(body.indexOf('[') + 1, body.indexOf(']'))),
  },
  /**
   * Hadith Qudsi, from the two Ṣaḥīḥs. There is no classical book of them
   * with attributions to read; the input is hadith-api's edition of a
   * modern selection of forty, which ends each with where it is from
   * ("رواه مسلم (وكذلك البخاري والنسائي)"). Only its first attribution is
   * read, and only where that is al-Bukhārī or Muslim: what is served is
   * that book's own row, on the collection's standing, so the list is OURS
   * — the hadith qudsi of the two Ṣaḥīḥs that a known selection points to
   * — and is not presented as that selection (`own`: the app words the
   * list accordingly, and shows no numbers).
   */
  qudsi: {
    of: 40,
    numbered: false,
    own: true,
    input: { url: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-qudsi.min.json', cache: 'hadith-api-qudsi.json' },
    // The edition as fetched, or as an earlier run kept it: `[number, text]` rows.
    items: d =>
      new Map(
        (Array.isArray(d) ? d : d.hadiths.map(h => [h.hadithnumber, h.text])).map(([n, text]) => [n, String(text).replace(/<br\s*\/?>/g, '\n')]),
      ),
    attribution: body => {
      const named = attribution(body);
      return ['bukhari', 'muslim'].includes(named[0]) ? named.filter(b => b === 'bukhari' || b === 'muslim') : [];
    },
  },
  /**
   * al-Adhkār, an-Nawawī (d. 676 AH): the remembrances of the day and the
   * night, of the prayer and of every occasion. He names where each is
   * from BEFORE it — "روينا في صحيح مسلم عن…", "وروينا في سنن أبي داود
   * والترمذي بإسناد صحيح عن…" — and says so when a chain is weak
   * (`attributionLed`). A report he leads with "وروينا فيه" (in the book
   * just named) or gives no book for is not read: the rule wants his own
   * words for each.
   *
   * Wikisource holds one chapter of it. The input is the OpenITI corpus's
   * transcription of the numbered edition (github.com/OpenITI/0700AH,
   * CC BY-NC-SA): read, like every input here, and never republished —
   * the output holds no word of it.
   */
  adhkar: {
    numbered: true,
    input: {
      url: 'https://raw.githubusercontent.com/OpenITI/0700AH/master/data/0676Nawawi/0676Nawawi.Adhkar/0676Nawawi.Adhkar.Shamela0001956-ara1',
      cache: 'openiti-adhkar.txt',
      text: true,
    },
    items: text => {
      const items = new Map();
      const parts = text.slice(text.indexOf('#META#Header#End#')).split(/\n### \| (\d+) - *\n/);
      for (let i = 1; i < parts.length - 1; i += 2) {
        const n = Number(parts[i]);
        // The edition repeats a number here and there: the first stands.
        if (items.has(n)) continue;
        const paras = parts[i + 1]
          .split(/\n# /)
          .map(p => p.replace(/^# /, '').replace(/PageV\d+P\d+|ms\d+|~~|\(\d+\)/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (!paras.length) continue;
        // A paragraph that stops mid-sentence (a page turned, or a narrator
        // still being introduced: "…قالت:") goes on in the next.
        let first = paras[0];
        let at = 1;
        while (at < paras.length && at < 4 && !/[."»؟!]$/.test(first)) first += ` ${paras[at++]}`;
        // A chapter's heading set after its last hadith is not the hadith.
        first = first.split(' ### ')[0];
        const verdict = paras[at];
        items.set(n, [first, verdict && VERDICT_HEAD.test(plain(verdict)) ? verdict : ''].join('\n'));
      }
      return items;
    },
    attribution: body => attributionLed(body.split('\n')[0]),
    report: body => reportLed(body.split('\n')[0]),
    // "بإسناد جيد لم يضعفه": Abū Dāwūd did NOT call it weak.
    weak: body => SAYS_WEAK.test(plain(body).replace(/لم يضعفه/g, ' ')),
  },
  /**
   * al-Wābil aṣ-Ṣayyib min al-Kalim aṭ-Ṭayyib, Ibn al-Qayyim (d. 751 AH):
   * on the remembrance of Allah and its fruits, and then the remembrances
   * themselves by their occasions. Wikisource has it as one page, in the
   * form it has his teacher's al-Kalim aṭ-Ṭayyib: each hadith in square
   * brackets, where it is from before it ("وفي صحيح مسلم عن…") or after it
   * ("رواه الترمذي وقال حديث حسن"), a paragraph a line. Much of the book
   * is his own words and reports from the early Muslims; those name none
   * of the seven books and are not read. Unnumbered, like its model.
   */
  wabil: {
    numbered: false,
    input: { wikisource: 'كتاب الوابل الصيب', cache: 'wikisource-wabil.json' },
    items: pages => bracketed(pages, /\n/),
    attribution: body => attributionAround(body),
    report: body => plain(body.slice(body.indexOf('[') + 1, body.indexOf(']'))),
  },
  /**
   * Kitāb at-Tawḥīd, Muḥammad ibn ʿAbd al-Wahhāb (d. 1206 AH): chapters
   * of verses and hadith, each chapter closed by the points he draws from
   * them ("فيه مسائل", not read). He says where a hadith is from after it
   * ("أخرجاه", "رواه مسلم") or before it ("وفي الصحيح عن…", "ولهما عن…",
   * "ولمسلم عن…": `attributionTawhid`). Wikisource sets every quotation,
   * verse or hadith, in round brackets, and breaks its lines mid-sentence:
   * so the book is read as one run of text, and a report is a bracket
   * with what leads into it and what follows it, up to the next bracket.
   * A bracket nothing introduces as a report (a verse, a phrase quoted
   * again) is not counted. Unnumbered.
   */
  tawhid: {
    numbered: false,
    input: { wikisource: 'كتاب التوحيد الذي هو حق الله على العبيد', cache: 'wikisource-tawhid.json' },
    items: pages => {
      const items = new Map();
      let n = 0;
      for (const page of Object.values(pages)) {
        const t = page.text
          .replace(/\{\{صل\}\}/g, ' صلى الله عليه وسلم ')
          .replace(/\{\{[^{}]*\}\}/gs, '')
          .replace(/'''?/g, '')
          // His own points at each chapter's end, up to the next chapter's heading.
          .replace(/فيه مسائل:?[\s\S]*?(?=\n=+[^=\n]+=+|$)/g, '\n')
          .replace(/^=+[^=\n]+=+$/gm, ' ¶ ')
          .replace(/[[\]]/g, ' ')
          .replace(/\s+/g, ' ');
        const re = /\(([^()]{20,})\)/g;
        let m;
        let from = 0;
        while ((m = re.exec(t))) {
          // What leads into it: since the bracket, the stop or the heading before.
          const lead = t.slice(from, m.index).split(/[.¶]/).pop().slice(-200);
          const rest = t.slice(re.lastIndex, re.lastIndex + 160).split(/[(¶]/)[0];
          from = re.lastIndex;
          const body = `${lead} [${m[1]}] ${rest}`;
          const told = / عن |قال (?:رسول|النبي)|يقول/.test(plain(lead)) || TAWHID_AFTER.test(plain(rest));
          if (told) items.set(++n, body);
        }
      }
      return items;
    },
    attribution: body => attributionTawhid(body),
    report: body => plain(body.slice(body.indexOf('[') + 1, body.indexOf(']'))),
    weak: body => SAYS_WEAK.test(plain(body.slice(body.indexOf(']') + 1)).split('.')[0]),
  },
  /**
   * The eight hadith Ibn Rajab (d. 795 AH) added to an-Nawawī's forty-two
   * to make fifty, in Jāmiʿ al-ʿUlūm wa-l-Ḥikam: numbers 43 to 50. Each of
   * his chapters opens with the hadith and, after it, where it is from
   * ("خرجه البخاري ومسلم", "رواه الإمام أحمد والترمذي… وقال الترمذي حديث
   * حسن"); the commentary that follows is not read. Wikisource sets the
   * hadith in <big>…</big>, which is how it is told from the commentary.
   */
  /**
   * Bulūgh al-Marām min Adillat al-Aḥkām, Ibn Ḥajar al-ʿAsqalānī (d. 852
   * AH): the hadith of rulings, each followed by who reports it — and in
   * his own shorthand, which his preface defines and `attributionBulugh`
   * reads: "السبعة" is Aḥmad and the six, "الستة" the six, "الخمسة" Aḥmad
   * and the four Sunan, "الأربعة" the four Sunan, "الثلاثة" Abū Dāwūd,
   * at-Tirmidhī and an-Nasāʾī, "متفق عليه" al-Bukhārī and Muslim. He also
   * says what he and the imams before him found wrong with a hadith
   * ("وضعفه أبو حاتم", "وإسناده ضعيف", "ورجح … إرساله"), and a hadith he
   * reports with such a word is left out (`weakBulugh`).
   *
   * The text is OpenITI's, from Shamela's transcription of the Dār
   * al-Falaq printing. The conversion took a quotation set on a line of
   * its own for a heading ("### | : «إذا كان الماء قلتين"): such a line is
   * the hadith's text. A heading that IS one — كتاب, باب, فصل — set after
   * a chapter's last hadith ends that hadith. "[ص: 6]" is the page.
   */
  bulugh: {
    of: 1582,
    numbered: true,
    input: {
      url: 'https://raw.githubusercontent.com/OpenITI/0875AH/master/data/0852IbnHajarCasqalani/0852IbnHajarCasqalani.BulughMaram/0852IbnHajarCasqalani.BulughMaram.Shamela0009111-ara1',
      cache: 'openiti-bulugh.txt',
      text: true,
    },
    items: text => {
      const items = new Map();
      const parts = text.slice(text.indexOf('#META#Header#End#')).split(/\n### \| (\d+) - *\n/);
      for (let i = 1; i < parts.length - 1; i += 2) {
        const n = Number(parts[i]);
        if (items.has(n)) continue;
        const lines = [];
        for (const line of parts[i + 1].split('\n')) {
          const h = /^### [|$]+ ?(.*)$/.exec(line);
          if (h && /^\[ص: \d+\]\s*$/.test(h[1])) continue;
          if (h && /^(?:كتاب|باب|فصل)(?:\s|$)/.test(h[1])) break;
          lines.push(h ? h[1] : line.replace(/^# |^~~/, ''));
        }
        const body = lines.join(' ').replace(/PageV\d+P\d+|ms\d+|\(\d+\)/g, ' ').replace(/\s+/g, ' ').trim();
        if (body) items.set(n, body);
      }
      return items;
    },
    attribution: body => attributionBulugh(body),
    report: body => reportBulugh(body),
    weak: body => weakBulugh(body),
  },
  rajab: {
    of: 8,
    numbered: true,
    input: { wikisource: 'جامع العلوم والحكم/الحديث ', cache: 'wikisource-rajab.json' },
    items: pages => {
      const ORDINALS = { 'الثالث والأربعون': 43, 'الرابع والأربعون': 44, 'الخامس والأربعون': 45, 'السادس والأربعون': 46, 'السابع والأربعون': 47, 'الثامن والأربعون': 48, 'التاسع والأربعون': 49, 'الخمسون': 50 };
      const items = new Map();
      for (const [title, page] of Object.entries(pages)) {
        const n = ORDINALS[title.slice(title.indexOf('/الحديث ') + '/الحديث '.length)];
        const m = n && /<big>([\s\S]*?)<\/big>([^\n]*)/.exec(page.text.replace(/\{\{صل\}\}/g, ' صلى الله عليه وسلم '));
        // In the form al-Kalim aṭ-Ṭayyib is read in: the hadith in brackets, his attribution after it.
        if (m) items.set(n, `[${m[1].replace(/[[\]]/g, ' ')}] ${m[2]}`);
      }
      return items;
    },
    attribution: body => attributionAround(body),
    report: body => plain(body.slice(body.indexOf('[') + 1, body.indexOf(']'))),
  },
};

/**
 * Pairings a person has read and signed (docs/hadith-policy.md §1, the
 * maintainer's clause of 2026-11-26): where the measure below falls short
 * of a hadith that is plainly in the book its compiler names. The file
 * says who and why; `signedRow` holds each to the rule.
 */
const SIGNED = JSON.parse(fs.readFileSync(path.join(__dirname, 'signed-pairings.json'), 'utf8'));

/**
 * The row a signature names, or an error: a signature does not go outside
 * the compiler's own attribution, and the row must be there — one the app
 * serves — under the number signed for and holding the words signed for,
 * so that a rebuilt pack cannot quietly put another hadith in its place.
 */
function signedRow(sig, named, book) {
  const fail = why => {
    throw new Error(`signed-pairings.json: no. ${sig.n} → ${sig.book} row ${sig.row}: ${why}`);
  };
  if (!named.includes(sig.book)) fail(`its compiler does not attribute it to ${sig.book} (${named.join(', ') || 'no book the app serves'})`);
  if (!book) fail('no such book');
  const at = book.rows.findIndex((r, i) => (typeof r[2] === 'number' ? r[2] : i) === sig.row);
  if (at < 0) fail('no such row in the pack: not served, or the pack has changed');
  const row = book.rows[at];
  if (row[0] !== sig.number) fail(`the row is numbered ${row[0]}, and ${sig.number} was signed for`);
  const text = fold(row[1]);
  for (const words of sig.holds) if (!text.includes(fold(words))) fail(`the row does not hold "${words}"`);
  if (!sig.by || !/^\d{4}-\d{2}-\d{2}$/.test(sig.on || '') || !sig.why) fail('unsigned: it needs who, when and why');
  return sig.row;
}

/** A hadith is paired with a row that holds this share of its words, in order. */
const PAIR_AT = 0.85;
/** And with a HadeethEnc entry at this share, each way. */
const HENC_AT = 0.85;
/** Words of its own a hadith needs, to be told from another. */
const MIN_WORDS = 6;

// ── Text, for matching only ────────────────────────────────────────────

const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g;
/** Blessings and praises: the same words in every hadith, and written or not as an editor pleased. */
const HONORIFICS =
  /رضي الله (?:تعالي )?عن(?:ه|ها|هما|هم)|صلي الله عليه(?: واله)? وسلم|عليه (?:الصلاه و)?السلام|عز وجل|تبارك وتعالي|سبحانه وتعالي|صلوات الله وسلامه عليه(?:م)?/g;
function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ﷺ/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(HONORIFICS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Words that are in every chain and every report, and tell no hadith from another. */
const SMALL = new Set(
  'عن ان قال قالت قالوا يقول فقال رسول الله النبي حدثنا اخبرنا حدثني اخبرني انبانا بن ابن ابي ابو ابا عبد و في من علي الي ما لا ثم او اذا كان انه وعن وعنه وعنها تعالي'.split(
    ' ',
  ),
);
const words = s => fold(s).split(' ').filter(w => w && !SMALL.has(w));

/** How much of `a` is found in `b`, in a's order: the longest common subsequence, as a share of a. */
function inOrder(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1);
    const w = a[i - 1];
    for (let j = 1; j <= b.length; j++) cur[j] = w === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length] / a.length;
}

// ── 1. The compiler's attribution ──────────────────────────────────────

// attribution-rule:start
const plain = s => String(s ?? '').normalize('NFD').replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');
const AGREED = /متفق علي(?:ه| صحته)/;
/**
 * "رواه", after a space or a stop — or an opening bracket: the edition
 * read sets the attributions of the book's first chapters in double
 * brackets, "((رواه مسلم))", and for a day fifty-eight of them went
 * unread and their hadith were counted as attributed elsewhere. The
 * closing bracket ends the names (`NAMES_END`).
 */
const REPORTED = /(?:^|[\s.،(])رواه(?:ما)? /;
const REPORTED_HEAD = /^[\s.،(]*رواه(?:ما)? /;
/**
 * Ibn Taymiyyah's words for the same: "خرجه مسلم", "أخرجه البخاري",
 * "خرجاه" (the two of them). Read only of a book that uses them, and only
 * in what FOLLOWS a hadith: in a hadith's own words "فأخرجه" is a man
 * taking something out (Riyāḍ aṣ-Ṣāliḥīn 518 lost its attribution to it).
 */
const AGREED_WIDE = /متفق علي(?:ه| صحته)|(?:^|[\s.،\]])ا?خرجاه(?=[\s.،]|$)/;
const REPORTED_WIDE = /(?:^|[\s.،\]])(?:رواه(?:ما)?|ا?خرجه) /;
const REPORTED_HEAD_WIDE = /^[\s.،\]]*(?:رواه(?:ما)?|ا?خرجه) /;
/** Where a "رواه …" stops naming books and says something else. */
const NAMES_END = /[.،؛:\n()«"]| وقال| قال| باسناد| باسانيد| علي شرط| في | وغيره| وغيرهما| وغيرهم| بلفظ| وهذا| هكذا| من روايه| مرفوعا| موقوفا| مرسلا| تعليقا| معلقا/;
/** The seven books the app serves, as a compiler writes them (unvowelled). */
const BOOK_NAMES = [
  ['bukhari', /(?:^| )البخاري(?: |$)/],
  ['muslim', /(?:^| )مسلم(?: |$)/],
  ['abudawud', /(?:^| )ابو ?داود(?: |$)/],
  ['tirmidhi', /(?:^| )الترمذي(?: |$)/],
  ['nasai', /(?:^| )النسايي(?: |$)|(?:^| )النسائي(?: |$)/],
  ['ibnmajah', /(?:^| )ابن ماجه(?: |$)/],
  ['malik', /(?:^| )مالك(?: |$)/],
];
/** "رواه مالك في الموطأ", "رواه أبو داود في سننه": the book itself, said in full. */
const IN_HIS_BOOK = /^ في (?:الموطا|سننه|سننهما|صحيحه|صحيحيهما|جامعه)/;
/**
 * The books the compiler's FIRST attribution names, of the seven the app
 * serves, in the order he names them — or [] where it names none of
 * them, names one with a reservation, or there is no attribution to read.
 */
function attribution(body, wide = false) {
  const t = plain(body);
  // "متفق على صحته" is how an-Nawawī words it of the book's first hadith.
  const agreed = t.search(wide ? AGREED_WIDE : AGREED);
  const reported = t.search(wide ? REPORTED_WIDE : REPORTED);
  if (agreed < 0 && reported < 0) return [];
  if (agreed >= 0 && (reported < 0 || agreed < reported)) return ['bukhari', 'muslim'];
  const after = t.slice(reported).replace(wide ? REPORTED_HEAD_WIDE : REPORTED_HEAD, '');
  const stop = after.search(NAMES_END);
  const turned = stop < 0 ? '' : after.slice(stop, stop + 16);
  const names = stop < 0 ? after : after.slice(0, stop);
  // "رواه البخاري في الأدب المفرد", "رواه مسلم في مقدمته", "رواه البخاري تعليقا": not the book's own report.
  if ((/^ في /.test(turned) && !IN_HIS_BOOK.test(turned)) || /^ (?:تعليقا|معلقا)/.test(turned)) return [];
  const list = names.split(/\s+و(?=\S)|\s+/).join(' ');
  return BOOK_NAMES.filter(([, re]) => re.test(list)).map(([b]) => b);
}

/**
 * Does the compiler himself say, with his attribution, that the hadith is
 * weak? ("رواه أبو داود بإسناد ضعيف", "…وضعفه", "…وفي إسناده مجهول".) Such
 * a hadith is left out whatever he attributes it to (docs/hadith-policy.md).
 * Read in the sentences that follow his first attribution.
 */
const SAYS_WEAK = /ضعيف|ضعف|لا يصح|لم يصح|لا يثبت|منقطع|مجهول|فيه نظر|باطل|موضوع/;
function saysWeak(body) {
  const t = plain(body);
  const agreed = t.search(AGREED);
  const reported = t.search(REPORTED);
  // Of what he calls agreed upon he says nothing more; and only the
  // sentence of the attribution is his verdict — what follows it is his
  // explanation of the hadith's words ("…في باب ضعفة المسلمين").
  if (reported < 0 || (agreed >= 0 && agreed < reported)) return false;
  const sentence = t.slice(reported + 1).split(/[.\n]/)[0];
  return SAYS_WEAK.test(sentence);
}
/**
 * An attribution that may stand AFTER the hadith or BEFORE it, the hadith
 * itself being in square brackets (al-Kalim aṭ-Ṭayyib): what follows the
 * bracket is read first, as above; failing that, what leads into it —
 * "في الصحيحين", "وفيهما" (in the two just named), "في صحيح مسلم", or
 * "قال الترمذي: حديث حسن" after it, which is at-Tirmidhī reporting it.
 */
function attributionAround(body) {
  const t = plain(body);
  const open = t.indexOf('[');
  const close = t.indexOf(']');
  if (open < 0 || close < open) return [];
  const after = t.slice(close + 1);
  const named = attribution(after, true);
  if (named.length) return named;
  if (/^[\s.،]*(?:و)?قال الترمذي/.test(after)) return ['tirmidhi'];
  const before = t.slice(0, open);
  if (/في الصحيحين|وفيهما|في البخاري ومسلم/.test(before)) return ['bukhari', 'muslim'];
  if (/في (?:صحيح )?مسلم/.test(before)) return ['muslim'];
  if (/في (?:صحيح )?البخاري/.test(before)) return ['bukhari'];
  return [];
}
/**
 * An attribution that LEADS the report (al-Adhkār): "روينا في …", "وقد
 * روينا في …", "ثبت في …", up to where the narrator is named. The books
 * are read from those words alone. "غير الصحيحين" is not the Ṣaḥīḥs, and
 * "فيه" / "فيهما" (the book just named) names nothing here.
 */
const LED = /^(?:قال المصنف[^:]*: ?)?(?:و|ف)?(?:قد )?(?:رويناه?|ثبت)(?: بالاسناد الصحيح| بالاسانيد الصحيح[هة])? في (.+?)(?: عن | ان |،|:| من رواي[هة] )/;
const VERDICT_HEAD = /^(?:و?قال (?:الترمذي|ابو داود|الحاكم)|و?(?:في )?اسناده|و?هو حديث|حديث )/;
function attributionLed(para) {
  const m = LED.exec(plain(para).replace(/["()]/g, ' ').replace(/\s+/g, ' '));
  if (!m) return [];
  const names = m[1];
  if (/^غير /.test(names)) return [];
  if (/صحيحيهما|(?:^| )الصحيحين|صحيحي /.test(names)) return ['bukhari', 'muslim'];
  // After "في" the name is in the genitive: "سنن أبي داود".
  const list = names.replace(/ابي داود/g, 'ابو داود').split(/\s+و(?=\S)|\s+/).join(' ');
  return BOOK_NAMES.filter(([b, re]) => re.test(list) || (b === 'malik' && /(?:^| )الموطا(?: |$)/.test(list))).map(([b]) => b);
}
/** What follows a leading attribution: the report. */
function reportLed(para) {
  const t = plain(para).replace(/["()]/g, ' ').replace(/\s+/g, ' ');
  const m = LED.exec(t);
  const said = m ? t.slice(m[0].length - 1) : t;
  // After the report he may give another wording, or explain a word: not the report.
  const turn = said.search(/ وفي رواي[هة]| قلت:| ثم قال الترمذي| قال الترمذي| وهذا لفظ| هذا لفظ| ومعني | قال العلماء/);
  return turn > 0 ? said.slice(0, turn) : said;
}
/**
 * Kitāb at-Tawḥīd's attributions: after the report, read as above when
 * the words that follow it BEGIN with one ("أخرجاه", "رواه مسلم"); else
 * before it — "وفي الصحيح" and "في الصحيحين" and "ولهما" are al-Bukhārī's
 * and Muslim's (which of the two has it, the pairing finds), "ولمسلم" is
 * Muslim's, "وللبخاري" al-Bukhārī's, and so for the Sunan. "ولأحمد" names
 * no book served.
 */
const TAWHID_AFTER = /^[\s.،]*(?:رواه(?:ما)? |ا?خرجه |ا?خرجاه(?=[\s.،]|$)|متفق عليه)/;
function attributionTawhid(body) {
  const t = plain(body);
  const open = t.indexOf('[');
  const close = t.indexOf(']');
  if (open < 0 || close < open) return [];
  const after = t.slice(close + 1);
  if (TAWHID_AFTER.test(after)) return attribution(after, true);
  const before = t.slice(0, open);
  if (/(?:^|\s)و?في الصحيح(?:ين)?(?:\s|$)|(?:^|\s)ولهما\s/.test(before)) return ['bukhari', 'muslim'];
  if (/(?:^|\s)ولمسلم\s|في صحيح مسلم/.test(before)) return ['muslim'];
  if (/(?:^|\s)وللبخاري\s|في صحيح البخاري/.test(before)) return ['bukhari'];
  if (/(?:^|\s)ولابي داود\s/.test(before)) return ['abudawud'];
  if (/(?:^|\s)وللترمذي\s/.test(before)) return ['tirmidhi'];
  if (/(?:^|\s)وللنسا[يئ]ي\s/.test(before)) return ['nasai'];
  return [];
}
/**
 * Ibn Ḥajar's attribution in Bulūgh al-Marām, in the shorthand his preface
 * sets out: the books his FIRST attribution names, of the seven the app
 * serves. A group word stands for its books ("الأربعة": the four Sunan;
 * Aḥmad, whom "السبعة" and "الخمسة" count, is not served and is not
 * named here), "إلا" takes out what follows it ("أخرجه الأربعة إلا
 * النسائي"), and a hadith he gives as another book's wording of the one
 * before ("وللبخاري: …", "ولمسلم …", "ولأبي داود: …") is that book's. One
 * he gives for a book the app does not serve ("وللبيهقي", "رواه أحمد",
 * "أخرجه الدارقطني") names none.
 */
const BULUGH_GROUPS = [
  [/(?:^| )السبع[هة](?: |$)/, ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah']],
  [/(?:^| )الست[هة](?: |$)/, ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah']],
  [/(?:^| )الخمس[هة](?: |$)/, ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah']],
  [/(?:^| )الاربع[هة](?: |$)/, ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah']],
  [/(?:^| )الثلاث[هة](?: |$)/, ['abudawud', 'tirmidhi', 'nasai']],
];
/** Where a piece of his list stops naming books: a verdict, a wording, a place in a book. */
const BULUGH_NAMES_END = / و?(?:صحح|حسن|ضعف|قال|رجال|اسناد|سند|لفظ|اللفظ|زاد|اصل|رجح|قوا|اعل|استنكر|هذا|هو |لكن|مرسل|موقوف|مطول|مختصر|تعليقا|معلقا|بمعنا|نحوه|مثله|علي شرط|بلفظ|من |عن |ان |في )/;
const BULUGH_LED = [
  [/^و?للبخاري[\s:،]/, 'bukhari'],
  [/^و?لمسلم[\s:،]/, 'muslim'],
  [/^و?لابي داود[\s:،]/, 'abudawud'],
  [/^و?للترمذي[\s:،]/, 'tirmidhi'],
  [/^و?للنسا[يئ]ي[\s:،]/, 'nasai'],
  [/^و?لابن ماجه[\s:،]/, 'ibnmajah'],
];
const bulughNames = names => {
  const list = names.replace(/ابي داود/g, 'ابو داود').split(/\s+و(?=\S)|\s+/).join(' ');
  const out = new Set(BOOK_NAMES.filter(([, re]) => re.test(list)).map(([b]) => b));
  for (const [re, group] of BULUGH_GROUPS) if (re.test(list)) for (const b of group) out.add(b);
  return out;
};
/** Where his first attribution begins and what kind it is; null where there is none. */
function bulughFirst(t) {
  const agreed = t.search(AGREED_WIDE);
  const reported = t.search(REPORTED_WIDE);
  if (agreed < 0 && reported < 0) return null;
  return agreed >= 0 && (reported < 0 || agreed < reported) ? { at: agreed, agreed: true } : { at: reported, agreed: false };
}
function attributionBulugh(body) {
  const t = plain(body).replace(/[,;]/g, m => (m === ',' ? '،' : '؛'));
  const led = BULUGH_LED.find(([re]) => re.test(t));
  if (led) return [led[1]];
  // "ولأصحاب السنن: …": the four Sunan, as he names them together.
  if (/^و?لاصحاب السنن[\s:،]/.test(t)) return ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];
  // "ولأحمد", "وللبيهقي", "وله", "ولهما": another book's wording, of a book not served or not named.
  if (/^و?ل(?:ل|ه |هما |احمد|ابن )/.test(t)) return [];
  const first = bulughFirst(t);
  if (!first) return [];
  if (first.agreed) return ['bukhari', 'muslim'];
  // He lists his sources with commas between them ("رواه أحمد، والثلاثة،
  // وصححه الترمذي"): the names run on over a comma until a piece says
  // something else, and stop at the sentence's end.
  const sentence = t.slice(first.at).replace(REPORTED_HEAD_WIDE, '').split(/[.؛:\n()«"]/)[0];
  let names = '';
  let turned = '';
  for (const piece of sentence.split('،')) {
    const stop = ` ${piece} `.search(BULUGH_NAMES_END);
    if (stop >= 0) {
      names += ` ${` ${piece} `.slice(0, stop)}`;
      turned = ` ${piece} `.slice(stop, stop + 16);
      break;
    }
    if (piece.trim().split(/\s+/).length > 6) break;
    names += ` ${piece}`;
  }
  if ((/^ في /.test(turned) && !IN_HIS_BOOK.test(turned)) || /^ (?:تعليقا|معلقا)/.test(turned)) return [];
  const [kept, ...taken] = names.split(/ (?:الا|سوي|غير) /);
  const out = bulughNames(kept);
  for (const b of bulughNames(taken.join(' '))) out.delete(b);
  return ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik'].filter(b => out.has(b));
}
/** The hadith itself: before his first attribution, or — where the book leads ("وللبخاري: «…»") — after it. */
function reportBulugh(body) {
  const t = plain(body).replace(/[,;]/g, m => (m === ',' ? '،' : '؛'));
  const led = BULUGH_LED.find(([re]) => re.test(t)) ?? (/^و?لاصحاب السنن[\s:،]/.test(t) ? [/^و?لاصحاب السنن[\s:،]/] : undefined);
  const from = led ? t.replace(led[0], ' ') : t;
  const first = bulughFirst(from);
  return first ? from.slice(0, first.at) : from;
}
/**
 * Does he report, with the attribution, that the hadith was found wanting
 * — by himself or by an imam he quotes? Read from his attribution to where
 * he turns to another wording ("وللبخاري", "وفي رواية", "وزاد"), so a word
 * about a second report does not fall on the first. Wider than `SAYS_WEAK`:
 * this book's own terms — معلول, أعلّه, منكر, مضطرب, and a hadith judged
 * to be a Companion's word or to lack its Companion ("والصواب وقفه",
 * "ورجح إرساله", "مرسل"). Leaving out too much is the safe side.
 */
// Whole words only: "واه" is in "رواه", "لين" in "الأولين", "عله" in "فعله".
const BULUGH_WEAK = new RegExp(
  '(?:^|[\\s.،؛:«»])(?:و|ف|ب|ل)?(?:ال)?(?:' +
    'ضعيف[هة]?|ضعف[هة]?|ضعفوه|منقطع|مجهول|باطل|موضوع|معلول|معل|اعل[هة]|اعلوه|منكر|استنكره?|مضطرب|اضطراب|مرسلا?|ارسال[هة]?|وقف[هة]|موقوفا?|لين|واهي?|مقال|شاذ|غلط|مدرج' +
    ')(?=[\\s.،؛:«»]|$)|لا يصح|لم يصح|لا يثبت|فيه نظر',
);
function weakBulugh(body) {
  const t = plain(body).replace(/[,;]/g, m => (m === ',' ? '،' : '؛'));
  const first = bulughFirst(t);
  // A leading "ول…" has no "رواه" of its own: his words after the report are read whole.
  const rest = first ? t.slice(first.at) : t;
  const turn = rest.slice(1).search(/[.،؛»] و(?:ل(?:ل|مسلم|ابي|ابن|احمد|هما |ه )|في رواي|في لفظ|زاد |عند )/);
  const said = (turn < 0 ? rest : rest.slice(0, turn + 1)).replace(/لم يضعفه/g, ' ');
  return BULUGH_WEAK.test(said);
}
// attribution-rule:end

/** The hadith itself: what stands before the compiler's attribution. */
function report(body) {
  const t = plain(body);
  const cut = [t.search(AGREED), t.search(REPORTED)].filter(i => i >= 0);
  return cut.length ? t.slice(0, Math.min(...cut)) : t;
}

// ── The input ──────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(url, params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'MihrabHadithPacks/1.0 (github.com/MihrabHQ/Mihrab)' },
      body: new URLSearchParams({ format: 'json', ...params }),
    });
    if (res.ok) return res.json();
    await sleep(30_000 * (attempt + 1));
  }
  throw new Error(`${url} would not answer`);
}

/** A source that is one JSON file, cached like the rest. */
async function fetched(input) {
  const file = path.join(CACHE, input.cache);
  // A source that is a book's text and not JSON is handed over as it is.
  const parsed = t => (input.text ? t : JSON.parse(t));
  if (fs.existsSync(file)) return parsed(fs.readFileSync(file, 'utf8'));
  const res = await fetch(input.url);
  if (!res.ok) throw new Error(`${input.url}: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  return parsed(text);
}

/** Every page of the book on Wikisource, as it stood when read: `{ title: { rev, ts, text } }`. */
async function wikisource(spec) {
  const file = path.join(CACHE, spec.cache);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const titles = [];
  let cont = {};
  for (;;) {
    const d = await api(spec.api, { action: 'query', list: 'allpages', apprefix: spec.title, aplimit: '500', ...cont });
    titles.push(...d.query.allpages.map(p => p.title));
    if (!d.continue) break;
    cont = d.continue;
    await sleep(4000);
  }
  const out = {};
  for (let i = 0; i < titles.length; i += 25) {
    const d = await api(spec.api, {
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|ids|timestamp',
      rvslots: 'main',
      titles: titles.slice(i, i + 25).join('|'),
    });
    for (const p of Object.values(d.query.pages)) {
      const r = p.revisions[0];
      out[p.title] = { rev: r.revid, ts: r.timestamp, text: r.slots.main['*'] };
    }
    await sleep(5000);
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

/** The numbered hadith of the pages: `Map<number, text>`, the fuller where a number is met twice. */
function numbered(pages) {
  const items = new Map();
  for (const page of Object.values(pages)) {
    const t = page.text
      .replace(/\{\{صل\}\}/g, ' صلى الله عليه وسلم ')
      .replace(/\{\{[^{}]*\}\}/gs, '')
      .replace(/\{\{[^{}]*\}\}/gs, '')
      .replace(/<[^>]+>/g, '')
      .replace(/'''?/g, '')
      .replace(/\[\[[^\]]*\]\]/g, '');
    const parts = t.split(/^\s*(\d{1,4})\s*[-ـ–]\s*/m);
    for (let i = 1; i < parts.length - 1; i += 2) {
      const n = Number(parts[i]);
      const body = parts[i + 1].trim();
      if (!items.has(n) || body.length > items.get(n).length) items.set(n, body);
    }
  }
  return items;
}

/** A book whose hadith are paragraphs, each with its text in square brackets: `Map<count, paragraph>`, in order. */
function bracketed(pages, between = /\n\s*\n/) {
  const items = new Map();
  let n = 0;
  for (const page of Object.values(pages)) {
    const t = page.text
      .replace(/\{\{صل\}\}/g, ' صلى الله عليه وسلم ')
      .replace(/\{\{[^{}]*\}\}/gs, '')
      .replace(/\{\{[^{}]*\}\}/gs, '')
      .replace(/<[^>]+>/g, '')
      .replace(/'''?/g, '');
    for (const para of t.split(between)) {
      if (/^\s*==/.test(para)) continue;
      if (/\[[^\]]{12,}\]/s.test(para)) items.set(++n, para.trim());
    }
  }
  return items;
}

// ── 2. Our rows ────────────────────────────────────────────────────────

const read = file => JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8'));

/** A book's rows as words, and which rows hold each word. */
function indexed(rows, textOf) {
  const W = rows.map(r => words(textOf(r)));
  const where = new Map();
  W.forEach((w, i) => {
    for (const x of new Set(w)) {
      let l = where.get(x);
      if (!l) where.set(x, (l = []));
      l.push(i);
    }
  });
  const idf = new Map([...where].map(([x, l]) => [x, Math.log(1 + rows.length / l.length)]));
  return { W, where, idf, n: rows.length };
}

/** The rows most likely to hold these words, best first: by the words they share, rare words counting most. */
function likely(w, book, most = 8) {
  const score = new Map();
  for (const x of new Set(w)) {
    const l = book.where.get(x);
    // A word in a fifth of the book says nothing of which row.
    if (!l || l.length > book.n / 5) continue;
    for (const i of l) score.set(i, (score.get(i) ?? 0) + book.idf.get(x));
  }
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, most).map(([i]) => i);
}

/**
 * `inOrder`, but within one stretch of the row no longer than the hadith
 * could fill. A row can be pages long (the story of Kaʿb ibn Mālik), and
 * seven words of a short hadith are found in their order SOMEWHERE in a
 * thousand words by chance; found within a stretch of their own length
 * and a little over, they are that hadith.
 */
function inOrderNear(a, b) {
  const span = Math.ceil(a.length * 1.6) + 8;
  if (b.length <= span) return inOrder(a, b);
  let best = 0;
  const step = Math.max(1, Math.floor(a.length / 2));
  for (let from = 0; from < b.length && best < 1; from += step) {
    best = Math.max(best, inOrder(a, b.slice(from, from + span)));
    if (from + span >= b.length) break;
  }
  return best;
}

function pair(w, book) {
  let best = null;
  for (const i of likely(w, book)) {
    const share = inOrderNear(w, book.W[i]);
    if (!best || share > best.share) best = { i, share };
  }
  return best;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const id = process.argv[2];
  const spec = COMPILATIONS[id];
  if (!spec) {
    console.error(`Which compilation? One of: ${Object.keys(COMPILATIONS).join(', ')}`);
    process.exit(1);
  }
  const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik'];
  /** One letter a book, in the index. `h`: no row of a book, the HadeethEnc entry alone. */
  const LETTER = { bukhari: 'b', muslim: 'm', abudawud: 'd', tirmidhi: 't', nasai: 'n', ibnmajah: 'j', malik: 'k' };
  const SAHIHAYN = ['bukhari', 'muslim'];
  for (const f of [...BOOKS.map(b => `books/${b}.json`), 'henc/all/ar.json']) {
    if (!fs.existsSync(path.join(PACKS, f))) {
      console.error(`No ${f} in build/hadith/v1. Run: node scripts/hadith/build-packs.js`);
      process.exit(1);
    }
  }
  const REVIEW = process.argv.includes('--review');

  const source = spec.input.wikisource
    ? await wikisource({ title: spec.input.wikisource, cache: spec.input.cache, api: 'https://ar.wikisource.org/w/api.php' })
    : await fetched(spec.input);
  const items = spec.items(source);
  const of = spec.of ?? items.size;
  const attributionOf = spec.attribution ?? attribution;
  const reportOf = spec.report ?? report;
  // Only where the compiler's own sentence follows the hadith is there a verdict of his to hear.
  const weakOf = spec.weak ?? (spec.attribution ? () => false : saysWeak);

  // The packs as they are served: the two Ṣaḥīḥs whole, and of the five
  // graded books only the rows every grader calls sound. A hadith paired
  // with a row here is paired with a row the app serves.
  const books = {};
  let asOf = '';
  for (const b of BOOKS) {
    const f = read(`books/${b}.json`);
    asOf = asOf || f.retrieved;
    books[b] = { ...indexed(f.hadiths, r => r[1]), rows: f.hadiths };
  }
  // A row's place in Open-Hadith-Data's file: its own where the pack says, where it stands otherwise.
  const placeOf = (row, at) => (typeof row[2] === 'number' ? row[2] : at);

  // HadeethEnc's Arabic entries, to be shown in translation: every one of
  // them is served, and those from the two Ṣaḥīḥs are marked (`s`).
  const henc = read('henc/all/ar.json');
  const hencAll = { entries: henc.entries, ...indexed(henc.entries, e => e.h) };
  const sahihEntries = henc.entries.filter(e => e.s === 1);
  const hencSahih = { entries: sahihEntries, ...indexed(sahihEntries, e => e.h) };

  const rows = [];
  const left = { elsewhere: 0, saidWeak: 0, notFound: 0, tooShort: 0, noText: of - items.size };
  const review = [];
  const signed = new Map((SIGNED[id] ?? []).map(s => [s.n, s]));
  const signedFor = [];
  for (const n of [...items.keys()].sort((a, b) => a - b)) {
    const body = items.get(n);
    const named = attributionOf(body);
    if (!named.length) {
      left.elsewhere++;
      continue;
    }
    if (weakOf(body)) {
      left.saidWeak++;
      continue;
    }
    // Signed for by a person who read the two: the row named, held to the
    // rule (`signedRow`). Whether the measure would have found it is not asked.
    if (signed.has(n)) {
      const sig = signed.get(n);
      rows.push([n, LETTER[sig.book], signedRow(sig, named, books[sig.book]), null]);
      signedFor.push(n);
      continue;
    }
    // The report, and the report from where its narrator starts to speak:
    // an-Nawawī gives ʿUmar his whole lineage in the book's first hadith,
    // twenty words no chain of ours has, and the hadith itself is all there.
    const said = reportOf(body);
    const spoken = said.search(/(?:^|\s)(?:قال|قالت|سمعت|يقول)[\s:،]/);
    const tellings = [words(said), ...(spoken > 0 ? [words(said.slice(spoken))] : [])].filter(t => t.length >= MIN_WORDS);
    if (!tellings.length) {
      left.tooShort++;
      continue;
    }
    // In any book he names: one that has it is enough (the policy's
    // clause), and one of the two Ṣaḥīḥs before a Sunan where both do.
    let best = null;
    let w = tellings[0];
    for (const t of tellings) {
      for (const b of named) {
        const p = pair(t, books[b]);
        if (!p || p.share < PAIR_AT) continue;
        const better =
          !best || (SAHIHAYN.includes(b) && !SAHIHAYN.includes(best.book)) || (SAHIHAYN.includes(b) === SAHIHAYN.includes(best.book) && p.share > best.share);
        if (better) {
          best = { ...p, book: b };
          w = t;
        }
      }
    }
    // The same hadith in HadeethEnc: its words in ours and ours in its,
    // each way. Of a hadith he gives to the two Ṣaḥīḥs, an entry
    // HadeethEnc gives to them too.
    const pool = named.some(b => SAHIHAYN.includes(b)) ? hencSahih : hencAll;
    let hencId = null;
    for (const t of tellings) {
      const h = pair(t, pool);
      if (h && h.share >= HENC_AT && inOrder(pool.W[h.i], t) >= HENC_AT) {
        hencId = pool.entries[h.i].id;
        break;
      }
    }
    if (!best && !hencId) {
      left.notFound++;
      continue;
    }
    if (best) {
      const row = books[best.book].rows[best.i];
      rows.push([n, LETTER[best.book], placeOf(row, best.i), hencId]);
      review.push({ n, book: best.book, share: best.share, hencId, said: w.join(' '), ours: books[best.book].W[best.i].join(' ') });
    } else {
      // No row of a book could be told for it, and HadeethEnc holds the
      // hadith itself: served as that entry, which is graded in its own right.
      rows.push([n, 'h', 0, hencId]);
    }
  }

  const out = {
    note: `The hadith of ${id} its compiler attributes to one of the seven books the app serves, each as [his number, the book (b al-Bukhari, m Muslim, d Abu Dawud, t at-Tirmidhi, n an-Nasa'i, j Ibn Majah, k Malik; h none, the HadeethEnc entry alone), the row's place in Open-Hadith-Data's file, the HadeethEnc entry that is the same hadith or null]. Written by scripts/hadith/build-compilation.js; do not edit.`,
    id,
    asOf,
    of,
    numbered: spec.numbered,
    ...(spec.own ? { own: true } : null),
    rule: `first attribution names a book the app serves; a row of it holds ${PAIR_AT} of the hadith's words in order and close together — or a person read the two and signed the pairing (scripts/hadith/signed-pairings.json)`,
    signed: signedFor,
    left,
    rows,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify(out, null, 1).replace(/\[\n\s+(\d+),\n\s+"([a-z])",\n\s+(\d+),\n\s+(null|"\d+")\n\s+\]/g, '[$1, "$2", $3, $4]')}\n`,
  );
  const withHenc = rows.filter(r => r[3]).length;
  const by = {};
  for (const r of rows) by[r[1]] = (by[r[1]] ?? 0) + 1;
  for (const n of signed.keys()) if (!signedFor.includes(n)) throw new Error(`signed-pairings.json: ${id} no. ${n} is not a hadith the text read has, or its compiler calls it weak or attributes it elsewhere`);
  if (signedFor.length) console.log(`signed for by a person, not measured: ${signedFor.join(', ')}`);
  console.log(
    `${id}: ${items.size} of ${of} read · ${rows.length} served (${withHenc} with a HadeethEnc entry; ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}) · left out: ${left.elsewhere} attributed elsewhere, ${left.saidWeak} he calls weak, ${left.notFound} not found with confidence, ${left.tooShort} too short to tell, ${left.noText} not in the text read`,
  );
  console.log(`wrote ${path.relative(ROOT, file)}`);

  if (REVIEW) {
    // The least sure of what was paired, and a spread of the rest: for a person to read.
    const byShare = [...review].sort((a, b) => a.share - b.share);
    const graded = byShare.filter(r => r.book !== 'bukhari' && r.book !== 'muslim');
    const pick = [
      ...byShare.slice(0, 12),
      // The graded books' least sure, read apart: a wrong row there would carry another hadith's grade.
      ...graded.slice(0, 10),
      ...byShare.filter((_, i) => i % Math.ceil(byShare.length / 12) === 0),
    ];
    for (const r of pick) {
      console.log(`\n#${r.n} → ${r.book} (${r.share.toFixed(2)})${r.hencId ? ` · HadeethEnc ${r.hencId}` : ''}`);
      console.log(`  his:  ${r.said.slice(0, 170)}`);
      console.log(`  ours: …${r.ours.slice(-170)}`);
    }
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
module.exports = { indexed, pair, signedRow, SIGNED, attribution, attributionAround, attributionLed, reportLed, attributionTawhid, attributionBulugh, reportBulugh, weakBulugh, saysWeak, report, inOrder, inOrderNear, words, fold, PAIR_AT, MIN_WORDS };
