#!/usr/bin/env node
/**
 * Assemble Mihrab Web: the app built for a browser, and beside it,
 * everything the Qur'an reader would otherwise download — so the web app has
 * no download manager and nothing to wait for.
 *
 *   npx webpack --mode production --env web        # → build/web
 *   node scripts/build-web.js --profile <dir> --out <dir>
 *
 * --profile  a desktop app profile (its userData folder) that has the
 *            muṣḥaf, both tajwīd sets, the four riwāyāt and Husary's word
 *            timings downloaded by the app itself — so every file is in
 *            exactly the form the app writes it. Recitation audio in it is
 *            left out: the web app plays from the reciter's own server.
 * --out      the web app site's folder (the MihrabHQ.github.io repository).
 *
 * The hard-word meanings are fetched here, from the app's own mirror, and
 * written as the app writes them (src/quran/wordMeanings.ts).
 *
 * `files/index.json` lists every preloaded file with its size: the web app's
 * file layer (web/webapp/bridge.js) answers exists/stat/ls from it.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const profile = arg('profile');
const out = arg('out');
if (!profile || !out) {
  console.error('usage: build-web.js --profile <app profile> --out <site folder>');
  process.exit(1);
}

const DESKTOP = path.resolve(__dirname, '..');
const BUILD = path.join(DESKTOP, 'build', 'web');
const BUNDLE = path.join(DESKTOP, 'build', 'bundle');
const DOCS = path.join(profile, 'Documents');
const FILES = path.join(out, 'files');
const MIRROR = 'https://github.com/MihrabHQ/Mihrab/releases/download/data-wordmeanings-v1';
// A fixed stamp, so rebuilding the site does not rewrite 114 unchanged files.
const WORD_MEANINGS_STAMP = '2026-01-01T00:00:00.000Z';

/** What the profile must hold, and how many files at least. */
const PRELOADED = [
  ['quran/fonts/v2', 605], // 604 pages + the release stamp
  ['quran/fonts/v4-tajweed', 1208], // light and dark
  ['quran/riwayat/v1/indopak', 5],
  ['quran/riwayat/v1/warsh', 3],
  ['quran/riwayat/v1/qalun', 3],
  ['quran/riwayat/v1/shubah', 3],
];
const TIMINGS = 'quran/timings/husary.json';

async function copyDir(from, to) {
  await fsp.mkdir(to, { recursive: true });
  await fsp.cp(from, to, { recursive: true, filter: src => !/\.(part|dl)$/.test(src) });
}

async function count(dir) {
  return (await fsp.readdir(dir)).filter(n => !n.startsWith('.')).length;
}

async function wordMeanings(dest) {
  await fsp.mkdir(dest, { recursive: true });
  const surahs = path.join(DESKTOP, '..', 'assets', 'quran', 'surahs');
  let next = 1;
  const worker = async () => {
    for (;;) {
      const surah = next++;
      if (surah > 114) return;
      const expected = JSON.parse(await fsp.readFile(path.join(surahs, `${String(surah).padStart(3, '0')}.json`), 'utf8')).arabic.length;
      let body = null;
      for (let attempt = 1; attempt <= 3 && !body; attempt++) {
        try {
          const res = await fetch(`${MIRROR}/${surah}.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          body = await res.json();
        } catch (e) {
          if (attempt === 3) throw new Error(`word meanings ${surah}: ${e.message}`);
        }
      }
      const rows = body?.result;
      // As the app insists: the surah's whole ayah list, or nothing.
      if (!Array.isArray(rows) || rows.length < expected) throw new Error(`word meanings ${surah}: ${rows?.length} of ${expected} ayahs`);
      const glosses = {};
      for (const r of rows) {
        const text = String(r.translation ?? '').trim();
        if (text) glosses[String(r.aya)] = text;
      }
      await fsp.writeFile(path.join(dest, `${surah}.json`), JSON.stringify({ v: 1, fetchedAt: WORD_MEANINGS_STAMP, glosses }));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function manifest(root) {
  const index = {};
  const walk = async rel => {
    for (const e of await fsp.readdir(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name.startsWith('.') || r === 'index.json') continue;
      if (e.isDirectory()) await walk(r);
      else index[r] = (await fsp.stat(path.join(root, r))).size;
    }
  };
  await walk('');
  return index;
}

(async () => {
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) throw new Error('no build/web: run `npx webpack --mode production --env web` first');
  for (const [rel, min] of PRELOADED) {
    const dir = path.join(DOCS, rel);
    if (!fs.existsSync(dir) || (await count(dir)) < min) throw new Error(`the profile is missing ${rel} (want ${min} files)`);
  }
  if (!fs.existsSync(path.join(DOCS, TIMINGS))) throw new Error(`the profile is missing ${TIMINGS}`);

  // The app, replacing the last one but keeping the repository's own files.
  await fsp.mkdir(out, { recursive: true });
  for (const name of await fsp.readdir(out)) {
    if (['.git', '.github', 'README.md', 'LICENSE', 'CNAME'].includes(name)) continue;
    await fsp.rm(path.join(out, name), { recursive: true, force: true });
  }
  await fsp.cp(BUILD, out, { recursive: true });
  await fsp.writeFile(path.join(out, '.nojekyll'), '');
  // What a browser needs to put Mihrab on a home screen or install it.
  for (const name of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    await fsp.copyFile(path.join(DESKTOP, 'web', 'webapp', name), path.join(out, name));
  }

  // The preloaded tree, laid out as the app's own folders are.
  console.log('copying the muṣḥaf, tajwīd and riwāyāt…');
  for (const [rel] of PRELOADED) await copyDir(path.join(DOCS, rel), path.join(FILES, 'Documents', rel));
  await fsp.mkdir(path.dirname(path.join(FILES, 'Documents', TIMINGS)), { recursive: true });
  await fsp.copyFile(path.join(DOCS, TIMINGS), path.join(FILES, 'Documents', TIMINGS));
  await copyDir(BUNDLE, path.join(FILES, 'bundle'));
  console.log('fetching the hard-word meanings…');
  await wordMeanings(path.join(FILES, 'Documents', 'quran', 'wordmeanings'));

  const index = await manifest(FILES);
  await fsp.writeFile(path.join(FILES, 'index.json'), JSON.stringify(index));
  const bytes = Object.values(index).reduce((a, b) => a + b, 0);
  console.log(`Mihrab Web: ${Object.keys(index).length} preloaded files, ${(bytes / 1e6).toFixed(0)} MB → ${out}`);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
