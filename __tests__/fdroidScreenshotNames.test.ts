import fs from 'fs';
import path from 'path';

/*
 * F-Droid never deletes a screenshot it has published (fdroidserver#490):
 * a file renamed or dropped from fastlane/ stays on the listing beside its
 * replacement until an admin removes it by hand (fdroid/admin#377 — 2.36.0
 * needed 2_quran, 3_duas, 4_tasbih and 5_fasting removed). So these names
 * are fixed: replace an image under the same name. Adding a new name is
 * fine — add it here too, and it is fixed from then on.
 */
const PUBLISHED: Record<string, string[]> = {
  phoneScreenshots: ['1_home', '2_mushaf', '3_month', '4_duas', '5_tasbih', '6_journal', '7_qibla', '8_qibla', '9_hifz'],
  tenInchScreenshots: ['1_home', '2_spread', '3_month', '4_duas', '5_journal', '6_month', '7_devices'],
};

const BASE = path.resolve(__dirname, '../fastlane/metadata/android');

describe('F-Droid screenshot names', () => {
  const locales = fs.readdirSync(BASE).filter(l => fs.existsSync(path.join(BASE, l, 'images')));

  it.each(locales)('%s keeps every published name, and nothing unlisted', locale => {
    for (const [folder, names] of Object.entries(PUBLISHED)) {
      const dir = path.join(BASE, locale, 'images', folder);
      if (!fs.existsSync(dir)) continue;
      const have = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort();
      expect(have).toEqual(names.map(n => `${n}.png`).sort());
    }
  });
});
