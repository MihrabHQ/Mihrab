#!/usr/bin/env node
/**
 * "See it in Sahih al-Bukhari": for a HadeethEnc entry, the row of
 * al-Bukhārī's or Muslim's own text that is the same hadith.
 *
 *   node scripts/hadith/see-in-book.js            # writes src/hadith/seeInBook.json
 *   node scripts/hadith/see-in-book.js --review   # and prints the least sure pairs, to be read
 *
 * HadeethEnc gives a hadith in translation, with its explanation, and
 * says where it is from ("متفق عليه", "رواه مسلم"); the two Ṣaḥīḥs are in
 * the app in Arabic, whole, with their chains. This joins the two for a
 * reader who wants the hadith as its collector has it. It is a way from
 * one served text to another and carries nothing across: each is served
 * on its own standing (docs/hadith-policy.md), and the grade shown on
 * either is unchanged.
 *
 * By the rule of `build-compilation.js`, whose reading of an attribution
 * and whose measure these are:
 *
 *   • The BOOK is the one HadeethEnc's own attribution names first — its
 *     words, read strictly. An entry it qualifies ("the first narration…")
 *     or gives to another book is left out.
 *   • The ROW is found with confidence or not at all: it holds PAIR_AT of
 *     the entry's words, in order and close together. Where both books
 *     are named, al-Bukhārī's row is taken if it passes, else Muslim's.
 *   • And it is the SAME COMPANION'S. The words of a hadith two Companions
 *     report are nearly the same, and a row that is Jābir's is not the
 *     hadith HadeethEnc gives from Abū Saʿīd (its entry 4547, the first
 *     pair this script was read on). An entry opens with its narrator, so
 *     its first two words of substance — "سعيد الخدري", "هريرة بينا" —
 *     must stand together in the row. A right pair this turns away is one
 *     hadith with no link; a wrong one it lets through would name a
 *     narrator the row does not have.
 *
 * The output holds numbers only: `{ "<entry id>": ["b" | "m", <the row's place>] }`.
 * Reads the packs in build/hadith/v1 (scripts/hadith/build-packs.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { attribution, indexed, pair, words, PAIR_AT, MIN_WORDS } = require('./build-compilation.js');

const ROOT = path.join(__dirname, '..', '..');
const PACKS = path.join(ROOT, 'build', 'hadith', 'v1');
const OUT = path.join(ROOT, 'src', 'hadith', 'seeInBook.json');
const LETTER = { bukhari: 'b', muslim: 'm' };

/** The entry's first two words of substance, together and in order, somewhere in the row. */
function sameNarrator(his, row) {
  for (let i = 0; i + 1 < row.length; i++) if (row[i] === his[0] && row[i + 1] === his[1]) return true;
  return false;
}

function main() {
  const read = f => JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
  for (const f of ['books/bukhari.json', 'books/muslim.json', 'henc/all/ar.json']) {
    if (!fs.existsSync(path.join(PACKS, f))) {
      console.error(`No ${f} in build/hadith/v1. Run: node scripts/hadith/build-packs.js`);
      process.exit(1);
    }
  }
  const books = {};
  for (const b of Object.keys(LETTER)) {
    const f = read(`books/${b}.json`);
    books[b] = { ...indexed(f.hadiths, r => r[1]), rows: f.hadiths };
  }
  const henc = read('henc/all/ar.json');
  const out = {};
  const left = { elsewhere: 0, tooShort: 0, notFound: 0 };
  const review = [];
  for (const e of henc.entries) {
    // HadeethEnc's attribution, read as a compiler's: "رواه" is how most begin, "متفق عليه" the rest.
    const named = attribution(` ${e.a ?? ''}`).filter(b => LETTER[b]);
    // One sentence and no more: "…واللفظ للبخاري", "الرواية الأولى…" say more than which book.
    const plainly = /^\s*(?:متفق عليه|رواه (?:البخاري|مسلم)(?: ومسلم)?)\s*\.?\s*$/.test(String(e.a ?? '').normalize('NFD').replace(/[ً-ٰٟ]/g, ''));
    if (!named.length || !plainly) {
      left.elsewhere++;
      continue;
    }
    const w = words(e.h);
    if (w.length < MIN_WORDS) {
      left.tooShort++;
      continue;
    }
    let best = null;
    for (const b of named) {
      const p = pair(w, books[b]);
      if (p && p.share >= PAIR_AT && sameNarrator(w, books[b].W[p.i])) {
        best = { ...p, book: b };
        break;
      }
    }
    if (!best) {
      left.notFound++;
      continue;
    }
    const row = books[best.book].rows[best.i];
    out[e.id] = [LETTER[best.book], typeof row[2] === 'number' ? row[2] : best.i];
    review.push({ id: e.id, book: best.book, share: best.share, his: w.join(' '), ours: books[best.book].W[best.i].join(' ') });
  }
  const ids = Object.keys(out).sort((a, b) => Number(a) - Number(b));
  const body = ids.map(id => ` "${id}": ["${out[id][0]}", ${out[id][1]}]`).join(',\n');
  const note =
    'For a HadeethEnc entry, the row of al-Bukhari (b) or Muslim (m) that is the same hadith: the book HadeethEnc names, the row found with confidence. Written by scripts/hadith/see-in-book.js; do not edit.';
  fs.writeFileSync(
    OUT,
    `{\n "note": ${JSON.stringify(note)},\n "asOf": ${JSON.stringify(henc.retrieved)},\n "rule": "attribution is one plain sentence naming al-Bukhari or Muslim; a row of it holds ${PAIR_AT} of the entry's words in order and close together",\n "left": ${JSON.stringify(left)},\n "rows": {\n${body}\n }\n}\n`,
  );
  console.log(
    `see-in-book: ${henc.entries.length} entries · ${ids.length} joined (b ${ids.filter(i => out[i][0] === 'b').length}, m ${ids.filter(i => out[i][0] === 'm').length}) · left out: ${left.elsewhere} attributed elsewhere or with a qualification, ${left.tooShort} too short to tell, ${left.notFound} not found with confidence`,
  );
  if (process.argv.includes('--review')) {
    const byShare = [...review].sort((a, b) => a.share - b.share);
    for (const r of [...byShare.slice(0, 14), ...byShare.filter((_, i) => i % Math.ceil(byShare.length / 10) === 0)]) {
      console.log(`\n${r.id} → ${r.book} (${r.share.toFixed(2)})\n  his:  ${r.his.slice(0, 190)}\n  ours: …${r.ours.slice(-190)}`);
    }
  }
}

main();
