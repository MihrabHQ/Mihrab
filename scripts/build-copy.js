#!/usr/bin/env node
/**
 * The store listings and the README's accuracy block, written from
 * mihrab-methods' certification record (data/methods/certification.json).
 *
 *   node scripts/build-copy.js          # write
 *   node scripts/build-copy.js --check  # exit 1 if anything is stale or over a limit
 *
 * ── THE RULES THIS ENFORCES ───────────────────────────────────────────
 *
 * No figure is typed by hand: a template asks for `{{KEY}}` and the value
 * comes from the record (scripts/copy/figures.js); a key the record lacks
 * fails the build. Every field is held to its store's limit — a listing
 * that is one character over is rejected at upload, which is the wrong
 * place to find out. The website's figures are written by
 * scripts/build-site.js, from the same record.
 *
 * Templates live in scripts/copy/store/: `fields.json` names each field,
 * and `@file` points at a longer text. A line starting `[android]` or
 * `[ios]` belongs to that platform only.
 */
const fs = require('fs');
const path = require('path');
const { namedFigures, badgeSvg, figures, int, longDate } = require('./copy/figures');
const { certification } = require('./copy/site');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(__dirname, 'copy', 'store');
const META = path.join(ROOT, 'fastlane', 'metadata');

/** Each store's limit for each field, in characters. F-Droid reads the Play files (its summary is short_description). */
const LIMITS = {
  android: { title: 30, short_description: 80, full_description: 4000 },
  ios: { name: 30, subtitle: 30, keywords: 100, promotional_text: 170, description: 4000 },
};

/** Fill `{{KEY}}` from the record; a key it lacks is an error. */
function fill(text, named, where) {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    if (!(k in named)) throw new Error(`${where}: no figure "${k}" in the record — add it to mihrab-methods' certify step`);
    return named[k];
  });
}

function forPlatform(text, platform) {
  return text
    .split('\n')
    .filter(l => !/^\[(android|ios)\]/.test(l) || l.startsWith(`[${platform}]`))
    .map(l => l.replace(/^\[(android|ios)\]/, ''))
    .join('\n');
}

/** Characters as the stores count them: code points. */
const length = s => [...s].length;

function storeFiles(cert) {
  const spec = JSON.parse(fs.readFileSync(path.join(STORE, 'fields.json'), 'utf-8'));
  const out = new Map();
  const problems = [];
  for (const [platform, locales] of Object.entries(spec)) {
    for (const [locale, fields] of Object.entries(locales)) {
      const lang = locale.split('-')[0];
      const named = namedFigures(cert, lang);
      for (const [field, value] of Object.entries(fields)) {
        if (field.startsWith('_')) continue;
        const limit = LIMITS[platform][field];
        if (!limit) throw new Error(`${platform}/${locale}: unknown field ${field}`);
        let text = value.startsWith('@') ? fs.readFileSync(path.join(STORE, value.slice(1)), 'utf-8') : value;
        text = fill(forPlatform(text, platform), named, `${platform}/${locale}/${field}`).trim();
        if (field === 'keywords') checkKeywords(text, fields, spec, platform, locale, problems);
        if (length(text) > limit) problems.push(`${platform}/${locale}/${field}: ${length(text)} characters, the limit is ${limit}`);
        checkWording(text, `${platform}/${locale}/${field}`, problems);
        out.set(path.join(META, platform, locale, `${field}.txt`), `${text}\n`);
      }
    }
  }
  return { out, problems };
}

/** The authorities, which App Store keywords must not name (and the app's name, which they need not repeat). */
const AUTHORITY_WORDS = ['diyanet', 'kemenag', 'habous', 'islamiska', 'förbundet', 'muis', 'jakim', 'takvimi', 'namazvakti', 'aladhan'];

function checkKeywords(text, fields, spec, platform, locale, problems) {
  const words = text.split(',').map(w => w.trim().toLowerCase());
  const name = (fields.name ?? spec[platform]['en-US'].name ?? '').toLowerCase();
  for (const w of words) {
    if (AUTHORITY_WORDS.some(a => w.includes(a))) problems.push(`${platform}/${locale}/keywords: "${w}" names an authority`);
    if (name.split(/[^\p{L}]+/u).includes(w)) problems.push(`${platform}/${locale}/keywords: "${w}" is already in the app's name`);
  }
  if (new Set(words).size !== words.length) problems.push(`${platform}/${locale}/keywords: a word twice`);
}

