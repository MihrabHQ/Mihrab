/**
 * The ayah in Latin letters under the Arabic (2026-11-24, from a Play
 * review asking for the du'a screen's pronunciation line in the Qur'an).
 *
 * It is an aid and has to stay one: off until asked for, never a
 * translation (not in the picker, never a default, never searched or
 * shared), shown only where the Arabic above it is the Ḥafṣ reading it
 * spells, and fetched from the host that serves it — not the mirror, which
 * has no licence to republish it.
 */
import { readFileSync } from 'fs';
import path from 'path';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { DEFAULT_QURAN_STATE } from '../src/quran/quranState';
import { RIWAYAT } from '../src/quran/riwayat';
import { resetStoreMemory } from '../src/quran/surahStore';
import { TEXT_SOURCES } from '../src/quran/textSources';
import {
  defaultEditionForLocale,
  downloadTranslationEdition,
  findTranslationEdition,
  isFetchedTranslation,
  isKnownEdition,
  isTransliterationEdition,
  QURAN_TRANSLATIONS,
  QURAN_TRANSLITERATIONS,
  TRANSLATION_SURAHS,
} from '../src/quran/translations';
import {
  getAyahTransliteration,
  getSurahTransliteration,
  resolveTransliteration,
  TRANSLITERATION_SAMPLES,
  transliterationFits,
  transliterationForLocale,
} from '../src/quran/transliteration';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';

jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

const fetchMock = fetchWithRetry as unknown as jest.Mock;
const fsMock = ReactNativeBlobUtil.fs as unknown as {
  exists: jest.Mock;
  readFile: jest.Mock;
  writeFile: jest.Mock;
};
const src = (p: string) => readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const edition = (id: string) => QURAN_TRANSLITERATIONS.find(e => e.id === id)!;
const ID = edition('translit.id-skb');
const TR = edition('tr.transliteration');

let disk: Map<string, string>;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const gone = { ok: false, status: 404, json: async () => ({}) };
/** The two hosts, each in its own shape, saying who answered and for what. */
function host(url: string) {
  let m = /^https:\/\/quran-json\.risanb\.com\/transliteration\/([a-z-]+)\/chapters\/(\d+)\.json$/.exec(url);
  if (m) {
    const [, key, s] = m;
    return ok({
      id: Number(s),
      verses: [1, 2, 3].map(a => ({ id: a, transliteration: ` ${key} ${s}:${a} ` })),
    });
  }
  m = /^https:\/\/api\.alquran\.cloud\/v1\/surah\/(\d+)\/tr\.transliteration$/.exec(url);
  if (m) {
    const s = m[1];
    return ok({ data: { ayahs: [1, 2, 3].map(a => ({ numberInSurah: a, text: `abay ${s}:${a}` })) } });
  }
  m = /^https:\/\/api\.alquran\.cloud\/v1\/ayah\/(\d+):(\d+)\/tr\.transliteration$/.exec(url);
  if (m) return ok({ data: { text: `abay-ayah ${m[1]}:${m[2]}` } });
  return gone;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStoreMemory();
  disk = new Map();
  fsMock.exists = jest.fn(async (p: string) => disk.has(p));
  fsMock.readFile = jest.fn(async (p: string) => disk.get(p));
  fsMock.writeFile = jest.fn(async (p: string, c: string) => {
    disk.set(p, c);
  });
  fetchMock.mockImplementation(async (url: string) => host(url));
});

describe('they are not translations', () => {
  it('none is in the picker, a language’s default, or a storable pick', () => {
    for (const e of QURAN_TRANSLITERATIONS) {
      expect(QURAN_TRANSLATIONS.some(t => t.id === e.id)).toBe(false);
      expect(isKnownEdition(e.id)).toBe(false);
      for (const locale of ['en', 'sv', 'ar', 'id', 'tr', 'ur', 'xx']) {
        expect(defaultEditionForLocale(locale)).not.toBe(e.id);
      }
    }
  });

  it('are kept by the translations’ store all the same, as downloads', () => {
    const ids = QURAN_TRANSLITERATIONS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of QURAN_TRANSLITERATIONS) {
      expect(findTranslationEdition(e.id)).toBe(e);
      expect(isFetchedTranslation(e.id)).toBe(true);
      expect(isTransliterationEdition(e.id)).toBe(true);
      expect(e.approxBytes).toBeGreaterThan(100_000);
      expect(Object.keys(TEXT_SOURCES)).toContain(e.source);
      // From their hosts: this repository's mirror does not hold them.
      expect(e.unmirrored).toBe(true);
    }
    expect(isTransliterationEdition('en.sahih')).toBe(false);
  });

  it('are not searched and do not go out in a share', () => {
    for (const file of ['quran/search.ts', 'share/shareText.ts', 'quran/mushaf/ShareAyahRangeSheet.tsx']) {
      expect(src(file)).not.toMatch(/QURAN_TRANSLITERATIONS|getAyahTransliteration|from '.*\/transliteration'/);
    }
  });
});

