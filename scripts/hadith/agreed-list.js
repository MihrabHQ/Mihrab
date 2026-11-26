#!/usr/bin/env node
/**
 * The hadith HadeethEnc attributes to al-Bukhārī AND Muslim — "متفق عليه",
 * agreed upon — as a list the app offers under Look up.
 *
 *   node scripts/hadith/agreed-list.js                 # reads build/hadith/v1/henc/all/ar.json
 *   node scripts/hadith/agreed-list.js --pack <file>   # or this copy of that pack
 *   node scripts/hadith/agreed-list.js --check         # exits 1 if src/hadith/agreed.json is not what this writes
 *
 * Writes src/hadith/agreed.json: the ids, in the pack's order.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────
 *
 * An entry is listed when BOTH hold, of HadeethEnc's Arabic entry:
 *
 *   • its attribution is the two words "متفق عليه" and nothing else, and
 *   • its grade is the one word "صحيح".
 *
 * Read strictly, like every attribution and grade here (docs/hadith-policy.md).
 * "متفق عليه، واللفظ للبخاري" is agreed upon too, and so are the forty-odd
 * other ways HadeethEnc qualifies it ("…والرواية الثانية رواها مسلم",
 * "…لكنه عند البخاري من حديث أبي هريرة وعند مسلم من حديث عائشة", "متفق
 * عليه بمعناه، وهذا لفظ الترمذي"): some of those say the wording, some say
 * that a part of the entry is in one of the two only, and telling them
 * apart would be a reading of ours. Each of those entries is still in its
 * topics and in every search; a list titled "agreed upon" holds only the
 * ones where that is all HadeethEnc says.
 *
 * Nothing is weighed and nothing is the app's: this sorts HadeethEnc's
 * words. Every entry it lists is one the app already serves.
 *
 * One hadith entered twice is listed once (the first): the same Arabic,
 * four fifths of its words or more — `sameHadithTwice` in
 * src/hadith/library.ts, the rule a search uses.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'src', 'hadith', 'agreed.json');
const args = process.argv.slice(2);
const at = args.indexOf('--pack');
const PACK = at >= 0 ? args[at + 1] : path.join(ROOT, 'build', 'hadith', 'v1', 'henc', 'all', 'ar.json');
const CHECK = args.includes('--check');

// agreed-rule:start
const AGREED = 'متفق عليه';
const SAHIH = 'صحيح';
/** Without vowel signs and tatweel, and without the full stop some entries end on. */
const bare = s =>
  String(s ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]$/, '')
    .trim();
function agreedUpon(entry) {
  return bare(entry.a) === AGREED && bare(entry.g) === SAHIH;
}
// agreed-rule:end

const fold = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const words = e => new Set(fold(e.h).split(' ').filter(Boolean));
function sameTwice(x, y) {
  if (x.size < 6 || y.size < 6) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.8;
}

function main() {
  if (!fs.existsSync(PACK)) {
    console.error(`No Arabic pack at ${PACK}. Run node scripts/hadith/build-packs.js, or pass --pack <file>.`);
    process.exit(1);
  }
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  const kept = [];
  let twice = 0;
  for (const e of pack.entries) {
    if (!agreedUpon(e)) continue;
    const w = words(e);
    if (kept.some(k => sameTwice(k.w, w))) {
      twice++;
      continue;
    }
    kept.push({ id: e.id, w });
  }
  const file = {
    note:
      'HadeethEnc entries its Arabic attribution calls agreed upon (متفق عليه, and nothing else) and its Arabic grade ṣaḥīḥ. Written by scripts/hadith/agreed-list.js; do not edit.',
    asOf: pack.retrieved,
    ids: kept.map(k => k.id),
  };
  const text = `${JSON.stringify(file, null, 1)}\n`;
  console.log(`${pack.entries.length} entries · ${kept.length} agreed upon · ${twice} entered twice and listed once`);
  if (CHECK) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text) {
      console.error('src/hadith/agreed.json is not what this writes. Run node scripts/hadith/agreed-list.js');
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) main();
module.exports = { agreedUpon, bare };
