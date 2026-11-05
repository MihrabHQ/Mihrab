/**
 * Every edition that is read from a source, asked of that source — live.
 *
 * Skipped unless LIVE_SOURCES=1: it needs the network and the three hosts
 * (jsDelivr, alquran.cloud, quranenc.com). Run it when an edition is added
 * or a source changes shape:
 *
 *   LIVE_SOURCES=1 npx jest __tests__/liveTextSources.test.ts
 *
 * For each tafsir and each fetched translation it reads Āyat al-Kursī
 * (2:255) and the first ayah of al-Ikhlāṣ (112:1) through the app's own
 * code, with the mirror out of the way — exactly what the ayah sheet
 * shows — and checks that something of the right script came back, and
 * that it is not the same text as another edition's.
 */
import { loadTafsir, TAFSIR_EDITIONS } from '../src/quran/tafsir';
import { getAyahTranslation, QURAN_TRANSLATIONS, type QuranTranslationId } from '../src/quran/translations';
import { resetStoreMemory } from '../src/quran/surahStore';

const live = process.env.LIVE_SOURCES === '1';
const d = live ? describe : describe.skip;

jest.mock('../src/config/mirrors', () => ({
  ...jest.requireActual('../src/config/mirrors'),
  // No release holds the new editions yet; the sources answer directly.
  MIRROR_BASE: 'https://127.0.0.1:1/none',
}));

/** The script a language is written in, roughly: enough to catch a swap. */
const SCRIPT: Record<string, RegExp> = {
  Arabic: /[؀-ۿ]/,
  Urdu: /[؀-ۿ]/,
  Bengali: /[ঀ-৿]/,
  Hindi: /[ऀ-ॿ]/,
  Russian: /[Ѐ-ӿ]/,
  Chinese: /[一-鿿]/,
};
const latin = /[A-Za-z]/;

function fits(language: string, text: string): boolean {
  const re = SCRIPT[language];
  return re ? re.test(text) : latin.test(text);
}

d('live sources', () => {
  // jest.setup keeps unit tests off the network; this suite is the network.
  const setupFetch = global.fetch;
  beforeAll(() => {
    const real = (globalThis as { __realFetch?: typeof fetch }).__realFetch;
    if (!real) throw new Error('jest.setup did not keep the real fetch');
    global.fetch = real;
  });
  afterAll(() => {
    global.fetch = setupFetch;
  });
  beforeEach(() => resetStoreMemory());

  const seen = new Map<string, string>();

  it.each(TAFSIR_EDITIONS.map(e => [e.id, e.language] as const))(
    'tafsir %s (%s) answers 2:255 and 112:1',
    async (id, language) => {
      const kursi = await loadTafsir(id, 2, 255);
      const ikhlas = await loadTafsir(id, 112, 1);
      expect(kursi && kursi.length).toBeGreaterThan(40);
      expect(ikhlas && ikhlas.length).toBeGreaterThan(10);
      expect(fits(language, kursi!)).toBe(true);
      expect(seen.get(kursi!)).toBeUndefined();
      seen.set(kursi!, id);
    },
    60_000,
  );

  it.each(QURAN_TRANSLATIONS.filter(e => e.source).map(e => [e.id, e.language] as const))(
    'translation %s (%s) answers 2:255 and 112:1',
    async (id, language) => {
      const kursi = await getAyahTranslation(id as QuranTranslationId, 2, 255);
      const ikhlas = await getAyahTranslation(id as QuranTranslationId, 112, 1);
      expect(kursi.length).toBeGreaterThan(80);
      expect(ikhlas.length).toBeGreaterThan(5);
      expect(fits(language, kursi)).toBe(true);
      expect(seen.get(kursi)).toBeUndefined();
      seen.set(kursi, id);
    },
    60_000,
  );
});
