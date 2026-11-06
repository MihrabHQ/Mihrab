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
 *   data-tafsir-<edition>       <surah>.json         (spa5k/tafsir_api, MIT; three
 *                                                     Tanzil editions via alquran.cloud)
 *   data-translation-<edition>  <surah>.json         (the translations that are
 *                                                     downloads: alquran.cloud, QuranEnc)
 *
 * A release takes at most 1,000 assets, so an edition gets a release of its
 * own and the asset is the surah — `editionMirrorTag` in src/config/mirrors.ts
 * works out the same name on the app's side. `data-tafsir-v1`, where the six
 * editions of 2.7.28 all lived, is frozen for the versions that read it and
 * is not written here any more.
 *   data-wordmeanings-v1   <surah>.json                (QuranEnc arabic_seraj)
 *   data-riwayah-v1        <id>.json, each face, licence (Quranpedia / KFGQPC)
 *   data-indopak-v1        text, font and both licences (DigitalKhatt, pinned commit)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || '/tmp/mihrab-mirror');

/**
 * The editions, read off the registries: each entry's id, and where it
 * comes from (`source` / `sourceId`; absent means the Quran.com corpus for
 * a tafsir). A translation without a `source` ships as an asset and has
 * no mirror file.
 */
function editionsOf(file, listName, defaultSource) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const body = src.slice(src.indexOf(listName), src.indexOf('] as const;', src.indexOf(listName)));
  const out = [];
  for (const m of body.matchAll(/\{[^{}]*?id: '([^']+)'[^{}]*?\}/gs)) {
    const entry = m[0];
    const source = (/source: '([^']+)'/.exec(entry) || [])[1] || defaultSource;
    const sourceId = (/sourceId: '([^']+)'/.exec(entry) || [])[1] || m[1];
    if (source) out.push({ id: m[1], source, sourceId });
  }
  return out;
}
const tafsirEditions = editionsOf('src/quran/tafsir.ts', 'TAFSIR_EDITIONS', 'quran.com');
const translationEditions = editionsOf('src/quran/translations.ts', 'QURAN_TRANSLATIONS', null);

/** The same answers the app parses (`src/quran/textSources.ts`). */
const SOURCES = {
  'quran.com': {
    urls: (id, s) => [
      // jsDelivr refuses files over 20 MB (403); GitHub raw has no such limit.
      `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${id}/${s}.json`,
      `https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/${id}/${s}.json`,
    ],
    rows: json => (Array.isArray(json) ? json : json && json.ayahs),
    // A CDN; six at a time is nothing to it.
    concurrency: 6,
  },
  tanzil: {
    urls: (id, s) => [`https://api.alquran.cloud/v1/surah/${s}/${id}`],
    rows: json => json && json.data && json.data.ayahs,
    // One server, and it answers a sixth concurrent request with 429.
    concurrency: 2,
  },
  quranenc: {
    urls: (id, s) => [`https://quranenc.com/api/v1/translation/sura/${id}/${s}`],
    rows: json => json && json.result,
    // One server too, steadier than alquran.cloud but not a CDN.
    concurrency: 3,
  },
};

const RIWAYAH = { warsh: 4, qalun: 7, shubah: 9 };

// The faces the Quranpedia muṣḥafs are set in, read from the one place
// the pins live (`src/quran/riwayahFonts.ts`): the file name and
// Quranpedia's URL for each. The app checks the bytes against those pins.
//
// The pins are version 2 of each face, because the mirrored text is
// version 2 of each muṣḥaf. Quranpedia has since re-encoded its text for
// version 3 of the fonts, and the app's verifier refuses that text (it
// spells hamzat al-waṣl with letters the reference corpus does not have),
// so a rebuild must NOT replace the mirrored text with it: a record whose
// `font_file` is not the pinned face is left as the mirror already has it.
const fontsSrc = fs.readFileSync(path.join(root, 'src/quran/riwayahFonts.ts'), 'utf8');
const FONTS_BASE = /QURANPEDIA_FONTS = '([^']+)'/.exec(fontsSrc)[1];
const RIWAYAH_FONTS = Object.fromEntries(
  [...fontsSrc.matchAll(/(\w+): \{\s*name: '([^']+\.ttf)',[\s\S]*?original: `\$\{QURANPEDIA_FONTS\}\/([^`]+)`/g)].map(
    m => [m[1], { name: m[2], url: `${FONTS_BASE}/${m[3]}` }],
  ),
);
if (Object.keys(RIWAYAH_FONTS).sort().join() !== Object.keys(RIWAYAH).sort().join()) throw new Error('riwayahFonts.ts: expected one face per muṣḥaf');

// DigitalKhatt IndoPak: text (MIT) and font (OFL), pinned to one commit so
// the release and the fallback are the same bytes. Both licence texts ride
// along, as MIT and OFL ask of anyone redistributing the files.
// Read from `src/quran/indopakSource.ts`, the one place the pin lives.
const indopakSrc = fs.readFileSync(path.join(root, 'src/quran/indopakSource.ts'), 'utf8');
const INDOPAK_COMMIT = /INDOPAK_COMMIT = '([0-9a-f]{40})'/.exec(indopakSrc)[1];
const INDOPAK_RAW = `https://raw.githubusercontent.com/DigitalKhatt/digitalkhatt-js/${INDOPAK_COMMIT}`;
const INDOPAK_FILES = Object.fromEntries([
  ...[...indopakSrc.matchAll(/name: '([^']+)',\s*repoPath: '([^']+)'/g)].map(m => [m[1], m[2]]),
  ['LICENSE-DigitalKhatt-MIT.txt', 'LICENSE'],
]);
if (Object.keys(INDOPAK_FILES).length !== 3) throw new Error('indopakSource.ts: expected two files');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One file from a source.
 *
 * 429 is the one answer worth waiting out rather than retrying over:
 * alquran.cloud refuses a sixth concurrent request and keeps refusing for
 * a moment, so a flat backoff turns a whole edition into failures. Its
 * `Retry-After` is honoured when it sends one, and the wait grows
 * steeply either way. 404 is not a failure: a surah some editions simply
 * do not have (the app treats a missing mirror file as "ask upstream").
 */
