/**
 * The āyah sheet shows the muṣḥaf the reader is looking at.
 *
 * A stored riwayah this device cannot draw — Warsh chosen once, its text
 * never downloaded or since removed — is read as Ḥafṣ by the reader
 * (`resolveRiwayah`). The sheet judged the same preference raw, so under
 * a Ḥafṣ page in tajwīd colours it set the āyah in plain Unicode and its
 * Tajweed tab went looking for Warsh's rules, which are not there: no
 * page face, no colours, no rules. Every surface that decides by the
 * riwayah must decide by the one on screen.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { resolveRiwayah, DEFAULT_RIWAYAH } from '../src/quran/riwayat';

const src = (p: string) => readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');

describe('a riwayah not on the device is Ḥafṣ to the reader', () => {
  it('resolveRiwayah answers Ḥafṣ for a Warsh preference whose text is absent', () => {
    expect(resolveRiwayah('warsh')).toBe(DEFAULT_RIWAYAH);
    expect(resolveRiwayah('qalun')).toBe(DEFAULT_RIWAYAH);
  });
});

describe('the surfaces decide by the riwayah on screen, never the raw preference', () => {
  const files = [
    'quran/mushaf/AyahActionSheet.tsx',
    'quran/tajweed/TajweedAyahSection.tsx',
    'quran/tajweed/TajweedGuideScreen.tsx',
    'screens/settings/pages/TajweedSettingsScreen.tsx',
    'quran/QuranFeaturesOffer.tsx',
    'quran/tajweedAutoDownload.ts',
  ];
  it.each(files)('%s resolves the preference before using it', file => {
    const text = src(file);
    expect(text).toMatch(/resolveRiwayah\(/);
    // Every read of the preference is wrapped, or is an effect's dependency.
    const rest = text
      .replace(/resolveRiwayah\((?:state\.|quran\.)?prefs\.riwayah\)/g, '')
      .replace(/, (?:state\.)?prefs\.riwayah\]/g, ']');
    expect(rest).not.toMatch(/prefs\.riwayah\b/);
  });

  it('the sheet draws a Ḥafṣ āyah from the page fonts and offers Tajweed by the shown riwayah', () => {
    const sheet = src('quran/mushaf/AyahActionSheet.tsx');
    expect(sheet).toMatch(/const shownRiwayah = resolveRiwayah\(state\.prefs\.riwayah\)/);
    expect(sheet).toMatch(/riwayahHasTajweed\(shownRiwayah\)/);
    expect(sheet).toMatch(/riwayahById\(shownRiwayah\)\.render !== 'unicode'/);
    expect(sheet).toMatch(/tajweedColoursShown\(shownRiwayah, state\.prefs\.tajweedColours\)/);
    expect(sheet).not.toMatch(/riwayahById\(state\.prefs\.riwayah\)/);
    expect(sheet).not.toMatch(/riwayahHasTajweed\(state\.prefs\.riwayah\)/);
  });
});
