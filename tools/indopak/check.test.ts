/**
 * The whole IndoPak file through the gate the phone runs — before a pin
 * moves, and whenever the importer changes.
 *
 *   INDOPAK_FILE=/path/to/quran_text_indopak_15.ts npx jest tools/indopak
 *
 * It is a jest suite rather than a node script because the content check
 * reads the bundled Ḥafṣ text through react-native-blob-util, and the
 * test setup is where that module is stood in for by the repo's own
 * `assets/` — the same text the phone compares against. Skipped when no
 * file is named, so `npm test` is unaffected.
 *
 * The report lands in `reports/indopak-<commit>.md`: what was counted,
 * how well the corpus agrees with Ḥafṣ, and the ayahs that agree least.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { INDOPAK_COMMIT, INDOPAK_TEXT } from '../../src/quran/indopakSource';
import {
  convertIndopak,
  foldIndopakSpelling,
  parseIndopakFile,
  verifyIndopakFile,
} from '../../src/quran/indopakImport';
import { MIN_CORPUS_MEAN } from '../../src/quran/hafsAlignment';
import { skeleton, textAgreement, startsWithBasmalah, stripBasmalah } from '../../src/quran/juzCheck';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from '../../src/quran/pages';
import { exactPageFor } from '../../src/quran/mushafPrintedLines';
import { bundledSurahArabic, warmSurahCache, releaseSurahCache } from '../../src/quran/quran';

const file = process.env.INDOPAK_FILE;
const maybe = file ? describe : describe.skip;

/** What the real file measured on 25 Oct 2026; a change here is a change to look at. */
const EXPECTED_MEAN = 0.98;

/** One ayah's agreement with the bundled Ḥafṣ, the way `checkAgainstHafs` scores it. */
function agreement(key: string, text: string): { score: number; floor: number } | null {
  const [s, a] = key.split(':').map(Number);
  const reference = bundledSurahArabic(s)?.[a - 1];
  if (!reference) return null;
  let wanted = skeleton(reference);
  const candidate = skeleton(text);
  if (startsWithBasmalah(wanted) && !startsWithBasmalah(candidate)) {
    wanted = stripBasmalah(wanted) || wanted;
  }
  return textAgreement(wanted, candidate);
}

