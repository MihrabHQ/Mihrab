#!/usr/bin/env node
/**
 * The Library's books that are files: a publisher's PDF, passed on as it is.
 *
 *   node scripts/library/build-pdf-books.js [id …]
 *
 * docs/hadith-policy.md §6 allows a modern work or a translation where its
 * publisher states it may be republished, on the publisher's terms:
 * unaltered, with its author and the source named. So nothing here reads
 * a book's words. Each file in `pdf-books.json` is fetched once from the
 * publisher (kept in `.cache/`, so a pack built again is the same bytes),
 * checked to be a PDF of a size a phone is asked to fetch, and copied —
 * byte for byte — beside the packs as `library/<id>.pdf`, with a small
 * pack that says what it is, whose, and where from, and names the file by
 * its size, SHA-256 and pages. The manifest says the same, so the shelf
 * can give a book's weight before anything is fetched.
 *
 * The app fetches the file from our copy and accepts it only when it is
 * the size and hash written here (src/hadith/libraryPdf.ts).
 *
 * macOS only: the page count is asked of the system (pdf-pages.swift).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', '..', 'build', 'hadith', 'v1');
const CACHE = path.join(__dirname, '.cache');
const BOOKS = require('./pdf-books.json');
/** src/hadith/libraryPdf.ts `LIBRARY_PDF_MAX_BYTES`: past this the shelf does not offer a book. */
const MAX_BYTES = 25 * 1024 * 1024;
const READ = '2026-11-27';

const SOURCE = {
  name: 'IslamHouse.com',
  license: 'Republished unaltered, with its author and source named, as IslamHouse permits',
  licenseUrl: 'https://islamhouse.com',
};

/** The pack for a book that is a file. */
function pdfPack(book, file) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    died: '',
    lang: book.lang,
    source: { ...SOURCE, url: `https://islamhouse.com/${book.lang}/books/${book.item}` },
    asOf: READ,
    chapters: [],
    pdf: file,
  };
}

function fetched(book) {
  const cache = path.join(CACHE, `pdf-${book.id}.pdf`);
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(CACHE, { recursive: true });
    execFileSync('curl', ['-sSL', '--fail', '-m', '180', '-A', 'MihrabLibraryBuild/1.0', '-o', cache, book.url]);
  }
  const bytes = fs.readFileSync(cache);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`${book.id}: what ${book.url} gave is not a PDF`);
  if (bytes.length > MAX_BYTES) throw new Error(`${book.id}: ${bytes.length} bytes is more than the shelf offers (${MAX_BYTES})`);
  const pages = Number(String(execFileSync('swift', [path.join(__dirname, 'pdf-pages.swift'), cache])).trim());
  if (!Number.isInteger(pages) || pages < 1) throw new Error(`${book.id}: the system reads no pages in it`);
  return { cache, file: { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), pages } };
}

function main() {
  const want = process.argv.slice(2);
  const books = want.length ? BOOKS.filter(b => want.includes(b.id)) : BOOKS;
  if (want.length && books.length !== want.length) throw new Error(`no such book among: ${BOOKS.map(b => b.id).join(', ')}`);
  const manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`no ${manifestFile}: the hadith packs are built first`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const others = JSON.stringify({ ...manifest, library: undefined });
  manifest.library = manifest.library ?? {};
  fs.mkdirSync(path.join(OUT, 'library'), { recursive: true });
  for (const book of books) {
    const { cache, file } = fetched(book);
    const json = JSON.stringify(pdfPack(book, file));
    fs.writeFileSync(path.join(OUT, 'library', `${book.id}.json`), json);
    // The publisher's file, byte for byte.
    fs.copyFileSync(cache, path.join(OUT, 'library', `${book.id}.pdf`));
    manifest.library[book.id] = {
      bytes: Buffer.byteLength(json),
      sha256: crypto.createHash('sha256').update(json).digest('hex'),
      count: 0,
      retrieved: READ,
      pdf: file,
    };
    console.log(`${book.id}: ${file.pages} pages, ${(file.bytes / 1e6).toFixed(2)} MB`);
  }
  if (JSON.stringify({ ...manifest, library: undefined }) !== others) throw new Error('the manifest changed outside `library`: nothing written');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message ?? e);
    process.exit(1);
  }
}
module.exports = { pdfPack, BOOKS, MAX_BYTES, SOURCE };
