#!/usr/bin/env node
/**
 * Where each Library book that is a file comes from, for the app:
 * src/hadith/libraryPdfOrigins.json.
 *
 *   node scripts/library/pdf-origins.js
 *
 * The app fetches a book from our copy first (the `data-hadith-v1`
 * release). When that cannot be reached it goes to the publisher — the
 * very address `build-pdf-books.js` read the file from — and keeps what
 * comes only when it is the same file byte for byte (the SHA-256 our copy
 * was published with). For that it needs, inside the app, the address,
 * and the book's small pack exactly as our copy has it.
 *
 * Written from `pdf-books.json` and the manifest the packs were last
 * built to (build/hadith/v1/manifest.json). Run it after
 * `build-pdf-books.js`; `__tests__/libraryPdfOrigins.test.ts` fails when
 * the two have drifted apart.
 */
const fs = require('fs');
const path = require('path');
const { pdfPack, BOOKS } = require('./build-pdf-books.js');

const MANIFEST = path.join(__dirname, '..', '..', 'build', 'hadith', 'v1', 'manifest.json');
const OUT = path.join(__dirname, '..', '..', 'src', 'hadith', 'libraryPdfOrigins.json');

function origins(manifest) {
  const out = {};
  for (const book of BOOKS) {
    const file = manifest.library?.[book.id]?.pdf;
    // Not published as a file (too large, or never built): nothing to fall back to.
    if (!file) continue;
    out[book.id] = { url: book.url, pack: pdfPack(book, file) };
  }
  return out;
}

if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const out = origins(manifest);
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${Object.keys(out).length} books → ${path.relative(process.cwd(), OUT)}`);
}

module.exports = { origins };
