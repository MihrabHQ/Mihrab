#!/usr/bin/env node
/**
 * The set "Short hadith to memorise": the forty shortest hadith of
 * "Agreed upon" (`agreed-list.js` → src/hadith/agreed.json) — what
 * al-Bukhārī and Muslim both report, graded ṣaḥīḥ, in HadeethEnc's words.
 *
 *   node scripts/hadith/short-set.js           # prints the forty
 *   node scripts/hadith/short-set.js --write   # and writes the set's ids into src/hadith/sets.json
 *
 * Chosen by length and by nothing else: no hadith is weighed against
 * another here. Length is the Arabic entry's words of substance (the
 * measure `build-compilation.js` counts by: no blessings, no "عن … قال"),
 * a hadith needs FLOOR of them to be a saying and not a fragment, and one
 * filed twice is taken once. Shortest first; equal lengths in the order
 * the agreed-upon list has them.
 *
 * Reads the Arabic pack in build/hadith/v1 (scripts/hadith/build-packs.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { words } = require('./build-compilation.js');

const ROOT = path.join(__dirname, '..', '..');
const SETS_FILE = path.join(ROOT, 'src', 'hadith', 'sets.json');
const SET_ID = 'short';
const HOW_MANY = 40;
const FLOOR = 5;
const CHOSEN_BY = 'rule: the forty shortest of Agreed upon (scripts/hadith/short-set.js)';

const agreed = require(path.join(ROOT, 'src', 'hadith', 'agreed.json'));
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'hadith', 'v1', 'henc', 'all', 'ar.json'), 'utf8'));
const byId = new Map(pack.entries.map(e => [String(e.id), e]));
const list = (agreed.ids ?? agreed).map(String);

const seen = new Set();
const sized = [];
list.forEach((id, at) => {
  const e = byId.get(id);
  if (!e) return;
  const w = words(e.h);
  const key = w.join(' ');
  if (w.length < FLOOR || seen.has(key)) return;
  seen.add(key);
  sized.push({ id, at, n: w.length, title: e.t });
});
const chosen = sized.sort((a, b) => a.n - b.n || a.at - b.at).slice(0, HOW_MANY);
for (const c of chosen) console.log(`${String(c.n).padStart(3)}  ${c.id.padEnd(6)} ${c.title}`);
console.log(`${chosen.length} of ${sized.length} agreed-upon hadith, ${chosen[0].n}–${chosen[chosen.length - 1].n} words of substance each`);

if (process.argv.includes('--write')) {
  // The file is a set a line, as `draft-sets.js` writes it: this line is put in, or put back, and no other is touched.
  const line = `    {"id": "${SET_ID}", "level": "starting", "ids": ${JSON.stringify(chosen.map(c => c.id)).replace(/,/g, ', ')}, "chosenBy": ${JSON.stringify(CHOSEN_BY)}},`;
  const lines = fs.readFileSync(SETS_FILE, 'utf8').split('\n');
  const mine = lines.findIndex(l => l.includes(`"id": "${SET_ID}"`));
  if (mine >= 0) lines[mine] = line;
  // After the sets a beginner is given, before the next level's.
  else lines.splice(lines.findIndex(l => /"level": "(?!starting)/.test(l)), 0, line);
  fs.writeFileSync(SETS_FILE, lines.join('\n'));
  console.log(`wrote ${path.relative(ROOT, SETS_FILE)}`);
}
