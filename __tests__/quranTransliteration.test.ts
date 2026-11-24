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
  QURAN_TRANSLATIONS,
  QURAN_TRANSLITERATION,
  TRANSLATION_SURAHS,
} from '../src/quran/translations';
import {
  getAyahTransliteration,
  getSurahTransliteration,
  TRANSLITERATION_ID,
  transliterationFits,
} from '../src/quran/transliteration';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';

jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

const fetchMock = fetchWithRetry as unknown as jest.Mock;
const fsMock = ReactNativeBlobUtil.fs as unknown as {
  exists: jest.Mock;
  readFile: jest.Mock;
  writeFile: jest.Mock;
  lstat: jest.Mock;
};
const src = (p: string) => readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');

let disk: Map<string, string>;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const gone = { ok: false, status: 404, json: async () => ({}) };
function host(url: string) {
  let m = /^https:\/\/api\.alquran\.cloud\/v1\/surah\/(\d+)\/en\.transliteration$/.exec(url);
  if (m) {
    const s = m[1];
    return ok({
      data: { ayahs: [1, 2, 3].map(a => ({ numberInSurah: a, text: ` Latin ${s}:${a} ` })) },
    });
  }
  m = /^https:\/\/api\.alquran\.cloud\/v1\/ayah\/(\d+):(\d+)\/en\.transliteration$/.exec(url);
  if (m) return ok({ data: { text: `Latin-ayah ${m[1]}:${m[2]}` } });
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

describe('it is not a translation', () => {
  it('is not in the picker, is no language’s default, and cannot be a stored pick', () => {
    expect(QURAN_TRANSLATIONS.some(e => e.id === TRANSLITERATION_ID)).toBe(false);
    expect(isKnownEdition(TRANSLITERATION_ID)).toBe(false);
    for (const locale of ['en', 'sv', 'ar', 'id', 'ur', 'xx']) {
      expect(defaultEditionForLocale(locale)).not.toBe(TRANSLITERATION_ID);
    }
  });

  it('is kept by the translations’ store all the same, as a download', () => {
    expect(findTranslationEdition(TRANSLITERATION_ID)).toBe(QURAN_TRANSLITERATION);
    expect(isFetchedTranslation(TRANSLITERATION_ID)).toBe(true);
    expect(QURAN_TRANSLITERATION.approxBytes).toBeGreaterThan(100_000);
  });

  it('is not searched and does not go out in a share', () => {
    for (const file of ['quran/search.ts', 'share/shareText.ts', 'quran/mushaf/ShareAyahRangeSheet.tsx']) {
      expect(src(file)).not.toMatch(/[Tt]ransliteration\b.*from '.*transliteration'/);
      expect(src(file)).not.toMatch(/QURAN_TRANSLITERATION|getAyahTransliteration/);
    }
  });
});

describe('it is credited to the host that serves it, not to Tanzil', () => {
  it('has a source of its own with no Tanzil licence on it', () => {
    expect(QURAN_TRANSLITERATION.source).toBe('alquran.cloud');
    const credit = TEXT_SOURCES['alquran.cloud'].attribution;
    expect(credit).not.toMatch(/Tanzil|CC BY/);
    expect(src('screens/settings/pages/AttributionsSettingsScreen.tsx')).toMatch(
      /TEXT_SOURCES\['alquran\.cloud'\]\.attribution/,
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
    expect(sw).toMatch(/queueQuranDownload\(\{ kind: 'translation', editionId: TRANSLITERATION_ID \}\)/);
    expect(sw).toMatch(/setQuranPrefs\(\{ transliteration: next \}\)/);
  });

  it('the verse-by-verse reader leaves it off a row in another riwayah, and hides it with the Arabic', () => {
    const reader = src('screens/quran/TranslationSurahScreen.tsx');
    expect(reader).toMatch(/!maskArabic && !ownText && joinedInto == null \? \(\s*<TransliterationLine/);
    expect(reader).toMatch(/useSurahTransliteration\(\s*quran\.prefs\.transliteration === true/);
  });
});

describe('it is off until asked for', () => {
  it('is off in a new install', () => {
    expect(DEFAULT_QURAN_STATE.prefs.transliteration).toBe(false);
  });

  it('a stored blob without the key, or with junk in it, reads as off', () => {
    expect(src('quran/quranState.ts')).toMatch(/\?\.transliteration === true/);
  });
});

describe('where the text comes from', () => {
  it('an ayah comes from the host, never the mirror, for the ayah asked', async () => {
    expect(await getAyahTransliteration(2, 3)).toBe('Latin-ayah 2:3');
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^https:\/\/api\.alquran\.cloud\//);
  });

  it('a surah comes whole, by ayah number', async () => {
    expect(await getSurahTransliteration(112)).toEqual({
      '1': 'Latin 112:1',
      '2': 'Latin 112:2',
      '3': 'Latin 112:3',
    });
  });

  it('is empty, not an error, when nothing answers', async () => {
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTransliteration(9, 9)).toBe('');
    expect(await getSurahTransliteration(9)).toEqual({});
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect(await getAyahTransliteration(9, 9)).toBe('');
  });

  it('an ayah read once is read from the device after that', async () => {
    fetchMock.mockImplementation(async (url: string) => (/\/surah\//.test(url) ? gone : host(url)));
    expect(await getAyahTransliteration(5, 7)).toBe('Latin-ayah 5:7');
    resetStoreMemory();
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTransliteration(5, 7)).toBe('Latin-ayah 5:7');
  });

  it('downloads whole from the host alone: 114 surahs, none asked of the mirror', async () => {
    const { complete } = await downloadTranslationEdition(TRANSLITERATION_ID, {}).promise;
    expect(complete).toBe(true);
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls).toHaveLength(TRANSLATION_SURAHS);
    for (const u of urls) expect(u).toMatch(/^https:\/\/api\.alquran\.cloud\/v1\/surah\/\d+\/en\.transliteration$/);
    const files = [...disk.keys()].filter(p => /translations\/en\.transliteration\/s\/\d+\.json$/.test(p));
    expect(files).toHaveLength(TRANSLATION_SURAHS);
    // And is read from the device after that.
    resetStoreMemory();
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTransliteration(36, 2)).toBe('Latin 36:2');
  });
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
  });
});
