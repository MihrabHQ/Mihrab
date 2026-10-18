/**
 * Accuracy is the headline, so every figure in the copy is the record's.
 *
 * The website, the README and the store listings quote mihrab-methods'
 * certification (data/methods/certification.json). These hold the copy to
 * it: generated files are current, no field is over its store's limit, no
 * page claims a figure the record lacks, and the wording never borrows an
 * authority's name for an endorsement it does not have.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const site = require('../scripts/build-site') as { build: () => Map<string, string> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const copy = require('../scripts/build-copy') as {
  build: () => { out: Map<string, string>; problems: string[] };
  LIMITS: Record<string, Record<string, number>>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const figures = require('../scripts/copy/figures') as {
  figures: (c: unknown) => { total: { times: number; off: number; checkedAt: string } };
  namedFigures: (c: unknown, lang?: string) => Record<string, string>;
};
const cert = JSON.parse(readFileSync(path.join(ROOT, 'data', 'methods', 'certification.json'), 'utf-8'));

describe('the generated copy is current', () => {
  it('every site page is what scripts/build-site.js writes', () => {
    for (const [file, text] of site.build()) {
      expect({ file: path.relative(ROOT, file), current: readFileSync(file, 'utf-8') === text }).toEqual({
        file: path.relative(ROOT, file),
        current: true,
      });
    }
  });

  it('the store listings and the README are what scripts/build-copy.js writes, within every limit', () => {
    const { out, problems } = copy.build();
    expect(problems).toEqual([]);
    for (const [file, text] of out) {
      expect({ file: path.relative(ROOT, file), current: existsSync(file) && readFileSync(file, 'utf-8') === text }).toEqual({
        file: path.relative(ROOT, file),
        current: true,
      });
    }
  });
});

describe('figures come from the record', () => {
  const pages = ['docs/index.html', 'docs/sv/index.html', ...readdirSync(path.join(ROOT, 'docs'))
    .filter(d => existsSync(path.join(ROOT, 'docs', d, 'index.html')) && d !== 'sv')
    .map(d => `docs/${d}/index.html`)];

  it('each page quotes only figures the record has, filled with its value', () => {
    for (const rel of pages) {
      const text = readFileSync(path.join(ROOT, rel), 'utf-8');
      const lang = /<html lang="([a-z]+)"/.exec(text)?.[1] ?? 'en';
      const named = figures.namedFigures(cert, lang);
      for (const m of text.matchAll(/<!--fig:([\w.]+)-->([\s\S]*?)<!--\/fig-->/g)) {
        expect({ rel, key: m[1], value: m[2] }).toEqual({ rel, key: m[1], value: named[m[1]] });
      }
    }
  });

  it('the headline total is the sum of the record', () => {
    const { total } = figures.figures(cert);
    const sum = Object.values(cert as Record<string, { checks: { times: number; off: number }[] }>)
      .flatMap(e => e.checks)
      .reduce((a, c) => ({ times: a.times + c.times, off: a.off + c.off }), { times: 0, off: 0 });
    expect({ times: total.times, off: total.off }).toEqual(sum);
  });

  it('a figure the record lacks fails the build rather than printing a blank', () => {
    const { fillFigures, namedFigures } = require('../scripts/copy/figures');
    expect(() => fillFigures('<!--fig:nowhere.times-->1<!--/fig-->', namedFigures(cert), 'test')).toThrow(/certify/);
    const broken = JSON.parse(JSON.stringify(cert));
    delete broken.morocco.checks[0].offWithoutCorrections;
    expect(() => namedFigures(broken)).toThrow(/offWithoutCorrections/);
  });
});

describe('the wording', () => {
  const english = [
    readFileSync(path.join(ROOT, 'docs/index.html'), 'utf-8'),
    readFileSync(path.join(ROOT, 'fastlane/metadata/android/en-US/full_description.txt'), 'utf-8'),
    readFileSync(path.join(ROOT, 'fastlane/metadata/ios/en-US/description.txt'), 'utf-8'),
  ];

  it('says what the times match, never that they are an authority’s own', () => {
    for (const t of english) {
      expect(t).not.toMatch(/official (prayer )?times/i);
      expect(t).not.toMatch(/\bthe (only|first) (app|prayer)/i);
    }
  });

  it('every store description and the FAQ say Mihrab is independent', () => {
    for (const t of english) expect(t).toMatch(/not affiliated with/);
  });

  it('certification is claimed only for the computed methods', () => {
    const page = english[0];
    const section = /<section class="accuracy-section"[\s\S]*?<\/section>/.exec(page)![0];
    expect(section).toMatch(/Singapore \(MUIS\), Malaysia \(JAKIM\) and Türkiye Takvimi are not computed/);
    expect(section).toMatch(/not part of the certification/);
  });

  it('the hero line is kept', () => {
    expect(english[0]).toMatch(/<h1>For every prayer, and everything between\.<\/h1>/);
  });

  it('the site still ships no script and no third-party request', () => {
    for (const rel of ['docs/index.html', 'docs/sv/index.html', 'docs/tr/index.html', 'docs/ar/index.html']) {
      const text = readFileSync(path.join(ROOT, rel), 'utf-8');
      for (const m of text.matchAll(/<script\b([^>]*)>/g)) expect(m[1]).toMatch(/type="application\/ld\+json"/);
      expect(text).not.toMatch(/<link[^>]+href="https?:\/\/(?!mihrab\.elghamri\.se)/);
      expect(text).not.toMatch(/<(img|script|iframe)[^>]+src="https?:\/\//);
    }
  });
});

describe('the privacy claims match what the code sends', () => {
  const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

  it('nothing says coordinates never leave the phone: AlAdhan and the town lookup receive them', () => {
    const claims = [/coordinates (stay|never leave)/i, /Nothing leaves your phone/i, /never leave it/i, /allowBackup` is set to \*\*false/];
    const files = [
      'docs/index.html',
      'PRIVACY_POLICY.md',
      'README.md',
      'src/i18n/locales/en.json',
      'fastlane/metadata/android/en-US/full_description.txt',
      'fastlane/metadata/ios/en-US/description.txt',
    ];
    for (const rel of files) for (const re of claims) expect({ rel, claim: re.test(read(rel)) }).toEqual({ rel, claim: false });
  });

  it('the policy names what goes out: AlAdhan, the rounded town lookup, the update files, Android backup', () => {
    const policy = read('PRIVACY_POLICY.md');
    expect(policy).toMatch(/api\.aladhan\.com/);
    expect(policy).toMatch(/rounded to two decimal places/);
    expect(policy).toMatch(/MihrabHQ\/mihrab-methods/);
    expect(policy).toMatch(/Android's own backup/);
  });

  it('Android backup is on, as the policy now says', () => {
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(/android:allowBackup="true"/);
  });
});
