#!/usr/bin/env node
/**
 * Where each book ("كتاب") of Ṣaḥīḥ al-Bukhārī and of Ṣaḥīḥ Muslim begins
 * among the rows the app serves.
 *
 *   node scripts/hadith/book-chapters.js            # writes src/hadith/chapters.json
 *
 * The two Ṣaḥīḥs were one list each: seven thousand rows and five
 * thousand, to be scrolled or searched. Their compilers divided them —
 * al-Bukhārī into ninety-seven books, Muslim into an introduction and
 * fifty-six — and that is how they are read, cited and taught.
 *
 * Open-Hadith-Data, whose text the packs carry, has the rows in the
 * books' order and no divisions. fawazahmed0/hadith-api has the divisions
 * (which hadith NUMBERS each book runs between) in its own edition, whose
 * numbering is not ours. So each row of ours is paired with the row of
 * theirs that shares its words (`pairRows`, book-grades.js — the pairing
 * the grades of the Sunan are carried across by), and a book begins at
 * the first of our rows that is in it and is followed by rows that are
 * (`STEADY`): one row paired a little out of place does not start a book.
 *
 * ONLY the divisions are taken — numbers. hadith-api's Arabic is read to
 * pair the rows and never written anywhere; its English names of the
 * books are not used (`src/hadith/chapterNames.json` is written here, by
 * hand, from the books' own Arabic names).
 *
 * A division is not a claim about a hadith: a row a book too early or too
 * late is still the same hadith, graded the same. The script refuses to
 * write unless every book is found, in order, and says how many paired
 * rows stand on the wrong side of a boundary.
 *
 * Reads build/hadith/v1/books and, cached under scripts/hadith/.cache,
 * hadith-api's Arabic editions of the two books.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pairRows } = require('./book-grades.js');

const ROOT = path.join(__dirname, '..', '..');
const PACKS = path.join(ROOT, 'build', 'hadith', 'v1');
const CACHE = path.join(__dirname, '.cache');
const OUT = path.join(ROOT, 'src', 'hadith', 'chapters.json');
const API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const BOOKS = ['bukhari', 'muslim'];
/** Of the next three paired rows after a book's first, how many must be in it or after it. */
const STEADY = 2;

/** `{ sections, details, hadiths: [[number, section, text]] }`: the edition, less everything not read here. */
async function edition(book) {
  const file = path.join(CACHE, `hadith-api-sections-${book}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(`${API}/ara-${book}.min.json`);
  if (!res.ok) throw new Error(`${book}: ${res.status}`);
  const d = await res.json();
  const out = {
    sections: d.metadata.sections,
    details: d.metadata.section_details,
    hadiths: d.hadiths.map(h => [h.hadithnumber, h.reference?.book ?? null, h.text]),
  };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

/**
 * The first of our rows in each book, in the books' order:
 * `{ first, starts }` — `first` the number of the first book (Muslim's
 * introduction is 0), `starts[i]` the place of the first row of book
 * `first + i`. Throws where a book is not found or the books are out of order.
 */
function divide(ours, api) {
  const theirs = api.hadiths.filter(h => h[2]);
  const pairs = pairRows(ours.map(r => r[1]), theirs.map(h => h[2]));
  // By the hadith's NUMBER and the ranges the edition gives: its own
  // per-hadith book field says 0 of every row that is a remark.
  const ranges = Object.entries(api.details)
    .map(([k, d]) => [Number(k), d.hadithnumber_first, d.hadithnumber_last])
    .filter(r => r[2] > 0)
    .sort((a, b) => a[0] - b[0]);
  const bookOf = n => {
    for (const [k, from, to] of ranges) if (n >= from && n <= to) return k;
    return null;
  };
  const book = pairs.map(p => (p ? bookOf(theirs[p.at][0]) : null));

  const at = [];
  let from = 0;
  for (const [k] of ranges) {
    let found = -1;
    for (let i = from; i < book.length && found < 0; i++) {
      if (book[i] !== k) continue;
      let seen = 0;
      let steady = 0;
      for (let j = i + 1; j < book.length && seen < 3; j++) {
        if (book[j] == null) continue;
        seen++;
        if (book[j] >= k) steady++;
      }
      if (steady >= Math.min(STEADY, seen)) found = i;
    }
    if (found < 0) throw new Error(`book ${k} was not found among our rows`);
    at.push(found);
    from = found;
  }
  for (let i = 1; i < at.length; i++) if (at[i] <= at[i - 1]) throw new Error(`book ${ranges[i][0]} does not begin after the one before it`);
  for (let i = 0; i < ranges.length; i++) if (ranges[i][0] !== ranges[0][0] + i) throw new Error('the books are not numbered one after another');

  let astray = 0;
  let paired = 0;
  at.forEach((start, x) => {
    const end = x + 1 < at.length ? at[x + 1] : book.length;
    for (let j = start; j < end; j++) {
      if (book[j] == null) continue;
      paired++;
      if (book[j] !== ranges[x][0]) astray++;
    }
  });
  // A row's place in Open-Hadith-Data's file: its own where the pack says, where it stands otherwise.
  const placeOf = i => (typeof ours[i][2] === 'number' ? ours[i][2] : i);
  // The rows before the first book found belong to it (two rows of Muslim's introduction that pair with nothing).
  const starts = at.map((i, x) => (x === 0 ? 0 : placeOf(i)));
  return { first: ranges[0][0], starts, paired, astray, rows: ours.length };
}

async function main() {
  const out = { note: '', asOf: '', books: {} };
  for (const b of BOOKS) {
    const pack = JSON.parse(fs.readFileSync(path.join(PACKS, 'books', `${b}.json`), 'utf8'));
    const d = divide(pack.hadiths, await edition(b));
    out.asOf = out.asOf || pack.retrieved;
    out.books[b] = { first: d.first, starts: d.starts };
    console.log(`${b}: ${d.starts.length} books over ${d.rows} rows · ${d.astray} of ${d.paired} paired rows on the wrong side of a boundary`);
  }
  out.note =
    'Where each book of Sahih al-Bukhari and Sahih Muslim begins: `starts[i]` is the place, in Open-Hadith-Data\'s file, of the first row of book `first + i`. Written by scripts/hadith/book-chapters.js; do not edit. The names are src/hadith/chapterNames.json.';
  fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
module.exports = { divide, STEADY };
