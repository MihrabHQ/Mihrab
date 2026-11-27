/**
 * A Library book that is a PDF (src/hadith/libraryPdf.ts, the reader in
 * src/screens/hadith/LibraryPdfBookScreen.tsx, the page drawn by
 * MihrabPdfModule.kt and MihrabPdf.mm).
 *
 * What must hold: a book is here whole or not here; it is read with no
 * network; a failure has a reason the page can say; and the place and the
 * bookmarks are the text books' own, so nothing a reader has is lost by a
 * book being a file.
 */
import fs from 'fs';
import path from 'path';
import {
  LIBRARY_PDF_HEADROOM,
  LIBRARY_PDF_MAX_BYTES,
  libraryPdfAsset,
  libraryPdfFits,
  validLibraryPdf,
} from '../src/hadith/libraryPdf';
import { validPack } from '../src/hadith/packTypes';
import { pdfRenderWidth } from '../src/native/MihrabPdf';

const REPO = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SHA = 'a'.repeat(64);

describe('what a manifest may say of a book\'s file', () => {
  it('is a size, a SHA-256 and a count of pages, and nothing looser', () => {
    expect(validLibraryPdf({ bytes: 1_500_000, sha256: SHA, pages: 120 })).toBe(true);
    for (const bad of [
      null,
      {},
      { bytes: 0, sha256: SHA, pages: 1 },
      { bytes: 1.5, sha256: SHA, pages: 1 },
      { bytes: 10, sha256: 'A'.repeat(64), pages: 1 },
      { bytes: 10, sha256: 'abc', pages: 1 },
      { bytes: 10, sha256: SHA, pages: 0 },
      { bytes: 10, sha256: SHA },
    ]) {
      expect([JSON.stringify(bad), validLibraryPdf(bad)]).toEqual([JSON.stringify(bad), false]);
    }
  });

  it('is not offered past the size a phone is asked to fetch', () => {
    expect(validLibraryPdf({ bytes: LIBRARY_PDF_MAX_BYTES, sha256: SHA, pages: 1 })).toBe(true);
    expect(validLibraryPdf({ bytes: LIBRARY_PDF_MAX_BYTES + 1, sha256: SHA, pages: 1 })).toBe(false);
  });

  it('is asked about room before the transfer, and an unknown amount is not a no', () => {
    expect(libraryPdfFits(5_000_000, 5_000_000 + LIBRARY_PDF_HEADROOM)).toBe(true);
    expect(libraryPdfFits(5_000_000, 5_000_000 + LIBRARY_PDF_HEADROOM - 1)).toBe(false);
    expect(libraryPdfFits(5_000_000, null)).toBe(true);
  });

  it('is our copy of the file, by the book\'s name', () => {
    expect(libraryPdfAsset('tatacara')).toBe('library.tatacara.pdf');
  });
});

describe('a pack for a book that is a file', () => {
  const base = { id: 'x', title: 'ك', author: 'م', died: '', lang: 'id', source: { name: 's', license: 'l', licenseUrl: 'u', url: 'u' }, asOf: '2026-11-27' };

  it('is a book with no chapters and a file, or with chapters: never neither', () => {
    expect(validPack('library/x', { ...base, chapters: [], pdf: { bytes: 10, sha256: SHA, pages: 3 } })).toBe(true);
    expect(validPack('library/x', { ...base, chapters: [{ t: 'باب', b: ['نص'] }] })).toBe(true);
    expect(validPack('library/x', { ...base, chapters: [] })).toBe(false);
    // A file it names must be one that can be checked.
    expect(validPack('library/x', { ...base, chapters: [], pdf: { bytes: 10, sha256: 'no', pages: 3 } })).toBe(false);
    expect(validPack('library/x', { ...base, chapters: [{ t: 'باب', b: ['نص'] }], pdf: { bytes: 10 } })).toBe(false);
  });
});

