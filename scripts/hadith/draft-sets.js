#!/usr/bin/env node
/**
 * A shortlist for each Learn set, for a person to choose from.
 *
 *   node scripts/hadith/draft-sets.js           # writes docs/hadith/learn-sets-draft.md
 *   node scripts/hadith/draft-sets.js --write   # and the shortlist into src/hadith/sets.json
 *
 * Learn's sets were whole HadeethEnc topics: "Foundations of faith" was
 * 156 hadith in English and "Worship in detail" 750, while "Family and
 * neighbours" was 12 — and 4 in Swedish. A set meant to be read through
 * wants to be a few dozen, chosen and put in order.
 *
 * Choosing is not this script's to do. It narrows each topic by rules
 * that can be checked, and prints what is left with what a chooser needs
 * beside each row.
 *
 * WHAT THE APP SHOWS. Each set's `ids` in src/hadith/sets.json — and until
 * a person has settled a set, those are this script's shortlist
 * (`--write`), marked `"chosenBy": "rules"`. A set a person has settled
 * says `"chosenBy": "<who>"` and is never written over by this script.
 *
 * The rules, in order:
 *   1. In the set's topics, as now.
 *   2. Reported by al-Bukhārī or Muslim (HadeethEnc's own attribution; the
 *      packs' `s` flag, scripts/hadith/build-packs.js). Where fewer than
 *      THIN of a set's topic pass, the rule is dropped for that set: every
 *      entry is one HadeethEnc grades authentic or good.
 *   3. Short enough to read in one sitting: MAX_CHARS of English.
 *   4. Spread over the topic's branches: no branch takes more than its share.
 *   5. Among those, the ones translated into the most of the app's thirteen
 *      languages first — a reader in Swedish or German is otherwise shown
 *      English for most of a set.
 *   6. One row a title: HadeethEnc sometimes holds a hadith twice.
 *
 * Reads the packs in build/hadith/v1 (scripts/hadith/build-packs.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PACKS = path.join(ROOT, 'build', 'hadith', 'v1');
const OUT = path.join(ROOT, 'docs', 'hadith', 'learn-sets-draft.md');
const SETS = require(path.join(ROOT, 'src', 'hadith', 'sets.json'));
const EN = require(path.join(ROOT, 'src', 'i18n', 'locales', 'en.json')).hadith;

const LANGS = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];
const MAX_CHARS = 600;
const TARGET = { starting: 25, building: 25, depth: 40 };
/** A set with fewer than this passing rule 2 takes its topic whole (rule 2 dropped), up to its target. */
const THIN = 8;
const WRITE = process.argv.includes('--write');

const read = file => JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8'));