describe('each is credited to who made it', () => {
  it('the generated ones say they are generated, under their licence', () => {
    expect(TEXT_SOURCES['quran-json'].attribution).toMatch(/quran-json/);
    expect(TEXT_SOURCES['quran-json'].attribution).toMatch(/CC BY-SA 4\.0/);
    const about = src('screens/settings/pages/AttributionsSettingsScreen.tsx');
    expect(about).toMatch(/TEXT_SOURCES\['quran-json'\]\.attribution/);
    expect(about).toMatch(/generated from the Arabic text/);
    expect(about).toMatch(/Muhammet Abay/);
  });

  it('the edition tried first and found wrong in two ayahs is not offered', () => {
    // alquran.cloud's en.transliteration: 37:60 and 27:54 are not the ayahs
    // they are filed under (docs/data-sources.md).
    expect(QURAN_TRANSLITERATIONS.some(e => e.sourceId === 'en.transliteration')).toBe(false);
  });
});

describe('the spelling follows the reader', () => {
  it('starts as the app language’s own, where there is one', () => {
    expect(transliterationForLocale('id').id).toBe('translit.id-skb');
    expect(transliterationForLocale('tr').id).toBe('tr.transliteration');
    expect(transliterationForLocale('en').id).toBe('translit.en-simple');
    expect(transliterationForLocale('en-GB').id).toBe('translit.en-simple');
    for (const l of ['bn', 'hi', 'ur']) expect(transliterationForLocale(l).id).toBe('translit.en-simple');
    // No convention of their own on offer: the one that is nobody's.
    for (const l of ['sv', 'de', 'fr', 'es', 'ru', 'zh', 'ar', 'xx']) {
      expect(transliterationForLocale(l).id).toBe('translit.en');
    }
  });

  it('is the reader’s choice once they make one, and their language’s if the choice is gone', () => {
    expect(resolveTransliteration('tr.transliteration', 'id')).toBe(TR);
    expect(resolveTransliteration('', 'id')).toBe(ID);
    expect(resolveTransliteration(undefined, 'id')).toBe(ID);
    expect(resolveTransliteration('en.transliteration', 'id')).toBe(ID);
    // The same object every time: an effect that depends on it does not re-run.
    expect(resolveTransliteration('', 'sv')).toBe(resolveTransliteration('', 'sv'));
  });

  it('every choice shows a word of itself', () => {
    for (const e of QURAN_TRANSLITERATIONS) expect(TRANSLITERATION_SAMPLES[e.id]).toBeTruthy();
    expect(src('quran/TransliterationSwitch.tsx')).toMatch(
      /setQuranPrefs\(\{ transliterationStyle: e\.id \}\)/,
    );
  });
});

