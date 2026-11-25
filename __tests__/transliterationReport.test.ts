/**
 * The transliterations are checked by a program and by no reciter: a
 * reader who sees a wrong word can say so in one tap, with the ayah and
 * the line as shown already written down.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { transliterationReportUrl } from '../src/quran/transliterationReport';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the report', () => {
  it('is an issue in the app’s repository holding the edition, the ayah and the line as shown', () => {
    const url = transliterationReportUrl('tr.transliteration', 2, 255, 'allâhü lâ ilâhe illâ hû.')!;
    expect(url.startsWith('https://github.com/MihrabHQ/Mihrab/issues/new?labels=transliteration&title=')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('title')).toBe('Transliteration: Al-Baqarah 2:255 (tr.transliteration)');
    const body = q.get('body')!;
    expect(body).toContain('- Edition: `tr.transliteration`');
    expect(body).toContain('- Ayah: Al-Baqarah 2:255');
    expect(body).toContain('- As shown: allâhü lâ ilâhe illâ hû.');
    expect(body).toContain('Corrected by the app in this ayah: no');
    expect(body).toContain('Which word is wrong, and how should it read?');
  });

  it('says when the line is one the app itself put right', () => {
    const body = new URL(transliterationReportUrl('tr.transliteration', 29, 46, 'veilâhünâ veilâhüküm')!).searchParams.get('body')!;
    expect(body).toContain('Corrected by the app in this ayah: yes');
  });

  it('is not offered with no line to report on', () => {
    expect(transliterationReportUrl('translit.en', 1, 1, '')).toBeNull();
    expect(transliterationReportUrl('translit.en', 1, 1, '   ')).toBeNull();
  });

  it('holds nothing of the reader: no place, no language, no settings', () => {
    const body = new URL(transliterationReportUrl('translit.en', 1, 2, 'Al-ḥamdu lillāhi')!).searchParams.get('body')!;
    expect(body.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).split(':')[0])).toEqual([
      'Edition',
      'Ayah',
      'As shown',
      'Corrected by the app in this ayah',
      'App',
    ]);
  });
});

describe('where it is offered', () => {
  it('under the switch in the ayah’s sheet, for that ayah — and only with a line shown', () => {
    expect(src('src/quran/mushaf/AyahActionSheet.tsx')).toMatch(
      /<TransliterationSwitch\s+style=\{styles\.transliterationSwitch\}\s+report=\{\{ surah, ayah, text: transliteration \}\}/,
    );
    const sw = src('src/quran/TransliterationSwitch.tsx');
    expect(sw).toMatch(/on && fits && report\s*\? transliterationReportUrl\(edition\.id, report\.surah, report\.ayah, report\.text\)/);
    // Opened in the browser by the reader; the app itself sends nothing.
    expect(sw).toMatch(/Linking\.openURL\(reportUrl\)/);
    expect(src('src/quran/transliterationReport.ts')).not.toMatch(/fetch\(/);
  });
});
