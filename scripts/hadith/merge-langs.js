#!/usr/bin/env node
/**
 * Add HadeethEnc languages built elsewhere to the packs that are published.
 *
 *   node scripts/hadith/merge-langs.js /path/to/other/build/hadith/v1            # says what it would add
 *   node scripts/hadith/merge-langs.js /path/to/other/build/hadith/v1 --write    # adds it
 *
 * `build-packs.js` writes today's date into every pack it builds, so a
 * language built again is a different file with the same hadith in it —
 * and a pack whose SHA-256 changes in the manifest is downloaded again by
 * every device that holds it (`src/hadith/packUpdates.ts`). The fifty-nine
 * languages added after the app's thirteen were therefore built in a tree
 * of their own, and this brings ONLY them across:
 *
 *   • a language the manifest here already names is left exactly as it
 *     is — its pack, its topic names and its manifest entry are not read
 *     from the other tree, let alone written;
 *   • a new language's two files (`henc/all/<lang>.json`,
 *     `categories/<lang>.json`) are copied, and each must be the file the
 *     other tree's manifest names, by SHA-256, or nothing is written;
 *   • a new pack must hold no entry `src/hadith/withheld.json` withholds:
 *     what is not served in Arabic is not served in translation.
 *
 * Nothing is uploaded here. `upload-packs.sh --dry-run` then lists what
 * would go up, and skips every asset whose SHA-256 is already there.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HERE = path.join(ROOT, 'build', 'hadith', 'v1');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** What to bring across: `{ add: [{ lang, files: [{ rel, from, entry, slot }] }], kept: [langs] }`. Throws on a file that is not its manifest's. */
function plan(here, there, hereDir, thereDir, withheld = []) {
  const kept = Object.keys(here.henc.all.langs);
  const add = [];
  for (const lang of Object.keys(there.henc.all.langs)) {
    if (here.henc.all.langs[lang] || here.categories[lang]) continue;
    const files = [
      { rel: `henc/all/${lang}.json`, entry: there.henc.all.langs[lang], slot: 'henc' },
      { rel: `categories/${lang}.json`, entry: there.categories[lang], slot: 'categories' },
    ];
    for (const f of files) {
      f.from = path.join(thereDir, f.rel);
      if (!f.entry) throw new Error(`${lang}: the other manifest does not name ${f.rel}`);
      if (!fs.existsSync(f.from)) throw new Error(`${lang}: no ${f.rel} in ${thereDir}`);
      if (sha(f.from) !== f.entry.sha256) throw new Error(`${f.rel} is not the file its manifest names`);
      if (fs.statSync(f.from).size !== f.entry.bytes) throw new Error(`${f.rel} is not the size its manifest names`);
    }
    const pack = JSON.parse(fs.readFileSync(files[0].from, 'utf8'));
    const held = new Set(withheld.map(String));
    const bad = pack.entries.filter(e => held.has(String(e.id)));
    if (bad.length) throw new Error(`${lang}: holds ${bad.length} entr${bad.length === 1 ? 'y' : 'ies'} that are withheld (${bad[0].id})`);
    add.push({ lang, files });
  }
  return { add, kept };
}

function main() {
  const thereDir = process.argv[2];
  const write = process.argv.includes('--write');
  if (!thereDir || !fs.existsSync(path.join(thereDir, 'manifest.json'))) {
    console.error('usage: node scripts/hadith/merge-langs.js <other build/hadith/v1> [--write]');
    process.exit(1);
  }
  const manifestFile = path.join(HERE, 'manifest.json');
  const here = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const there = JSON.parse(fs.readFileSync(path.join(thereDir, 'manifest.json'), 'utf8'));
  const withheld = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'hadith', 'withheld.json'), 'utf8'));
  const ids = withheld.henc;
  if (!Array.isArray(ids)) throw new Error('src/hadith/withheld.json names no entries: its shape changed');
  // What is published, entry by entry: each must come out as it went in.
  const sections = m => ({ henc: m.henc.all.langs, categories: m.categories, books: m.books });
  const snapshot = m => Object.entries(sections(m)).flatMap(([name, sec]) => Object.keys(sec).map(k => [`${name}/${k}`, JSON.stringify(sec[k])]));
  const before = snapshot(here);
  const nawawiBefore = JSON.stringify(here.nawawi);
  const p = plan(here, there, HERE, thereDir, ids);
  let bytes = 0;
  for (const { lang, files } of p.add) {
    for (const f of files) {
      bytes += f.entry.bytes;
      if (!write) continue;
      const to = path.join(HERE, f.rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(f.from, to);
      if (f.slot === 'henc') here.henc.all.langs[lang] = f.entry;
      else here.categories[lang] = f.entry;
    }
    console.log(`${write ? 'added' : 'would add'} ${lang}: ${files[0].entry.count} hadith, ${files.map(f => f.rel).join(' + ')}`);
  }
  if (write && p.add.length) {
    // The entries that were here are the entries that are here: only keys were added.
    const after = new Map(snapshot(here));
    const changed = before.filter(([k, v]) => after.get(k) !== v).map(([k]) => k);
    if (changed.length || JSON.stringify(here.nawawi) !== nawawiBefore) throw new Error(`an existing entry changed: nothing written (${changed.join(', ') || 'nawawi'})`);
    fs.writeFileSync(manifestFile, JSON.stringify(here));
  }
  console.log(`${p.add.length} language${p.add.length === 1 ? '' : 's'} (${(bytes / 1e6).toFixed(1)} MB) ${write ? 'added' : 'to add'}; ${p.kept.length} left as they are: ${p.kept.join(', ')}`);
}

if (require.main === module) main();
module.exports = { plan };
