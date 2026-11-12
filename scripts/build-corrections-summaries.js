#!/usr/bin/env node
/**
 * The bundled correction lists' summaries — the dates each covers and how
 * many times it moves — written to src/providers/data/correctionsSummaries.json.
 *
 *   npm run build-corrections-summaries
 *
 * `methodCurrency.ts` compares a downloaded list against the bundled one
 * by its summary at every launch; reading the summary from here spares
 * the bundled list's require (Diyanet's, 3 ms on a Pixel 10 Pro) for a
 * reader whose times that list never touches. A test pins this file to
 * the lists (swedenCorrections.test.ts): run this after changing one.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '../src/providers/data');
const AUTHORITIES = ['sweden', 'diyanet', 'morocco', 'algeria', 'indonesia', 'tatarstan', 'cdum', 'albania', 'bulgaria', 'egypt', 'kuwait', 'qatar', 'jordan', 'kazakhstan', 'brunei'];
const out = {};
for (const a of AUTHORITIES) {
  const list = JSON.parse(fs.readFileSync(path.join(DATA, `${a}Corrections.json`), 'utf8'));
  out[a] = {
    from: list.from,
    to: list.to,
    entries: Object.values(list.points).reduce((n, e) => n + e.length, 0),
  };
}
const dest = path.join(DATA, 'correctionsSummaries.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), dest)}`);
