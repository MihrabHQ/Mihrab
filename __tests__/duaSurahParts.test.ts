/**
 * The three Quls are read one surah at a time: a segment per surah, each
 * with its whole text from the bundled muṣḥaf (DuasScreen), not the three
 * opening lines run together.
 */
import { DUAS } from '../src/duas/duas';
import { surahBody } from '../src/screens/DuasScreen';

const quls = DUAS.filter(d => d.id.endsWith('three_quls'));

describe('the three Quls', () => {
  it('are four duas, each with al-Ikhlas, al-Falaq and an-Nas in that order', () => {
    expect(quls.map(d => d.id).sort()).toEqual([
      'afterPrayer_three_quls',
      'evening_02_three_quls',
      'morning_02_three_quls',
      'sleep_three_quls',
    ]);
    for (const d of quls) {
      expect(d.parts?.map(p => p.surah)).toEqual([112, 113, 114]);
      // One opening per part: the card's fallback and the share text.
      expect(d.arabic.split(' · ')).toHaveLength(3);
      for (const p of d.parts ?? []) {
        expect(p.transliteration.startsWith('Bismi-llāhi-r-raḥmāni-r-raḥīm.')).toBe(true);
      }
    }
  });

  it('count each surah where it is "three times each", and the set at bedtime', () => {
    const each = Object.fromEntries(quls.map(d => [d.id, !!d.countEach]));
    expect(each).toEqual({
      morning_02_three_quls: true,
      evening_02_three_quls: true,
      afterPrayer_three_quls: true,
      sleep_three_quls: false,
    });
  });
});

describe('surahBody', () => {
  // Shaped like the bundled files: the basmalah leads ayah 1 as four words.
  const arabic = ['بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ', 'ٱللَّهُ ٱلصَّمَدُ'];
  const translation = ['Say, "He is Allah, [who is] One,', 'Allah, the Eternal Refuge.'];

  it('puts the basmalah on its own line and numbers the ayahs', () => {
    const body = surahBody(112, arabic, translation);
    expect(body?.basmalah).toBe('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');
    expect(body?.arabic).toBe('قُلْ هُوَ ٱللَّهُ أَحَدٌ ﴿١﴾ ٱللَّهُ ٱلصَّمَدُ ﴿٢﴾');
    expect(body?.translation).toBe('(1) Say, "He is Allah, [who is] One, (2) Allah, the Eternal Refuge.');
  });

  it('leaves al-Fatihah and al-Tawbah whole, and an unread surah empty', () => {
    expect(surahBody(9, arabic, translation)?.basmalah).toBeNull();
    expect(surahBody(1, arabic, translation)?.basmalah).toBeNull();
    expect(surahBody(112, [], [])).toBeNull();
  });
});