describe('fetching the file', () => {
  const src = read('src/hadith/libraryPdf.ts');

  it('moves it into place only when it is the size and the SHA-256 the manifest names', () => {
    const check = src.indexOf("if (sha !== want.sha256) {");
    const move = src.indexOf('await ReactNativeBlobUtil.fs.mv(tmp, path);');
    expect(check).toBeGreaterThan(0);
    expect(move).toBeGreaterThan(check);
    // The transfer is to a file of its own, and that file never outlives the attempt.
    expect(src).toContain('const tmp = `${path}.dl`;');
    expect(src).toMatch(/finally \{\s*running\.delete\(id\);\s*await ReactNativeBlobUtil\.fs\.unlink\(tmp\)/);
  });

  it('asks about room first, and says why when it fails', () => {
    expect(src.indexOf("set(id, { state: 'failed', why: 'space' });")).toBeLessThan(src.indexOf(".fetch('GET', hadithMirrorUrl(libraryPdfAsset(id)))"));
    for (const why of ['space', 'network', 'file']) expect(src.split(`'${why}'`).length).toBeGreaterThan(2);
  });

  it('comes from our copy and from nowhere else', () => {
    expect(src.match(/\.fetch\('GET'/g)).toHaveLength(1);
    expect(src).toContain("hadithMirrorUrl(libraryPdfAsset(id))");
  });

  it('goes with its pack, from wherever the pack is removed', () => {
    const packs = read('src/hadith/packs.ts');
    const del = packs.slice(packs.indexOf('export async function deletePack'));
    expect(del.slice(0, del.indexOf('\n}'))).toContain("if (key.startsWith('library/')) await ReactNativeBlobUtil.fs.unlink(`${ROOT()}/${key}.pdf`).catch(() => undefined);");
  });

  it('keeps the place and the marks when the file is removed', () => {
    const del = src.slice(src.indexOf('export async function deleteLibraryPdf'));
    expect(del.slice(0, del.indexOf('\n}'))).not.toMatch(/Reading|Bookmark|AsyncStorage/);
  });
});

describe('the reader', () => {
  const page = read('src/screens/hadith/LibraryPdfBookScreen.tsx');

  it('keeps the place and the bookmarks where the text books keep theirs: a PDF is one chapter whose blocks are its pages', () => {
    expect(page).toContain("void setLibraryReading(id, { c: 0, b, f: pages > 1 ? b / pages : 0, n: 1,");
    expect(page).toContain('toggleLibraryBookmark(id, 0, page)');
    expect(page).toContain("navigation.push('LibraryBook', { id, chapter: 0, block: page })");
    // What was waiting to be written is written on leaving.
    expect(page).toMatch(/if \(pending\.current\) \{\s*clearTimeout\(pending\.current\);\s*writeRef\.current\(\);/);
  });

  it('reads no network: a page is a file on the device, drawn by the system', () => {
    expect(page).not.toMatch(/fetch\(|https?:\/\//);
    expect(page).toContain('pdfPage(path, index, width)');
    for (const native of ['android/app/src/main/java/com/prayer_times/MihrabPdfModule.kt', 'ios/PrayerApp/MihrabPdf.mm']) {
      expect([native, /https?:\/\/|URLSession|HttpURLConnection|okhttp/i.test(read(native))]).toEqual([native, false]);
    }
  });

  it('gives the list of pages a height of its own, so a long book is not drawn all at once', () => {
    expect(page).toContain('onLayout={e => setRoom(e.nativeEvent.layout.height)}');
    expect(page).toContain('getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}');
  });

  it('has a sentence for each way the file can fail, in every language', () => {
    for (const k of ['note', 'read', 'zoom', 'noSpace', 'badFile', 'unreadable', 'pageFailed']) expect(page + read('src/screens/hadith/LibraryShelf.tsx')).toContain(`hadith.library.pdf.${k}`);
    for (const f of fs.readdirSync(path.join(REPO, 'src/i18n/locales'))) {
      const pdf = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.library.pdf;
      expect([f, Object.keys(pdf).sort()]).toEqual([f, ['badFile', 'noSpace', 'note', 'pageFailed', 'read', 'unreadable', 'zoom']]);
      expect([f, pdf.noSpace.includes('{{size}}')]).toEqual([f, true]);
    }
  });

  it('is the page of a book that is a file, and of no other', () => {
    expect(read('src/screens/hadith/LibraryBookScreen.tsx')).toContain("findLibraryBook(id)?.format === 'pdf' ? <LibraryPdfBookScreenPage /> : <LibraryTextBookPage />");
  });
});

describe('the width a page is drawn at', () => {
  it('is on a ladder, so a small change of zoom does not draw the book again', () => {
    expect(pdfRenderWidth(411, 2.625)).toBe(1080);
    expect(pdfRenderWidth(411, 2.625, 1.5)).toBe(2160);
    expect(pdfRenderWidth(360, 2)).toBe(720);
    // Never finer than a phone can hold.
    expect(pdfRenderWidth(900, 3, 2.25)).toBe(3000);
  });
});

describe('the page drawn on each platform', () => {
  it('is drawn on white paper, kept in the cache, and one at a time', () => {
    const kt = read('android/app/src/main/java/com/prayer_times/MihrabPdfModule.kt');
    expect(kt).toContain('bitmap.eraseColor(Color.WHITE)');
    expect(kt).toContain('Executors.newSingleThreadExecutor()');
    expect(kt).toContain('reactApplicationContext.cacheDir');
    const mm = read('ios/PrayerApp/MihrabPdf.mm');
    expect(mm).toContain('[UIColor whiteColor].CGColor');
    expect(mm).toContain('DISPATCH_QUEUE_SERIAL');
    expect(mm).toContain('NSCachesDirectory');
  });
});
