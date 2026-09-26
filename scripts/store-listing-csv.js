#!/usr/bin/env node
/**
 * Write the Play Console listing import from the same files F-Droid reads.
 *
 *   node scripts/store-listing-csv.js          # write the CSV
 *   node scripts/store-listing-csv.js --check  # exit 1 if it is out of date
 *
 * ── WHY ───────────────────────────────────────────────────────────────
 *
 * Play and F-Droid showed two different apps. F-Droid builds its listing
 * from `fastlane/metadata/android/<locale>/`; Play was filled in by
 * importing `branding/store/mihrab-play-store-listing.csv`, which had been
 * written separately and drifted — "The Muslim Companion" on Play, "Prayer
 * Times & Quran" on F-Droid, and a different short description in every
 * language. Now the fastlane files are the one source (written from
 * branding/IDENTITY.md), and the CSV is generated from them.
 *
 * The format is what the Console exports and accepts back: every field
 * quoted, CRLF between rows, newlines inside a field left as they are.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'fastlane', 'metadata', 'android');
const OUT = path.join(ROOT, 'branding', 'store', 'mihrab-play-store-listing.csv');

/** Play's language column, in the order the Console lists them. */
const LANGUAGES = [
  ['en-US', 'English (United States)'],
  ['ar', 'Arabic'],
  ['bn-BD', 'Bengali'],
  ['de-DE', 'German'],
  ['es-ES', 'Spanish'],
  ['fr-FR', 'French'],
  ['hi-IN', 'Hindi'],
  ['id', 'Indonesian'],
  ['ru-RU', 'Russian'],
  ['sv-SE', 'Swedish'],
  ['tr-TR', 'Turkish'],
  ['ur', 'Urdu'],
  ['zh-CN', 'Chinese (Simplified)'],
];

const read = (dir, f) =>
  fs.readFileSync(path.join(STORE, dir, `${f}.txt`), 'utf8').trim();
const quote = s => `"${s.replace(/"/g, '""')}"`;

function render() {
  const rows = [
    ['Language code', 'Language', 'App name', 'Short description', 'Full description'],
    ...LANGUAGES.map(([code, name]) => [
      code,
      name,
      read(code, 'title'),
      read(code, 'short_description'),
      read(code, 'full_description'),
    ]),
  ];
  return rows.map(r => r.map(quote).join(',')).join('\r\n') + '\r\n';
}

module.exports = { render, LANGUAGES, OUT };

if (require.main === module) {
  const text = render();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.error('branding/store/mihrab-play-store-listing.csv is out of date — run node scripts/store-listing-csv.js');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${LANGUAGES.length} languages)`);
  }
}