async function get(url, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (r.status === 429) {
        const after = Number(r.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * (i + 1));
        throw new Error('HTTP 429');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      last = e;
      await sleep(800 * (i + 1));
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

/** Already built and not empty — a re-run after a refusal resumes. */
function have(tag, name) {
  try {
    return fs.statSync(path.join(out, tag, name)).size > 0;
  } catch {
    return false;
  }
}

(async () => {
  const surahs = Array.from({ length: 114 }, (_, i) => i + 1);
  const report = {};

  // A surah upstream has no file for is simply absent (the app treats a
  // mirror 404 as "ask upstream"). A surah that answers but not with rows
  // is an error: the mirror must never hold a file the app cannot read.
  const mirrorEditions = async (kind, list) => {
    let missing = 0;
    let kept = 0;
    // One pool PER SOURCE, at the rate that source will take: a CDN is
    // happy with six at once, alquran.cloud answers a seventh request with
    // 429 and sulks. The sources run alongside each other, each at its own
    // pace, so the polite one does not hold the quick one up.
    await Promise.all(
      Object.entries(SOURCES).map(async ([name, src]) => {
        const editions = list.filter(e => e.source === name);
        const jobs = editions.flatMap(e => surahs.map(s => ({ e, s })));
        await pool(jobs, src.concurrency, async ({ e, s }) => {
          const tag = `data-${kind}-${e.id}`;
          const asset = `${s}.json`;
          if (have(tag, asset)) { kept++; return; }
          const urls = src.urls(e.sourceId, s);
          let buf = null;
          for (let i = 0; i < urls.length; i++) {
            try {
              buf = await get(urls[i], i < urls.length - 1 ? 2 : 5);
              break;
            } catch (err) {
              if (i === urls.length - 1) throw err;
            }
          }
          if (!buf) { missing++; return; }
          const rows = src.rows(JSON.parse(buf.toString('utf8')));
          if (!Array.isArray(rows)) throw new Error(`${tag}/${s} has no rows`);
          put(tag, asset, buf);
        });
      }),
    );
    return { editions: list.length, missing, kept };
  };
  report.tafsir = await mirrorEditions('tafsir', tafsirEditions);
  report.translations = await mirrorEditions('translation', translationEditions);

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

  const riwayahKept = [];
  for (const [id, n] of Object.entries(RIWAYAH)) {
    const buf = await get(`https://api.quranpedia.net/v1/mushafs/${n}`);
    if (!buf) throw new Error('riwayah 404 ' + id);
    const record = JSON.parse(buf.toString('utf8'));
    if (record.font_file === RIWAYAH_FONTS[id].url) put('data-riwayah-v1', `${id}.json`, buf);
    else riwayahKept.push(id);
    const font = await get(RIWAYAH_FONTS[id].url);
    if (!font) throw new Error('riwayah font 404 ' + id);
    if (font.readUInt32BE(0) !== 0x00010000) throw new Error('riwayah font is not a TrueType file: ' + id);
    put('data-riwayah-v1', RIWAYAH_FONTS[id].name, font);
  }
  put('data-riwayah-v1', 'LICENSE-KFGQPC-fonts.txt', fs.readFileSync(path.join(__dirname, 'LICENSE-KFGQPC-fonts.txt')));
  report.riwayah = {
    mushafs: Object.keys(RIWAYAH),
    // Quranpedia serves a newer encoding than the pinned face: the release
    // keeps the text it has. Do not upload a <id>.json this run did not write.
    kept: riwayahKept,
    fonts: Object.values(RIWAYAH_FONTS).map(f => f.name),
  };

  for (const [name, repoPath] of Object.entries(INDOPAK_FILES)) {
    const buf = await get(`${INDOPAK_RAW}/${repoPath}`);
    if (!buf) throw new Error('indopak 404 ' + name);
    if (name.endsWith('.ts') && !/[\u0600-\u06FF]/.test(buf.toString('utf8'))) throw new Error('indopak text is not Arabic');
    if (name.endsWith('.ttf') && buf.readUInt32BE(0) !== 0x00010000) throw new Error('indopak font is not a TrueType file');
    put('data-indopak-v1', name, buf);
  }
  // The repo ships no OFL file; the font's own notice plus the OFL 1.1 text.
  put('data-indopak-v1', 'OFL-DigitalKhattIndoPak.txt', fs.readFileSync(path.join(__dirname, 'OFL-DigitalKhattIndoPak.txt')));
  report.indopak = { commit: INDOPAK_COMMIT, files: Object.keys(INDOPAK_FILES).length + 1 };
  console.log(JSON.stringify(report));
})().catch(e => { console.error(e); process.exit(1); });
