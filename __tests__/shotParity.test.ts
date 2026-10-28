/**
 * The README and the site show the same nine pictures, and they drift.
 *
 * There are two galleries of the app: `branding/readme/*.png`, which is
 * what somebody sees on GitHub, and `docs/assets/img/shot-*.png`, which is
 * what somebody sees on the site in thirteen languages. Every pair is one
 * screenshot copied to two paths, and nothing until now said so — so a
 * retake could land in one gallery and not the other, and the only way to
 * notice was to open both and compare by eye.
 *
 * That is exactly what happened after the practice graph's cells were made
 * smaller: the site's Android widget shot was replaced and the README's
 * copy of the same picture was not, leaving the repo's front page showing
 * a graph the app had stopped drawing.
 *
 * Byte-identity is the right assertion here rather than "looks similar":
 * these are copies, not two renders of one scene, so anything other than
 * equal bytes means one of them was regenerated alone.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

/**
 * README file → the site shot it is a copy of.
 *
 * The names differ on purpose: the README numbers its shots so they order
 * themselves in a directory listing, and the site names them after what
 * they show, because `build-site.js` keys alt text and captions off that
 * name. Adding a screenshot to one gallery means adding a row here.
 */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['01_home.png', 'shot-home.png'],
  ['02_quran.png', 'shot-mushaf.png'],
  ['03_duas.png', 'shot-duas.png'],
  ['04_tasbih.png', 'shot-tasbih.png'],
  ['05_qibla.png', 'shot-qibla.png'],
  ['06_journal.png', 'shot-log.png'],
  ['07_tilawah.png', 'shot-tilawah.png'],
  ['08_fasting.png', 'shot-fasting.png'],
  ['09_widgets.png', 'shot-widgets-android.png'],
  // The fans (branding/tools/fan.py): five screens in one picture.
  ['10_alerts.png', 'shot-alerts.png'],
  ['12_themes.png', 'shot-themes.png'],
  ['13_minimal.png', 'shot-minimal.png'],
];

const sha = (p: string) =>
  createHash('sha256').update(readFileSync(p)).digest('hex');

const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf-8');

describe('the README gallery and the site gallery are the same pictures', () => {
  it.each(PAIRS)('%s is byte-identical to %s', (branding, shot) => {
    expect(sha(path.join(ROOT, 'branding', 'readme', branding))).toBe(
      sha(path.join(ROOT, 'docs', 'assets', 'img', shot)),
    );
  });

  it('pairs every screenshot the README actually shows', () => {
    // A tenth shot added to the README without a row above would otherwise
    // be unpaired and unchecked.
    const shown = [...readme.matchAll(/branding\/readme\/([\w.-]+\.png)/g)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    expect(shown).toEqual(PAIRS.map(([b]) => b).sort());
  });
});

describe('the alt text names widgets the shot contains', () => {
  /*
   * The Android widget shot has said one thing and shown another before:
   * its alt text once named a khatmah widget the picture did not carry.
   * Since the 2026-10-29 retake the shot DOES carry it — Continue reading,
   * with today's khatmah portion — beside the times, the log, the next
   * prayer and the Hijri date. A test cannot look at the picture, but it
   * can hold every language to naming the two widgets that came in with
   * that retake, so the alt text cannot fall behind it again.
   */
  const strings = JSON.parse(
    readFileSync(path.join(ROOT, 'scripts', 'site', 'strings.json'), 'utf-8'),
  ) as Record<
    string,
    { shots: { items: Record<string, { alt: string; cap: string }> } }
  >;

  const KHATMAH = /khatmah|khatma|khatam|hatm|jatma|ختم|ختمة|хатм|खत्म|ख़त्म|খতম|通读/i;
  const HIJRI = /hijri|hijriah|hicri|hégire|hégira|hidschri|хиджр|هجري|ہجری|হিজরি|हिजरी|伊斯兰历/i;

  it.each(Object.keys(strings))('%s names the khatmah and the Hijri date', code => {
    const alt = strings[code].shots.items['widgets-android'].alt;
    expect(alt).toMatch(KHATMAH);
    expect(alt).toMatch(HIJRI);
  });
});
