/**
 * Every Hadith download goes through the app's download manager, from our
 * copy first and its source second.
 *
 * They used to run beside the manager — `packs.ts` and `libraryPdf.ts`
 * called straight from the screens: no notification, no service keeping
 * the app alive for a 20 MB book, and two at once with a recitation.
 */
import fs from 'fs';
import path from 'path';
import { validHadithJob, sameHadithJob } from '../src/hadith/hadithJob';
import { libraryPdfOrigin, libraryPdfOriginEntry } from '../src/hadith/libraryPdfOrigin';
import { manifestEntry } from '../src/hadith/packs';
import { validPack } from '../src/hadith/packTypes';
import { validLibraryPdf } from '../src/hadith/libraryPdf';
import ORIGINS from '../src/hadith/libraryPdfOrigins.json';
import { packLabel } from '../src/hadith/HadithDownloadsSection';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

describe('the one way in', () => {
  const ENGINE = ['downloadPack', 'ensurePacks', 'cancelPack', 'downloadLibraryPdf', 'cancelLibraryPdf'];
  // The seam itself, and the two modules that do the fetching.
  const MAY = new Set(['src/hadith/hadithJob.ts', 'src/hadith/hadithDownloads.ts', 'src/hadith/packs.ts', 'src/hadith/libraryPdf.ts']);

  it('no screen takes a download from the modules that fetch: only from hadithDownloads', () => {
    const wrong: string[] = [];
    for (const file of walk('src')) {
      if (MAY.has(file)) continue;
      const src = read(file);
      for (const m of src.matchAll(/import \{([^}]*)\} from '[^']*\/(?:packs|libraryPdf)';/g)) {
        const names = m[1].split(',').map(n => n.trim().split(' as ')[0]);
        for (const n of names) if (ENGINE.includes(n)) wrong.push(`${file}: ${n}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('asks the manager, and answers when the job has left it', () => {
    const src = read('src/hadith/hadithDownloads.ts');
    expect(src).toContain('queueQuranDownload(job);');
    expect(src).toContain('if (isJobRunning(entry.job) || isJobQueued(entry.job)) continue;');
    // Cancel: its turn if it is waiting for one, the run if it is the one running.
    expect(src).toMatch(/if \(isJobQueued\(job\)\) \{\s*dequeueQuranDownload\(job\);/);
    expect(src).toMatch(/if \(isJobRunning\(job\)\) \{\s*cancelQuranDownload\(\);/);
  });

  it('is a job the manager knows in every place it tells its jobs apart', () => {
    const manager = read('src/quran/quranDownloadManager.ts');
    expect(manager).toContain('  | HadithJob\n');
    expect(manager).toContain("if (job.kind === 'hadith') return beginHadithJob(job, onProgress);");
    expect(manager).toContain("if (job.kind === 'hadith') return validHadithJob(job);");
    expect(manager).toContain("if (a.kind === 'hadith' && b.kind === 'hadith') return sameHadithJob(a, b);");
    expect(manager).toContain("if (job.kind === 'hadith' && (await hadithJobDone(job))) {");
    // A queue emptied by a Cancel is said, or a Hadith download waiting in it never hears.
    expect(manager).toMatch(/queued = \[\];\n[^\n]*\n[^\n]*\n\s*if \(dropped\) publish\(\{ \.\.\.state \}\);/);
    // …and it does not know the manager back.
    expect(read('src/hadith/hadithJob.ts')).not.toMatch(/from '\.\.\/quran\/quranDownloadManager'/);
  });

  it('reads a remembered job back only when it names a pack', () => {
    expect(validHadithJob({ kind: 'hadith', key: 'henc/all/en' })).toEqual({ kind: 'hadith', key: 'henc/all/en' });
    expect(validHadithJob({ kind: 'hadith', key: 'library/arbainid', file: true })).toEqual({ kind: 'hadith', key: 'library/arbainid', file: true });
    expect(validHadithJob({ kind: 'hadith', key: '../../settings' })).toBeNull();
    expect(validHadithJob({ kind: 'hadith', key: 'books/bukhari', file: true })).toBeNull();
    expect(validHadithJob({ kind: 'hadith' })).toBeNull();
    // A book's pack and its file are two jobs.
    expect(sameHadithJob({ kind: 'hadith', key: 'library/a' }, { kind: 'hadith', key: 'library/a', file: true })).toBe(false);
  });
});

describe('our copy first, the source second', () => {
  const packs = read('src/hadith/packs.ts');
  const pdf = read('src/hadith/libraryPdf.ts');

  it('a pack: the release, then where it was built from', () => {
    const run = packs.slice(packs.indexOf('export function downloadPack'), packs.indexOf('export type Replaced'));
    expect(run.indexOf('await fromMirror(key, job)')).toBeGreaterThan(-1);
    expect(run.indexOf('await fromMirror(key, job)')).toBeLessThan(run.indexOf('buildFromOrigin('));
    expect(run.indexOf('await fromMirror(key, job)')).toBeLessThan(run.indexOf('libraryPdfOrigin('));
  });

  it("a book's file: the release, then the publisher — and only the same file byte for byte", () => {
    const run = pdf.slice(pdf.indexOf('export async function downloadLibraryPdf'));
    const ours = run.indexOf("hadithMirrorUrl(libraryPdfAsset(id))");
    const theirs = run.indexOf('fromPublisher(origin.url');
    expect(ours).toBeGreaterThan(-1);
    expect(theirs).toBeGreaterThan(ours);
    // Only when ours could not be had.
    expect(run).toContain('const origin = status !== 200 && !job.cancelled ? libraryPdfOrigin(id) : null;');
    // Whatever brought it, it is the book only by the SHA-256.
    expect(run.indexOf("if (sha !== want.sha256) {")).toBeGreaterThan(theirs);
  });
});

describe("the publishers' addresses, in the app", () => {
  const BOOKS = require('../scripts/library/pdf-books.json') as Array<{ id: string; url: string }>;
  const { pdfPack } = require('../scripts/library/build-pdf-books.js');
  const origins = ORIGINS as Record<string, { url: string; pack: { pdf?: unknown } }>;

  it('has every book that is a file, at the address it was read from, over HTTPS', () => {
    expect(Object.keys(origins).sort()).toEqual(BOOKS.map(b => b.id).sort());
    for (const b of BOOKS) {
      expect(origins[b.id].url).toBe(b.url);
      expect(b.url).toMatch(/^https:\/\//);
    }
  });

  it('holds each pack exactly as the builder writes it, and it is a pack', () => {
    for (const b of BOOKS) {
      const o = libraryPdfOrigin(b.id);
      expect(o).not.toBeNull();
      expect(o?.pack).toEqual(pdfPack(b, o?.pack.pdf));
      expect(validPack(`library/${b.id}`, o?.pack)).toBe(true);
      expect(validLibraryPdf(o?.pack.pdf)).toBe(true);
    }
    expect(libraryPdfOrigin('constructor')).toBeNull();
  });

  it('lets a book be offered and weighed when the manifest cannot be had, and defers to it when it can', () => {
    const id = BOOKS[0].id;
    expect(manifestEntry(null, `library/${id}`)?.pdf).toEqual(libraryPdfOriginEntry(id)?.pdf);
    const named = { bytes: 1, pdf: { bytes: 2, sha256: 'a'.repeat(64), pages: 3 } };
    const m = { v: 1, henc: {}, books: {}, nawawi: null, categories: {}, library: { [id]: named } } as never;
    expect(manifestEntry(m, `library/${id}`)).toBe(named);
    // A text book has no address in the app: our copy or nothing.
    expect(manifestEntry(null, 'library/kalila')).toBeNull();
  });
});

describe('Settings → Downloads', () => {
  it('names a Library book by its title, not by its key', () => {
    const t = ((k: string) => k) as never;
    expect(packLabel('library/arbainid', t)).toBe('Hadis Arba’in Nawawiyah');
    expect(packLabel('library/kalila', t)).toBe('كليلة ودمنة');
  });
});
