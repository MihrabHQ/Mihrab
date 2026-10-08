#!/usr/bin/env node
/**
 * Build the data mirror that the app reads before it falls back to the
 * original hosts. Output goes to <out>/<release-tag>/<asset>, ready for
 * `gh release upload`. Files are byte-for-byte what the upstream answered
 * (validated first), so the app parses mirror and upstream identically.
 *
 *   node scripts/mirror/build-mirror.js [outDir]        (default /tmp/mihrab-mirror)
 *
 * Tags / assets:
 *   data-tafsir-v1         <edition>__<surah>.json     (spa5k/tafsir_api, MIT)
 *   data-wordmeanings-v1   <surah>.json                (QuranEnc arabic_seraj)
 *   data-riwayah-v1        <id>.json                   (Quranpedia / KFGQPC)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || '/tmp/mihrab-mirror');

const tafsirSrc = fs.readFileSync(path.join(root, 'src/quran/tafsir.ts'), 'utf8');
const editions = [
  ...tafsirSrc.slice(tafsirSrc.indexOf('TAFSIR_EDITIONS')).matchAll(/^\s+id: '([^']+)'/gm),
].map(m => m[1]);

const RIWAYAH = { warsh: 4, qalun: 7, shubah: 9 };

async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error(url + ': ' + last.message);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    }),
  );
}

function put(tag, name, buf) {
  const dir = path.join(out, tag);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
}

(async () => {
  const surahs = Array.from({ length: 114 }, (_, i) => i + 1);
  const report = {};

  // Tafsir: a surah upstream has no file for is simply absent (the app
  // treats a mirror 404 as "ask upstream").
  const tJobs = editions.flatMap(e => surahs.map(s => ({ e, s })));
  let missing = 0;
  await pool(tJobs, 6, async ({ e, s }) => {
    // jsDelivr refuses files over 20 MB (403); GitHub raw has no such limit.
    let buf;
    try {
      buf = await get(`https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${e}/${s}.json`, 2);
    } catch {
      buf = await get(`https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/${e}/${s}.json`);
    }
    if (!buf) { missing++; return; }
    const rows = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(rows) && !Array.isArray(rows && rows.ayahs)) throw new Error(`tafsir ${e}/${s} not an array`);
    put('data-tafsir-v1', `${e}__${s}.json`, buf);
  });
  report.tafsir = { editions: editions.length, missing };

  // Word meanings: refuse a short surah (the app does too).
  const AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
  await pool(surahs, 6, async s => {
    const buf = await get(`https://quranenc.com/api/v1/translation/sura/arabic_seraj/${s}`);
    if (!buf) throw new Error('wordmeanings 404 ' + s);
    const rows = JSON.parse(buf.toString('utf8')).result;
    const expected = AYAHS[s - 1];
    if (!Array.isArray(rows) || rows.length === 0 || rows.length < expected) {
      throw new Error('wordmeanings incomplete ' + s);
    }
    put('data-wordmeanings-v1', `${s}.json`, buf);
  });
  report.wordmeanings = 114;

  for (const [id, n] of Object.entries(RIWAYAH)) {
    const buf = await get(`https://api.quranpedia.net/v1/mushafs/${n}`);
    if (!buf) throw new Error('riwayah 404 ' + id);
    JSON.parse(buf.toString('utf8'));
    put('data-riwayah-v1', `${id}.json`, buf);
  }
  report.riwayah = Object.keys(RIWAYAH);
  console.log(JSON.stringify(report));
})().catch(e => { console.error(e); process.exit(1); });
