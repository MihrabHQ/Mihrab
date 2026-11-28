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
    expect(page).toContain('setRoom(e.nativeEvent.layout.height);');
    expect(page).toContain('getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}');
  });

  it('zooms to any size with two fingers, as a picture does, and keeps what is under them there', () => {
    expect(page).toContain('const scale = Math.min(ZOOM_MAX / zoomRef.current, Math.max(1 / zoomRef.current, e.scale));');
    expect(page).toContain('.onEnd(e => zoomTo(zoomRef.current * e.scale, focal.current))');
    expect(page).toContain('tx.setValue((1 - scale) * (f.x - box.current.w / 2));');
    expect(page).toContain('y: Math.max(0, (at2.current.y + f.y) * k - f.y),');
    // Lifting the fingers does not twitch: the pages stay as they were left until the new size is laid out,
    // and are put in place and let go together (found by hand on a Pixel).
    expect(page).toContain('if (!committing.current) settle();');
    expect(page).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*?put\(\);\s*settle\(\);\s*committing\.current = false;/);
    // The place is known before any scrolling has reported it: a zoom straight after opening at page 7 stays
    // at page 7 (it went to page 1, seen on a Pixel).
    expect(page).toContain('at2.current.y = target * rowHeightRef.current;');
    // Two fingers zoom every time: the scrollers are in the gesture system with the pinch, and stand still
    // while two fingers are down (it zoomed on some tries and scrolled on others, found by hand on a Pixel).
    expect(page).toContain('.simultaneousWithExternalGesture(sideGesture, listGesture)');
    expect(page).toContain('if (e.numberOfTouches >= 2) setPinching(true);');
    expect(page).toContain('scrollEnabled={!pinching}');
    // The pages are not thrown away to be zoomed: the list is the same list at another size.
    expect(page).not.toMatch(/key=\{`[sz]\$\{zoom/);
    // The button still steps, for a hand that cannot pinch.
    expect(page).toContain('else zoomTo(ZOOMS.find(z => z > zoomRef.current + 0.01) ?? 1, null);');
  });

  it('opens a page made wider at the edge its lines begin at, by where that is on the glass', () => {
    expect(page).toContain("if (Platform.OS === 'android') side.current?.scrollTo({ x: rtl ? 100000 : 0, animated: false });");
  });

  it('is the system\'s own PDF view on Android 9 and later, and keeps what the reader kept', () => {
    const view = read('android/app/src/main/java/com/prayer_times/MihrabPdfReaderView.kt');
    const pkg = read('android/app/src/main/java/com/prayer_times/MushafLinePackage.kt');
    const gradle = read('android/app/build.gradle');
    // The library, and nothing of Google Play's with it.
    expect(gradle).toContain('implementation("androidx.pdf:pdf-viewer:1.0.0-beta01")');
    expect(gradle).toContain('implementation("androidx.pdf:pdf-document-service:1.0.0-beta01")');
    expect(gradle).not.toMatch(/implementation\("androidx\.pdf:pdf-ocr-play-services/);
    // It asks for Android 9 and the app runs from 7: offered only where it runs, and said so in the manifest.
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain('tools:overrideLibrary="androidx.pdf, androidx.pdf.core, androidx.pdf.document.service"');
    expect(pkg).toContain('if (android.os.Build.VERSION.SDK_INT >= MihrabPdfViewManager.MIN_SDK)');
    expect(read('android/app/src/main/java/com/prayer_times/MihrabPdfViewManager.kt')).toContain('const val MIN_SDK = 28');
    // The file is opened in the library's isolated process, where the app's own start-up must not run: it
    // threw there and no page was drawn (seen on an emulator).
    expect(read('android/app/src/main/java/com/prayer_times/MainApplication.kt')).toMatch(/super\.onCreate\(\)[\s\S]{0,700}if \(android\.os\.Process\.isIsolated\(\)\) return/);
    // A file on the device, and no network.
    expect(view).toContain('openDocument(Uri.fromFile(File(file)), null)');
    expect(/https?:\/\/|URLSession|HttpURLConnection|okhttp/i.test(view)).toBe(false);
    // The place is not said until the view is at the page it was opened at, nor before the zoom that fits a
    // page is known; a zoom it is told to take keeps what was in the middle, and is drawn.
    expect(view).toContain('if (first >= page || System.currentTimeMillis() > arriveBy) arriving = false else return');
    expect(view).toContain('if (zoom <= 0f || baseZoom <= 0f) return');
    expect(view).toContain('if (middle != null) pdf.scrollToPosition(middle) else if (page >= 0) pdf.scrollToPage(page)');
    expect(view).toContain('pdf.postDelayed({ pdf.scrollBy(0, 1); pdf.scrollBy(0, -1) }, REDRAW_MS)');
    // Turned on its side, a page that fits is still 100%.
    expect(view).toContain('baseZoom *= w.toFloat() / oldw');
    // The screen: the same place, bookmarks and go-to-page, through the view; and the list of pages when
    // the view is not there or cannot open the file.
    expect(page).toContain('const system = !systemFailed && nativePdfViewAvailable();');
    expect(page).toContain('onPdfError={() => setSystemFailed(true)}');
    expect(page).toContain('setGoTo(was => ({ page: Math.min(pages, n) - 1, key: (was?.key ?? 0) + 1 }));');
    expect(page).toMatch(/onSystemViewport[\s\S]{0,400}seen\.current = page;\s*setAt\(page\);/);
    expect(read('src/native/MihrabPdfView.ts')).toContain("rn.Platform.OS === 'android'");
  });

  it('looks for words in the file where the system can read them, and offers it nowhere else', () => {
    const view = read('android/app/src/main/java/com/prayer_times/MihrabPdfReaderView.kt');
    // The system says whether it can; on Android 12 and older without the newer PDF parts it cannot, and a
    // search there found nothing in a page that had the word (seen on an API 31 emulator).
    expect(view).toContain('doc.isFeatureSupported(PdfFeature.SEARCH)');
    expect(page).toContain('setCanFind(e.nativeEvent.search);');
    expect(page).toContain("{system && canFind ? <TextAction label={t('hadith.library.pdf.find')}");
    // In the file, on the device; from the page being read; and the view is not handed every mark in the book.
    expect(view).toContain('doc.searchDocument(words, 0 until doc.pageCount)');
    expect(view).toContain('shown = list.indexOfFirst { it.page >= saidPage }');
    expect(view).toContain('if (m.page >= here.page - 1 && m.page <= here.page + 1) {');
    // Closing the search takes the marks off.
    expect(page).toMatch(/const stopFinding = \(\) => \{[\s\S]*?look\(''\);/);
    expect(view).toMatch(/if \(words\.isEmpty\(\)\) \{[\s\S]*?pdf\.setHighlights\(emptyList\(\)\)/);
    for (const k of ['find', 'findNext', 'findPrevious']) expect(page).toContain(`hadith.library.pdf.${k}`);
  });

  it('can be read full screen, with a button that stays to leave it, and the back button', () => {
    const frame = read('src/screens/hadith/HadithPage.tsx');
    expect(page).toContain('bare={full}');
    expect(page).toContain("t('hadith.library.pdf.fullScreen')");
    expect(frame).toMatch(/if \(bare\) \{[\s\S]*?<StatusBar hidden animated \/>/);
    // The way out is a button in the corner, clear of the camera and the corners of the glass; not a tap on
    // the page, which happens by accident and is how words are selected.
    expect(page).toMatch(/\{full \? \(\s*<Pressable\s*onPress=\{\(\) => setFull\(false\)\}\s*accessibilityRole="button"\s*accessibilityLabel=\{t\('hadith\.library\.pdf\.exitFullScreen'\)\}/);
    expect(page).toContain('top: insets.top + SPACING.sm, end: insets.right + SPACING.md');
    expect(page).not.toContain('onPdfTap');
    expect(page).toMatch(/BackHandler\.addEventListener\('hardwareBackPress', \(\) => \{\s*setFull\(false\);\s*return true;/);
  });

  it('keeps how a reader likes the pages: the colour of the paper for every book, the zoom of each', () => {
    const kept = require('../src/hadith/libraryPdfView') as typeof import('../src/hadith/libraryPdfView');
    expect(kept.PDF_TONES).toEqual(['paper', 'sepia', 'night']);
    expect(kept.nextPdfTone('paper')).toBe('sepia');
    expect(kept.nextPdfTone('night')).toBe('paper');
    for (const z of [1, 1.5, 4]) expect(kept.validPdfZoom(z)).toBe(true);
    for (const z of [0.5, 4.1, NaN, '2', null]) expect(kept.validPdfZoom(z)).toBe(false);
    const view = read('android/app/src/main/java/com/prayer_times/MihrabPdfReaderView.kt');
    // The paper is tinted on its way to the glass: the file is not touched and nothing is drawn again.
    expect(view).toContain('pdf.setLayerType(LAYER_TYPE_HARDWARE, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })');
    expect(page).toContain('tone={tone}');
    expect(page).toContain("if (kept.current > 1.04) setZoomAsk(was => ({ step: kept.current, key: (was?.key ?? 0) + 1 }));");
    expect(page).toContain("t('hadith.library.pdf.pageColour')");
  });

  it('turns a screen with the volume buttons where the reader has them turn the muṣḥaf\'s pages', () => {
    const view = read('android/app/src/main/java/com/prayer_times/MihrabPdfReaderView.kt');
    expect(page).toContain('useVolumeKeyPaging(system && readerPrefs.volumeKeyPaging, finding, asking, turn, readerPrefs.volumeKeyUpForward);');
    expect(view).toContain('pdf.scrollBy(0, (by * pdf.height * SCREEN_PART).toInt())');
  });

  it('has a sentence for each way the file can fail, in every language', () => {
    for (const k of ['note', 'read', 'zoom', 'noSpace', 'badFile', 'unreadable', 'pageFailed']) expect(page + read('src/screens/hadith/LibraryShelf.tsx')).toContain(`hadith.library.pdf.${k}`);
    for (const f of fs.readdirSync(path.join(REPO, 'src/i18n/locales'))) {
      const pdf = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.library.pdf;
      expect([f, Object.keys(pdf).sort()]).toEqual([f, ['badFile', 'exitFullScreen', 'find', 'findNext', 'findPrevious', 'fullScreen', 'noSpace', 'note', 'pageColour', 'pageFailed', 'read', 'unreadable', 'zoom']]);
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

describe('the books that are files, as they are built', () => {
  const { pdfPack, BOOKS, MAX_BYTES, SOURCE } = require('../scripts/library/build-pdf-books.js');
  const script = read('scripts/library/build-pdf-books.js');

  it('copies the publisher\'s file byte for byte, and reads none of its words', () => {
    expect(script).toContain("fs.copyFileSync(cache, path.join(OUT, 'library', `${book.id}.pdf`));");
    expect(script).not.toMatch(/replace\(|mend\(|debris/);
    expect(MAX_BYTES).toBe(LIBRARY_PDF_MAX_BYTES);
  });

  it('writes a pack the app accepts, naming the file, whose it is and where from', () => {
    const pack = pdfPack(BOOKS[0], { bytes: 10, sha256: SHA, pages: 3 });
    expect(validPack(`library/${BOOKS[0].id}`, pack)).toBe(true);
    expect(pack.chapters).toEqual([]);
    expect(pack.source.name).toBe(SOURCE.name);
    expect(pack.source.url).toMatch(/^https:\/\/islamhouse\.com\/id\/books\/\d+$/);
    // A book's pack is in the book's language, and its source is that language's page.
    const sv = BOOKS.find((b: { lang: string }) => b.lang === 'sv');
    expect(pdfPack(sv, { bytes: 10, sha256: SHA, pages: 3 })).toMatchObject({ lang: 'sv', source: { url: `https://islamhouse.com/sv/books/${sv.item}` } });
    for (const b of BOOKS) expect([b.id, /^https:\/\/d1\.islamhouse\.com\/.+\.pdf$/.test(b.url), b.author.length > 2]).toEqual([b.id, true, true]);
  });

  it('is uploaded beside the packs', () => {
    expect(read('scripts/hadith/upload-packs.sh')).toContain("\\( -name '*.json' -o -name '*.pdf' \\)");
  });
});

