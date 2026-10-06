/**
 * An edition chip's name must not be able to wrap: the chip is one line high,
 * and on Android a wrapped Arabic name loses every word after the first.
 */
import { TAFSIR_EDITIONS, tafsirChipLabel } from '../src/quran/tafsir';

describe('tafsirChipLabel', () => {
  it('keeps every word of every edition name on one line', () => {
    for (const ed of TAFSIR_EDITIONS) {
      expect(tafsirChipLabel(ed.label)).not.toMatch(/ /);
    }
  });

  it('changes only the spaces, never the name itself', () => {
    for (const ed of TAFSIR_EDITIONS) {
      expect(tafsirChipLabel(ed.label).replace(/ /g, ' ')).toBe(ed.label);
    }
  });

  it('is used by the ayah sheet chips', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src/quran/mushaf/AyahActionSheet.tsx'),
      'utf8',
    );
    expect(src).toContain('tafsirChipLabel(ed.label)');
  });
});

import { tafsirNameInSentence } from '../src/quran/tafsir';

describe('tafsirNameInSentence', () => {
  it('isolates the name so an Arabic name cannot drag the rest of the sentence', () => {
    const out = tafsirNameInSentence('التفسير الميسر');
    expect(out.startsWith('⁨')).toBe(true);
    expect(out.endsWith('⁩')).toBe(true);
    expect(out).toContain('التفسير الميسر');
  });
});
