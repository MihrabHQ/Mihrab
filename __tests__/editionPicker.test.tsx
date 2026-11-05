/**
 * The two-row edition picker in the ayah sheet (2026-11-05): a language,
 * then an edition within it. Twenty-nine translations and twenty-five
 * tafsirs have to fit, and a tap has to land on the edition it names.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';
import { EditionPicker, pickerLanguages } from '../src/quran/mushaf/EditionPicker';
import { QURAN_TRANSLATIONS } from '../src/quran/translations';
import { TAFSIR_EDITIONS } from '../src/quran/tafsir';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: { accentBg: '#eee', accentSolid: '#000', border: '#ccc', muted: '#666' },
  }),
}));

/** The radio chips, by their accessibility label. */
function chips(root: ReactTestInstance): Map<string, ReactTestInstance> {
  const out = new Map<string, ReactTestInstance>();
  for (const n of root.findAllByProps({ accessibilityRole: 'radio' })) {
    if (typeof n.props.onPress === 'function') {
      out.set(String(n.props.accessibilityLabel), n);
    }
  }
  return out;
}

describe('pickerLanguages', () => {
  it("leads with the app's language, then English, then the rest as listed", () => {
    const langs = pickerLanguages(QURAN_TRANSLATIONS, 'sv');
    expect(langs.slice(0, 2)).toEqual(['Swedish', 'English']);
    expect(new Set(langs).size).toBe(langs.length);
    expect(langs).toContain('Malay');
  });

  it('lists each language once however many editions it has', () => {
    const langs = pickerLanguages(TAFSIR_EDITIONS, 'ar');
    expect(langs.filter(l => l === 'Arabic')).toHaveLength(1);
    expect(langs[0]).toBe('Arabic');
    expect(langs[1]).toBe('English');
  });
});

describe('EditionPicker', () => {
  it('shows the editions of the selected language only, with their names', () => {
    const onSelect = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <EditionPicker
          kind="translation"
          editions={QURAN_TRANSLATIONS}
          selectedId="tr.diyanet"
          appLocale="tr"
          onSelect={onSelect}
        />,
      );
    });
    const c = chips(tree.root);
    expect(c.has('Turkish — Diyanet İşleri')).toBe(true);
    expect(c.has('Turkish — Diyanet Vakfı')).toBe(true);
    expect(c.has('Turkish — Elmalılı Hamdi Yazır')).toBe(true);
    expect(c.has('English — Hilali & Khan')).toBe(false);
    // Far fewer chips than editions: the languages plus one language's editions.
    expect(c.size).toBeLessThan(QURAN_TRANSLATIONS.length);
    act(() => c.get('Turkish — Elmalılı Hamdi Yazır')!.props.onPress());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'tr.yazir' }));
  });

  it("tapping a language opens that language's first edition", () => {
    const onSelect = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <EditionPicker
          kind="tafsir"
          editions={TAFSIR_EDITIONS}
          selectedId="en-tafisr-ibn-kathir"
          appLocale="en"
          onSelect={onSelect}
        />,
      );
    });
    const c = chips(tree.root);
    act(() => c.get('Indonesian')!.props.onPress());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'indonesian-mokhtasar' }));
    onSelect.mockClear();
    act(() => c.get('English')!.props.onPress());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has no edition row for a language with one edition', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <EditionPicker
          kind="translation"
          editions={QURAN_TRANSLATIONS}
          selectedId="ms.basmeih"
          appLocale="en"
          onSelect={() => {}}
        />,
      );
    });
    expect(tree.root.findAllByProps({ testID: 'translation-picker-editions' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'translation-picker-languages' }).length).toBeGreaterThan(0);
  });
});
