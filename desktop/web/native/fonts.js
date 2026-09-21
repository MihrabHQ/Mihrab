/**
 * The app's bundled faces, registered under the family names the styles use
 * (the Android spelling — file name without extension — which is also what
 * `Platform.select({ default })` picks here). One copy of each file: the
 * Android assets folder.
 */
import amiri from '../../../android/app/src/main/assets/fonts/Amiri.ttf';
import amiriQuran from '../../../android/app/src/main/assets/fonts/AmiriQuran.ttf';
import surahNames from '../../../android/app/src/main/assets/fonts/SurahNames.ttf';

const faces = [
  ['Amiri', amiri],
  ['AmiriQuran', amiriQuran],
  ['SurahNames', surahNames],
];

for (const [family, url] of faces) {
  const face = new FontFace(family, `url("${url}")`, { display: 'swap' });
  document.fonts.add(face);
  face.load().catch(e => console.warn(`[mihrab] font ${family} failed`, e));
}
