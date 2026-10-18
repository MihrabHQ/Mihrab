#!/usr/bin/env node
/**
 * Copies mihrab-methods' certification.json into data/methods/, where the
 * site and store generators read it. The build never fetches: the copy is
 * committed, so what the copy says is reviewable in the same diff as the
 * record it came from.
 *
 *   node scripts/copy/sync-certification.js ../mihrab-methods/certification.json
 *   node scripts/copy/sync-certification.js https://raw.githubusercontent.com/MihrabHQ/mihrab-methods/main/certification.json
 *
 * Then: node scripts/build-site.js && node scripts/build-copy.js
 */
const fs = require('fs');
const path = require('path');
const { figures } = require('./figures');

const DEST = path.join(__dirname, '..', '..', 'data', 'methods', 'certification.json');

async function main() {
  const from = process.argv[2];
  if (!from) {
    console.error('usage: node scripts/copy/sync-certification.js <path or https URL of certification.json>');
    process.exit(2);
  }
  const text = /^https:\/\//.test(from) ? await (await fetch(from)).text() : fs.readFileSync(from, 'utf-8');
  const cert = JSON.parse(text);
  // Refuse a record the generators cannot quote from: every figure must be there.
  const { total } = figures(cert);
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, `${JSON.stringify(cert, null, 2)}\n`);
  console.log(`✓ data/methods/certification.json — ${total.certified}/${total.authorities} certified, ${total.off} of ${total.times} off, checked ${total.checkedAt}`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