maybe('the IndoPak file, whole', () => {
  // `describe.skip` still runs this body, so the read is guarded too.
  const source = file ? readFileSync(file, 'utf8') : '';

  beforeAll(async () => {
    await warmSurahCache();
  });
  afterAll(() => {
    releaseSurahCache();
  });

  it('is the pinned file', () => {
    const digest = createHash('sha256').update(source, 'utf8').digest('hex');
    expect(Buffer.byteLength(source, 'utf8')).toBe(INDOPAK_TEXT.bytes);
    expect(digest).toBe(INDOPAK_TEXT.sha256);
  });

  it('passes every check the phone runs, and reads as the Qur’an', () => {
    const result = verifyIndopakFile(source, MUSHAF_SURAHS, MUSHAF_PAGES);
    if (!result.ok) throw new Error(result.error);
    expect(result.totalPages).toBe(610);
    expect(result.counts).toEqual({ pages: 610, headers: 114, basmalahs: 112, ayahs: 6236 });
    expect(result.checked?.kind).toBe('aligned');
    if (result.checked?.kind !== 'aligned') return;
    expect(result.checked.splits).toBe(0);
    expect(result.checked.merges).toBe(0);
    expect(result.checked.mean).toBeGreaterThanOrEqual(EXPECTED_MEAN);
    expect(result.checked.mean).toBeGreaterThanOrEqual(MIN_CORPUS_MEAN);
    expect(result.dataset.pages.length).toBe(610);
    expect(result.dataset.lines?.pages.length).toBe(610);

    // ── Every line of the book comes back out of the tables ──────────
    //
    // The stored form is the ayah text plus, per line, how many of each
    // ayah's words sit there and the printed medallion. Set back into
    // lines from those two files, every one of the 8,800 lines must be
    // the file's line, character for character (the file's one bidi
    // override reads as a space and a medallion, as the importer takes
    // it). This is the proof that nothing a reader sees is estimated.
    const pagesOfFile = parseIndopakFile(source);
    const text = result.dataset.text;
    let compared = 0;
    pagesOfFile.forEach((page, pi) => {
      const rows = exactPageFor(result.dataset.lines!, pi + 1, (su, a) => text[`${su}:${a}`] ?? null);
      expect(rows).not.toBeNull();
      expect(rows!.length).toBe(page.length);
      page.forEach((line, li) => {
        const row = rows![li];
        // The one out-of-order ayah end, in logical order — see the importer.
        const expected = line.replace(/\u202E([\u0660-\u0669]+\u08E2)/, ' $1');
        let rebuilt: string;
        if (row.band != null) rebuilt = line; // the header, drawn as a band
        else if (row.basmalah) rebuilt = `${row.basmalah} \u06DD`;
        else {
          rebuilt = row.ayahs
            .map(a => [a.text, a.ends ? a.mark ?? '' : ''].filter(Boolean).join(' '))
            .join(' ');
        }
        if (rebuilt !== expected) {
          throw new Error(`page ${pi + 1} line ${li + 1}:\n  file  ${expected}\n  table ${rebuilt}`);
        }
        compared += 1;
      });
    });
    expect(compared).toBe(pagesOfFile.reduce((n, p) => n + p.length, 0));

    // The report: the agreement per ayah, worst first, and what the file
    // would score as written, for the record.
    const { verses } = convertIndopak(parseIndopakFile(source), MUSHAF_PAGES);
    const scored: Array<{ key: string; score: number; floor: number }> = [];
    let asWritten = 0;
    for (const v of verses) {
      const folded = agreement(v.verse_key!, foldIndopakSpelling(v.text!));
      const raw = agreement(v.verse_key!, v.text!);
      if (!folded || !raw) continue;
      scored.push({ key: v.verse_key!, ...folded });
      asWritten += raw.score;
    }
    scored.sort((x, y) => x.score - y.score);
    const unfolded = asWritten / scored.length;

    const dir = path.join(__dirname, '..', '..', 'reports');
    mkdirSync(dir, { recursive: true });
    const lines = [
      `# IndoPak check — ${INDOPAK_COMMIT.slice(0, 12)}`,
      '',
      `Run ${new Date().toISOString().slice(0, 10)} on \`${path.basename(file!)}\` ` +
        `(${INDOPAK_TEXT.bytes} bytes, SHA-256 ${INDOPAK_TEXT.sha256.slice(0, 12)}…).`,
      '',
      '| Check | Result |',
      '|---|---|',
      `| Pages | ${result.totalPages} |`,
      `| Surah headers / basmalah bands (al-Fātiḥah's is ayah 1:1) | ${result.counts!.headers} / ${result.counts!.basmalahs} |`,
      `| Ayahs | ${result.counts!.ayahs} |`,
      `| Groups against Ḥafṣ (splits, merges) | ${result.checked.groups} (${result.checked.splits}, ${result.checked.merges}) |`,
      `| Corpus agreement, spelling folded | ${(result.checked.mean * 100).toFixed(2)}% |`,
      `| Corpus agreement, as written | ${(unfolded * 100).toFixed(2)}% |`,
      `| Lowest ayah | ${(scored[0].score * 100).toFixed(0)}% (${scored[0].key}) |`,
      '',
      '## Twenty ayahs that agree least',
      '',
      '| Ayah | Agreement | Floor |',
      '|---|---|---|',
      ...scored
        .slice(0, 20)
        .map(s => `| ${s.key} | ${(s.score * 100).toFixed(0)}% | ${(s.floor * 100).toFixed(0)}% |`),
      '',
    ];
    writeFileSync(path.join(dir, `indopak-${INDOPAK_COMMIT.slice(0, 12)}.md`), lines.join('\n'));
    expect(scored.every(s => s.score >= s.floor)).toBe(true);
  });
});
