/**
 * The madda wājib on text engines without Unicode 14 — see
 * `src/quran/maddaWajibFallback.ts`. The whole-book count (79 words, 353
 * places) is held in `tools/indopak/check.test.ts`; these are the shapes of
 * word that decided the rule, each measured with HarfBuzz 2.3/2.6 against
 * Android 16's 10.2.
 */
import {
  breaksJoin,
  engineKnowsMaddaWajib,
  maddaWajibFallback,
} from '../src/quran/maddaWajibFallback';

const cp = (s: string) => s.split(' ').map(h => String.fromCodePoint(parseInt(h, 16))).join('');

describe('which words an engine without U+089C breaks', () => {
  it('breaks the join between two letters that join', () => {
    // أُولٰٓىِٕكَ — lām with its dagger alif, then yāʾ: drawn as أُولَ ئِكَ.
    expect(breaksJoin(cp('0627 064f 0648 0644 0670 089c 0649 0655 0650 0643 064e'))).toBe(true);
    // كٓهٰيٰعٓصٓ — every letter of it joins the next.
    expect(breaksJoin(cp('0643 089c 0647 0670 064a 0670 0639 089c 0635 089c'))).toBe(true);
    // خَطِيْٓــَٔتُهٗ — yāʾ, sukūn, madda, then the tatweel it joins.
    expect(breaksJoin(cp('062e 064e 0637 0650 064a 0652 089c 0640 0654 034f 064e 062a 064f 0647 0657'))).toBe(true);
  });

  it('leaves the madda after an alif, which does not join forward', () => {
    // دَآبَّةٍ, جَآءَ, السَّمَآءِ — the old engines draw these as Android 16 does.
    expect(breaksJoin(cp('062f 064e 0627 089c 0628 0651 064e 0629 064d'))).toBe(false);
    expect(breaksJoin(cp('062c 064e 0627 089c 0621 064e'))).toBe(false);
  });

  it('leaves the madda before a hamza, which joins nothing', () => {
    expect(breaksJoin(cp('0634 064e 064a 0652 089c 0621 064d'))).toBe(false);
  });

  it('draws the broken words with the ordinary madda and nothing else changed', () => {
    const word = cp('0627 064f 0648 0644 0670 089c 0649 0655 0650 0643 064e');
    expect(maddaWajibFallback(word)).toBe(cp('0627 064f 0648 0644 0670 0653 0649 0655 0650 0643 064e'));
    const kept = cp('062f 064e 0627 089c 0628 0651 064e 0629 064d');
    expect(maddaWajibFallback(kept)).toBe(kept);
    expect(maddaWajibFallback('بِسْمِ')).toBe('بِسْمِ');
  });
});

describe('which engines need it', () => {
  it('is Android 12 and older', () => {
    expect(engineKnowsMaddaWajib('android', 32)).toBe(false);
    expect(engineKnowsMaddaWajib('android', 29)).toBe(false);
    expect(engineKnowsMaddaWajib('android', 24)).toBe(false);
    expect(engineKnowsMaddaWajib('android', 33)).toBe(true);
    expect(engineKnowsMaddaWajib('android', 37)).toBe(true);
  });

  it('is iOS and Mac Catalyst before 15.4', () => {
    expect(engineKnowsMaddaWajib('ios', '15.1')).toBe(false);
    expect(engineKnowsMaddaWajib('ios', '15.3.1')).toBe(false);
    expect(engineKnowsMaddaWajib('ios', '15.4')).toBe(true);
    expect(engineKnowsMaddaWajib('ios', '27.1')).toBe(true);
  });
});
