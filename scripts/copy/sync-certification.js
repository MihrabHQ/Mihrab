#!/usr/bin/env node
/**
 * Brings mihrab-methods' record and its figure rules into this repository:
 *
 *   data/methods/certification.json  ← <source>/certification.json
 *   scripts/copy/figures.js          ← <source>/scripts/figures.mjs, as CommonJS
 *
 * so the site and the store listings quote the same numbers, computed the
 * same way, as the library's README. The build never fetches: both copies
 * are committed, and a change to either shows up in review beside the copy
 * it changes.
 *
 *   node scripts/copy/sync-certification.js ../mihrab-methods
 *   node scripts/copy/sync-certification.js https://raw.githubusercontent.com/MihrabHQ/mihrab-methods/main
 *
 * Then: node scripts/build-site.js && node scripts/build-copy.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CERT = path.join(ROOT, 'data', 'methods', 'certification.json');
const FIGURES = path.join(__dirname, 'figures.js');

async function read(source, rel) {
  if (/^https:\/\//.test(source)) {
    const res = await fetch(`${source.replace(/\/+$/, '')}/${rel}`);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(path.join(source, rel), 'utf-8');
}

/** figures.mjs → CommonJS: the same code, `export` dropped, one module.exports. */
function toCommonJs(mjs) {
  const names = [...mjs.matchAll(/^export (?:function|const|class) (\w+)/gm)].map(m => m[1]);
  if (!names.length) throw new Error('figures.mjs exports nothing');
  return (
    '/*\n' +
    " * GENERATED from mihrab-methods' scripts/figures.mjs by\n" +
    ' * scripts/copy/sync-certification.js — do not edit here; change it there\n' +
    ' * and sync, so the app quotes figures exactly as the library computes them.\n' +
    ' */\n' +
    mjs.replace(/^export /gm, '') +
    `\nmodule.exports = { ${names.join(', ')} };\n`
  );
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('usage: node scripts/copy/sync-certification.js <mihrab-methods checkout, or its raw base URL>');
    process.exit(2);
  }
  const cert = JSON.parse(await read(source, 'certification.json'));
  const figures = toCommonJs(await read(source, 'scripts/figures.mjs'));
  fs.writeFileSync(FIGURES, figures);
  // A record the generators cannot quote from is refused before it lands.
  delete require.cache[require.resolve('./figures')];
  const { total } = require('./figures').figures(cert);
  fs.mkdirSync(path.dirname(CERT), { recursive: true });
  fs.writeFileSync(CERT, `${JSON.stringify(cert, null, 2)}\n`);
  console.log(`✓ synced — ${total.certified}/${total.authorities} certified, ${total.off} of ${total.times} off, checked ${total.checkedAt}`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