describe('it is shown with the reading it spells', () => {
  it('fits the two Ḥafṣ prints and no other riwayah', () => {
    const fits = RIWAYAT.filter(r => transliterationFits(r.id)).map(r => r.id);
    expect(fits).toEqual(['hafs', 'indopak']);
    for (const id of ['warsh', 'qalun', 'shubah'] as const) {
      expect(transliterationFits(id)).toBe(false);
    }
  });

  it('the ayah sheet asks by the riwayah on screen, and only when switched on', () => {
    const sheet = src('quran/mushaf/AyahActionSheet.tsx');
    expect(sheet).toMatch(
      /useAyahTransliteration\(\s*visible && state\.prefs\.transliteration === true && transliterationFits\(shownRiwayah\)/,
    );
  });

  it('can be switched on, and downloaded, from the ayah sheet and from "Under each verse"', () => {
    expect(src('quran/mushaf/AyahActionSheet.tsx')).toMatch(/<TransliterationSwitch /);
    expect(src('quran/CompanionTextControls.tsx')).toMatch(/<TransliterationSwitch \/>/);
    const sw = src('quran/TransliterationSwitch.tsx');
    expect(sw).toMatch(/queueQuranDownload\(\{ kind: 'translation', editionId: edition\.id \}\)/);
    expect(sw).toMatch(/setQuranPrefs\(\{ transliteration: next \}\)/);
  });

  it('the verse-by-verse reader leaves it off a row in another riwayah, and hides it with the Arabic', () => {
    const reader = src('screens/quran/TranslationSurahScreen.tsx');
    expect(reader).toMatch(/!maskArabic && !ownText && joinedInto == null \? \(\s*<TransliterationLine/);
    expect(reader).toMatch(/useSurahTransliteration\(\s*quran\.prefs\.transliteration === true/);
  });
});

describe('it is off until asked for', () => {
  it('is off in a new install, with no spelling chosen', () => {
    expect(DEFAULT_QURAN_STATE.prefs.transliteration).toBe(false);
    expect(DEFAULT_QURAN_STATE.prefs.transliterationStyle).toBe('');
  });

  it('a stored blob without the key, or with junk in it, reads as off', () => {
    expect(src('quran/quranState.ts')).toMatch(/\?\.transliteration === true/);
  });
});

describe('where the text comes from', () => {
  it('a generated edition has no one-ayah answer: the ayah is read out of its chapter, trimmed', async () => {
    expect(await getAyahTransliteration(ID, 2, 3)).toBe('id-skb 2:3');
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls).toEqual(['https://quran-json.risanb.com/transliteration/id-skb/chapters/2.json']);
    // The next ayah of the same surah is not another request.
    expect(await getAyahTransliteration(ID, 2, 1)).toBe('id-skb 2:1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the Turkish one comes from alquran.cloud, an ayah at a time', async () => {
    expect(await getAyahTransliteration(TR, 2, 3)).toBe('abay-ayah 2:3');
    for (const c of fetchMock.mock.calls) expect(String(c[0])).toMatch(/^https:\/\/api\.alquran\.cloud\//);
  });

  it('never mixes spellings', async () => {
    expect(await getSurahTransliteration(ID, 112)).toEqual({
      '1': 'id-skb 112:1',
      '2': 'id-skb 112:2',
      '3': 'id-skb 112:3',
    });
    expect((await getSurahTransliteration(edition('translit.en'), 112))['1']).toBe('en 112:1');
    expect((await getSurahTransliteration(edition('translit.en-simple'), 112))['1']).toBe('en-simple 112:1');
    expect((await getSurahTransliteration(TR, 112))['1']).toBe('abay 112:1');
  });

  it('is empty, not an error, when nothing answers', async () => {
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTransliteration(ID, 9, 9)).toBe('');
    expect(await getSurahTransliteration(ID, 9)).toEqual({});
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect(await getAyahTransliteration(ID, 9, 9)).toBe('');
    expect(await getAyahTransliteration(TR, 9, 9)).toBe('');
  });

  it('an ayah read once is read from the device after that', async () => {
    expect(await getAyahTransliteration(ID, 5, 2)).toBe('id-skb 5:2');
    resetStoreMemory();
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTransliteration(ID, 5, 2)).toBe('id-skb 5:2');
  });

  it.each(QURAN_TRANSLITERATIONS.map(e => e.id))(
    '%s downloads whole from its host alone: 114 surahs, none asked of the mirror',
    async id => {
      const { complete } = await downloadTranslationEdition(id, {}).promise;
      expect(complete).toBe(true);
      const urls = fetchMock.mock.calls.map(c => String(c[0]));
      expect(urls).toHaveLength(TRANSLATION_SURAHS);
      for (const u of urls) expect(u).toMatch(/^https:\/\/(quran-json\.risanb\.com|api\.alquran\.cloud)\//);
      const files = [...disk.keys()].filter(p => p.includes(`/translations/${id}/s/`));
      expect(files).toHaveLength(TRANSLATION_SURAHS);
      // And is read from the device after that.
      resetStoreMemory();
      fetchMock.mockImplementation(async () => gone);
      expect(await getAyahTransliteration(edition(id), 36, 2)).toMatch(/36:2$/);
    },
  );
});

describe('13 locales say what it is', () => {
  const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];
  it.each(LOCALES)('%s has the switch, its caution and its Ḥafṣ note with the riwayah named', locale => {
    const q = JSON.parse(src(`i18n/locales/${locale}.json`)).quran as Record<string, string>;
    expect(q.transliteration).toBeTruthy();
    expect(q.transliterationSub.length).toBeGreaterThan(30);
    expect(q.transliterationHafsOnly).toContain('{{riwayah}}');
    expect(q.transliterationGet).toContain('{{size}}');
    expect(q.transliterationDownloading).toContain('{{pct}}');
    expect(q.transliterationStyle).toBeTruthy();
  });
});
