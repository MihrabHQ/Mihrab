/**
 * Whether the tajwīd colours can be shown here (Play review, Android 9:
 * "tajweed cannot apply"). Android before 10 cannot draw the Ḥafṣ colour
 * fonts, so the switch explains instead of downloading.
 */
import { tajweedUnavailable, tajweedColoursShown, COLOUR_FONT_MIN_ANDROID_API } from '../src/quran/tajweed/tajweedSupport';
import { riwayahHasTajweed } from '../src/quran/tajweed/rules';
import { offerableQuranFeatures } from '../src/quran/QuranFeaturesOffer';
import type { RiwayahId } from '../src/quran/riwayat';

const fs = require('fs');
const read = (p: string) => fs.readFileSync(require('path').join(__dirname, '..', p), 'utf8');

describe('whether the colours can be shown', () => {
  it('is yes for Ḥafṣ where colour fonts are drawn', () => {
    expect(tajweedUnavailable('hafs', true)).toBeNull();
  });
  it("is the device's fault for Ḥafṣ where they are not", () => {
    expect(tajweedUnavailable('hafs', false)).toBe('device');
  });
  it('is yes for Warsh everywhere — its colours are plain text colour', () => {
    expect(tajweedUnavailable('warsh', false)).toBeNull();
    expect(tajweedUnavailable('warsh', true)).toBeNull();
  });
  it("is the riwayah's when it has none", () => {
    const none = (['qalun', 'shubah'] as RiwayahId[]).filter((r) => !riwayahHasTajweed(r));
    for (const r of none) {
      expect(tajweedUnavailable(r, true)).toBe('riwayah');
      expect(tajweedUnavailable(r, false)).toBe('riwayah');
    }
  });
  it('starts at Android 10', () => {
    expect(COLOUR_FONT_MIN_ANDROID_API).toBe(29);
  });
});

describe('an Android that cannot draw them', () => {
  it('is not offered the Ḥafṣ colours', () => {
    expect(
      offerableQuranFeatures({ hafs: true, tajweedColours: false, wordReader: true, colourFontsDrawn: false }),
    ).toEqual([]);
    expect(
      offerableQuranFeatures({
        hafs: false,
        warsh: true,
        tajweedColours: false,
        wordReader: false,
        colourFontsDrawn: false,
      }),
    ).toEqual(['tajweedColours']);
  });
  it('loads the plain pages even with the switch on', () => {
    expect(read('src/quran/useMushafPageFont.ts')).toMatch(/tajweedColours && COLOUR_FONTS_DRAWN/);
  });
  it('downloads nothing for them', () => {
    expect(read('src/quran/tajweedAutoDownload.ts')).toMatch(/if \(!COLOUR_FONTS_DRAWN\) return/);
  });
  it('says why, in every language', () => {
    const dir = require('path').join(__dirname, '..', 'src/i18n/locales');
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(fs.readFileSync(require('path').join(dir, f), 'utf8')).toMatch(/"deviceNote"/);
  });
});

describe('a switch turned on elsewhere', () => {
  // The switch syncs: on from another phone, or from a backup, it must not
  // colour — or ask for the colour fonts — where they cannot be drawn.
  it('colours nothing on an Android that cannot draw them', () => {
    expect(tajweedColoursShown('hafs', true, false)).toBe(false);
    expect(tajweedColoursShown('hafs', true, true)).toBe(true);
    expect(tajweedColoursShown('hafs', false, true)).toBe(false);
    expect(tajweedColoursShown('warsh', true, false)).toBe(true);
  });
  it('is what everything that colours a page asks', () => {
    expect(read('src/quran/mushaf/AyahActionSheet.tsx')).toMatch(/glyphs=\{tajweedColoursShown\(shownRiwayah, state\.prefs\.tajweedColours\) \? 'tajweed' : 'v2'\}/);
    expect(read('src/quran/tajweed/TajweedAyahSection.tsx')).toMatch(/const coloursOn = tajweedColoursShown\(riwayah, prefs\.tajweedColours\);/);
    expect(read('src/screens/QuranScreen.tsx')).toMatch(/tajweedForWarm = tajweedColoursShown\(/);
    expect(read('src/screens/home/QuranCard.tsx')).toMatch(/const tajweed = tajweedColoursShown\(riwayah, quran\.prefs\.tajweedColours\);/);
    for (const f of ['src/quran/tajweed/TajweedGuideScreen.tsx', 'src/screens/settings/pages/TajweedSettingsScreen.tsx'])
      expect(read(f)).toMatch(/value=\{prefs\.tajweedColours && coloured\}/);
  });
});

describe('the night ink on Android 10 to 12', () => {
  const kt = read('android/app/src/main/java/com/prayer_times/TajweedInkPatch.kt');
  it('is patched below Android 13, which draws it itself', () => {
    expect(kt).toMatch(/FOREGROUND_SDK = 33/);
  });
  it('patches only the night palette files', () => {
    expect(kt).toMatch(/QCF4T\\\\d\{3\}D\\\\.ttf/);
  });
  it('is applied where the page fonts are registered', () => {
    expect(read('android/app/src/main/java/com/prayer_times/MushafFontModule.kt')).toMatch(
      /TajweedInkPatch\.fileFor\(/,
    );
  });
});
