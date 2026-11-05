#!/usr/bin/env node
/**
 * Build the store panels.
 *
 *   node branding/tools/panels/build.mjs <set> [--lang=en,sv|all] [panel numbers…]
 *
 * A set (sets/<name>.mjs) exports { W, H, out, panels, face }: each panel
 * { id, html(ctx) } with ctx = { W, H, u, i, n, t } — t(key) the caption
 * in the language being built. Panels land in <out>/<lang>/NN_<id>.png.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE, LANGS, RTL, page, strings } from './kit.mjs';
import { renderAll } from './render.mjs';

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const only = args.filter(a => /^\d+$/.test(a));
const langArg = (args.find(a => a.startsWith('--lang=')) ?? '--lang=en').slice(7);
const langs = langArg === 'all' ? LANGS : langArg.split(',');
if (!name) {
  console.error('usage: build.mjs <set> [--lang=en,sv|all] [panel numbers…]');
  process.exit(1);
}
const set = await import(pathToFileURL(path.join(HERE, 'sets', name + '.mjs')).href);
const { W, H, panels, out } = set;
const n = panels.length;
const u = Math.min(W, H) / 100;
const jobs = [];
for (const lang of langs) {
  const t = strings(lang);
  if (t.missing.length) console.warn(`  ${lang}: ${t.missing.length} caption(s) still in English`);
  panels.forEach((p, i) => {
    if (only.length && !only.includes(String(i + 1))) return;
    jobs.push({
      W,
      H,
      out: path.join(out, lang, `${String(i + 1).padStart(2, '0')}_${p.id}.${set.ext ?? 'png'}`),
      html: page(W, H, i, n, p.html({ W, H, u, i, n, t, rtl: RTL.has(lang) }), {
        ...(set.backdrop ?? {}),
        ...(p.backdrop ?? {}),
        face: set.face,
        lang,
        rtl: RTL.has(lang),
      }),
    });
  });
}
console.log(`${name}: ${jobs.length} panel(s), ${W}×${H}, ${langs.join(' ')}`);
await renderAll(jobs);