/** Wording the copy may not use: superlatives of priority, and official endorsement. */
function checkWording(text, where, problems) {
  const banned = [/\bthe only\b/i, /\bthe first\b/i, /\bofficial\b/i, /\bofficially\b/i, /\bendorsed\b/gi, /\bapproved by\b/gi];
  for (const re of banned) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
      // "not affiliated with or endorsed by" is the disclaimer, not a claim
      if (/\bnot\b[^.]{0,40}$/i.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
      problems.push(`${where}: "${m[0]}" — see the copy rules in scripts/copy/README.md`);
    }
  }
}

/** The README's accuracy block: the credit, the badge, the table. */
function readmeBlock(cert) {
  const { by, total } = figures(cert);
  const rows = [
    '| Matches the published timetable of | Times checked | Off the printed minute |',
    '|---|---:|---:|',
    ...['sweden', 'diyanet', 'morocco', 'algeria', 'indonesia'].map(id => {
      const label = {
        sweden: 'Islamiska Förbundet (Sweden), and Diyanet’s tables for Sweden',
        diyanet: 'Diyanet, Türkiye and worldwide',
        morocco: 'Morocco’s Ministry of Habous and Islamic Affairs',
        algeria: 'Algeria’s Ministry of Religious Affairs and Wakfs',
        indonesia: 'Indonesia’s Kemenag',
      }[id];
      return `| ${label} | ${int(by[id].times)} | **${int(by[id].off)}** |`;
    }),
  ];
  return [
    '<div align="center">',
    '',
    `<a href="https://github.com/MihrabHQ/mihrab-methods"><img src="branding/badges/certification.svg" alt="certified: ${int(total.off)} of ${int(total.times)} times off the printed minute"></a>`,
    '',
    `Prayer times computed with **[mihrab-methods](https://github.com/MihrabHQ/mihrab-methods)**, the authorities’ own methods checked against every time they have published.`,
    '',
    '</div>',
    '',
    ...rows,
    '',
    `<sub>Last checked ${longDate(total.checkedAt)}. Generated from mihrab-methods’ <code>certification.json</code> by <code>scripts/build-copy.js</code>. Mihrab is independent and not affiliated with any of these authorities.</sub>`,
  ].join('\n');
}

/** Every locale's files, generated or not, held to the same limits. */
function checkAllLimits(out, problems) {
  for (const [platform, limits] of Object.entries(LIMITS)) {
    const dir = path.join(META, platform);
    for (const locale of fs.readdirSync(dir)) {
      for (const [field, limit] of Object.entries(limits)) {
        const file = path.join(dir, locale, `${field}.txt`);
        const text = out.get(file) ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null);
        if (text !== null && length(text.trim()) > limit) {
          const msg = `${platform}/${locale}/${field}: ${length(text.trim())} characters, the limit is ${limit}`;
          if (!problems.includes(msg)) problems.push(msg);
        }
      }
    }
  }
}

function build() {
  const cert = certification();
  const { out, problems } = storeFiles(cert);
  checkAllLimits(out, problems);
  const readme = path.join(ROOT, 'README.md');
  const text = fs.readFileSync(readme, 'utf-8');
  const re = /(<!-- accuracy:start -->\n)[\s\S]*?(<!-- accuracy:end -->)/;
  if (!re.test(text)) throw new Error('README.md has no <!-- accuracy:start --> … <!-- accuracy:end --> block');
  out.set(readme, text.replace(re, (_, a, b) => `${a}${readmeBlock(cert)}\n${b}`));
  out.set(path.join(ROOT, 'branding', 'badges', 'certification.svg'), badgeSvg(cert));
  return { out, problems };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const { out, problems } = build();
  if (problems.length) {
    console.error('✗ store copy breaks a rule:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const stale = [];
  for (const [file, text] of out) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
    if (have === text) continue;
    stale.push(path.relative(ROOT, file));
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }
  // The Play Console import is made from the fastlane files just written.
  if (!check) {
    const csv = require('./store-listing-csv');
    const text = csv.render();
    if (!fs.existsSync(csv.OUT) || fs.readFileSync(csv.OUT, 'utf-8') !== text) {
      fs.writeFileSync(csv.OUT, text);
      stale.push(path.relative(ROOT, csv.OUT));
    }
  }
  if (!stale.length) console.log(`✓ copy is current (${out.size} files)`);
  else if (check) {
    console.error(`✗ out of date: ${stale.join(', ')}\n  Fix with: node scripts/build-copy.js`);
    process.exit(1);
  } else console.log(`✓ wrote ${stale.length} file(s):\n  ${stale.join('\n  ')}`);
}

module.exports = { build, LIMITS, fill, forPlatform };