function main() {
  if (!fs.existsSync(path.join(PACKS, 'manifest.json'))) {
    console.error('No packs in build/hadith/v1. Run: node scripts/hadith/build-packs.js');
    process.exit(1);
  }
  const cats = read('categories/en.json').items;
  const title = new Map(cats.map(c => [c[0], c[2]]));
  const kids = new Map();
  for (const c of cats) kids.set(c[1] ?? '', [...(kids.get(c[1] ?? '') ?? []), c[0]]);
  const within = id => {
    const out = new Set([id]);
    const stack = [id];
    while (stack.length) for (const k of kids.get(stack.pop()) ?? []) if (!out.has(k)) (out.add(k), stack.push(k));
    return out;
  };

  const packs = new Map();
  const pack = (name, lang) => {
    const key = `${name}/${lang}`;
    if (!packs.has(key)) packs.set(key, new Map(read(`henc/${name}/${lang}.json`).entries.map(e => [e.id, e])));
    return packs.get(key);
  };

  const lines = [
    '# Learn sets: a shortlist to choose from',
    '',
    '> **For review.** Written by `node scripts/hadith/draft-sets.js` from the packs in',
    '> `build/hadith/v1`; edit the script, not the file. **The app shows these lists**',
    '> (`ids` in `src/hadith/sets.json`, `"chosenBy": "rules"`) until a person has settled',
    '> each set.',
    '',
    "Learn's sets were whole HadeethEnc topics. That made \"Foundations of faith\" 156",
    'hadith and "Worship in detail" 750, and "Family and neighbours" 12 — or 4, read in',
    'Swedish. A set that is meant to be read through wants a few dozen hadith, chosen by',
    'someone qualified to choose and put in an order that teaches.',
    '',
    '**This is not that choice.** It is each topic narrowed by rules a script can check, so',
    'the person choosing starts from a page instead of from 750 rows:',
    '',
    '1. In the topics the set already covers (`src/hadith/sets.json`).',
    "2. Reported by al-Bukhārī or Muslim, by HadeethEnc's own attribution — dropped for a",
    `   set where fewer than ${THIN} would pass (it says so under its heading).`,
    `3. No longer than ${MAX_CHARS} characters in English.`,
    "4. Spread over the topic's branches, so one branch does not fill the set.",
    "5. Among those, the hadith translated into the most of the app's thirteen languages",
    '   first. **Sv** says whether Swedish is one of them.',
    '6. One row a title: where HadeethEnc holds a hadith twice, the better-translated entry.',
    '',
    `Up to ${TARGET.starting} for a "Starting out" set, ${TARGET.building} for "Building familiarity", ${TARGET.depth} for "In depth".`,
    'The order within a set is HadeethEnc\'s, branch by branch; it has not been arranged.',
    '',
    'To review: strike what should not be in a set, add what is missing (any HadeethEnc id',
    'will do), and reorder. Put the settled ids in that set\'s `ids` in `sets.json` and',
    'change its `"chosenBy"` from `"rules"` to who chose: this script then leaves it alone.',
    '',
    'Texts and attributions: [HadeethEnc.com](https://hadeethenc.com), unmodified.',
    '',
  ];

  const summary = [];
  const chosen = new Map();
  for (const set of SETS.sets) {
    if (!set.categories) continue;
    const en = pack('all', 'en');
    const wanted = new Set();
    const branchOf = new Map();
    for (const top of set.categories) {
      for (const id of within(top)) {
        wanted.add(id);
        if (!branchOf.has(id)) branchOf.set(id, top);
      }
    }
    const inSet = [...en.values()].filter(e => e.c.some(c => wanted.has(c)));
    const langsOf = e => LANGS.filter(l => pack('all', l).has(e.id));
    const short = inSet.filter(e => e.h.length <= MAX_CHARS);
    const sahihayn = short.filter(e => e.s === 1);
    const thin = sahihayn.length < THIN;
    const passing = (thin ? short : sahihayn)
      .map((e, order) => ({ e, order, langs: langsOf(e), branch: branchOf.get(e.c.find(c => wanted.has(c))) }));
    // The encyclopedia sometimes holds one hadith twice ("Islam is built on
    // five", from two narrators' entries): one row a title, the better-translated.
    const byTitle = new Map();
    for (const p of passing) {
      const held = byTitle.get(p.e.t);
      if (!held || p.langs.length > held.langs.length) byTitle.set(p.e.t, p);
    }
    const pool = passing.filter(p => byTitle.get(p.e.t) === p);

    const target = TARGET[set.level];
    const branches = set.categories.filter(b => pool.some(p => p.branch === b));
    const share = Math.ceil(target / Math.max(1, branches.length));
    const picked = [];
    // Each branch's best-covered hadith, up to its share; then what room is left, best-covered first.
    for (const b of branches) {
      picked.push(
        ...pool
          .filter(p => p.branch === b)
          .sort((x, y) => y.langs.length - x.langs.length || x.order - y.order)
          .slice(0, share),
      );
    }
    const rest = pool
      .filter(p => !picked.includes(p))
      .sort((x, y) => y.langs.length - x.langs.length || x.order - y.order);
    while (picked.length < target && rest.length) picked.push(rest.shift());
    picked.length = Math.min(picked.length, target);
    picked.sort((x, y) => branches.indexOf(x.branch) - branches.indexOf(y.branch) || x.order - y.order);

    const all13 = picked.filter(p => p.langs.length === LANGS.length).length;
    const inSv = picked.filter(p => p.langs.includes('sv')).length;
    summary.push([EN.set[set.id].title, EN.level[set.level], inSet.length, pool.length, picked.length, all13, inSv]);

    chosen.set(set.id, picked.map(p => p.e.id));
    lines.push(`## ${EN.set[set.id].title}`, '');
    if (thin) {
      lines.push(
        `> Only ${sahihayn.length} of this topic are reported by al-Bukhārī or Muslim: rule 2 is dropped for this set.`,
        '',
      );
    }
    lines.push(
      `*${EN.level[set.level]}* · \`${set.id}\` · today: **${inSet.length}** hadith in English · pass rules 2–3: **${pool.length}** · shortlisted: **${picked.length}** (${all13} in all thirteen languages, ${inSv} in Swedish)`,
      '',
    );
    if (picked.length < Math.min(target, 12)) {
      lines.push(
        `> Thin: only ${picked.length} pass the rules. This set needs hadith from outside its present topics, or the rules relaxed for it.`,
        '',
      );
    }
    lines.push('| # | HadeethEnc | Hadith | Reported by | Languages | Sv | Branch |', '|---:|---|---|---|---:|:-:|---|');
    picked.forEach((p, i) => {
      const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
      lines.push(
        `| ${i + 1} | [${p.e.id}](https://hadeethenc.com/en/browse/hadith/${p.e.id}) | ${cell(p.e.t)} | ${cell(p.e.a)} | ${p.langs.length}/13 | ${p.langs.includes('sv') ? 'yes' : '—'} | ${cell(title.get(p.branch))} |`,
      );
    });
    lines.push('');
  }

  const head = [
    '## At a glance',
    '',
    '| Set | Level | Today (en) | Pass rules 2–3 | Shortlisted | In all 13 | In Swedish |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...summary.map(r => `| ${r.join(' | ')} |`),
    '',
    "an-Nawawi's Forty and the two books are not listed: the first is an-Nawawi's own",
    'choice and order, and the books are whole.',
    '',
  ];
  const at = lines.indexOf('Texts and attributions: [HadeethEnc.com](https://hadeethenc.com), unmodified.') + 2;
  lines.splice(at, 0, ...head);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
  if (WRITE) writeSets(chosen);
  for (const r of summary) console.log(`  ${String(r[0]).padEnd(24)} ${r[4]} shortlisted of ${r[2]} (${r[5]} in all 13, ${r[6]} in sv)`);
}

/** sets.json, a set a line, with the shortlist in every set no person has settled. */
function writeSets(chosen) {
  const sets = SETS.sets.map(set => {
    const ids = chosen.get(set.id);
    if (!ids || (set.chosenBy && set.chosenBy !== 'rules')) return set;
    return { ...set, ids, chosenBy: 'rules' };
  });
  const row = v => `    ${JSON.stringify(v).replace(/([:,])(?=["\[{0-9a-z])/g, '$1 ')}`;
  const out = [
    '{',
    '  "sets": [',
    sets.map(row).join(',\n'),
    '  ],',
    '  "hubs": [',
    SETS.hubs.map(row).join(',\n'),
    '  ],',
    `  "nawawiReviewed": ${JSON.stringify(SETS.nawawiReviewed, null, 2).replace(/\n/g, '\n  ')},`,
    `  "roots": ${JSON.stringify(SETS.roots)},`,
    `  "books": ${JSON.stringify(SETS.books)}`,
    '}',
    '',
  ].join('\n');
  const file = path.join(ROOT, 'src', 'hadith', 'sets.json');
  fs.writeFileSync(file, out);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

main();
