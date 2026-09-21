#!/usr/bin/env node
/**
 * Assemble build/bundle — the read-only files the app reads off disk, which
 * the phones carry in their bundle:
 *
 *   quran/     the Qur'an text and translations (the repo's assets/quran)
 *   sounds/    the adhan recordings (the same mp3s Android ships in res/raw)
 *
 * Packaged, this folder becomes resources/bundle; in a checkout, the main
 * process reads it from here.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'build', 'bundle');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets', 'quran'), path.join(OUT, 'quran'), { recursive: true });

const raw = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw');
fs.mkdirSync(path.join(OUT, 'sounds'));
let n = 0;
for (const f of fs.readdirSync(raw)) {
  if (!f.endsWith('.mp3')) continue;
  fs.copyFileSync(path.join(raw, f), path.join(OUT, 'sounds', f));
  n++;
}
console.log(`bundle: quran + ${n} sounds -> ${path.relative(process.cwd(), OUT)}`);
