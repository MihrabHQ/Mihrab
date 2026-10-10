#!/usr/bin/env node
/**
 * Instrument Metro's module loader so a release build records, for every
 * module it initialises, how long its factory took (inclusive and self).
 *
 *   node tools/startup-trace/patch-require.js apply    # before the build
 *   node tools/startup-trace/patch-require.js restore  # always, after it
 *
 * The record is printed to logcat by `reportBoot` (src/boot/bootTimeline.ts)
 * through `global.__mihrabTraceDump`, which only a patched build defines.
 * Never ship a patched build: run.sh restores the file even on failure.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../node_modules/metro-runtime/src/polyfills/require.js');
const BACKUP = FILE + '.mihrab-trace-backup';
const MARK = '/* mihrab-startup-trace */';

const HEADER = `${MARK}
var __mtNow = function () {
  return typeof global.nativePerformanceNow === 'function' ? global.nativePerformanceNow() : Date.now();
};
var __mtRows = [];
var __mtStack = [];
global.__mihrabTraceDump = function () {
  var rows = __mtRows.map(function (r) { return r[0] + ':' + r[1].toFixed(1) + ':' + r[2].toFixed(1); });
  var CHUNK = 60;
  var n = Math.ceil(rows.length / CHUNK);
  for (var i = 0; i < n; i++) {
    console.log('[trace ' + (i + 1) + '/' + n + '] ' + rows.slice(i * CHUNK, (i + 1) * CHUNK).join(' '));
  }
};
`;

const CALL = `    factory(
      global,
      metroRequire,
      metroImportDefault,
      metroImportAll,
      moduleObject,
      moduleObject.exports,
      dependencyMap,
    );`;

const WRAPPED = `    var __mtT0 = __mtNow();
    __mtStack.push(0);
    try {
${CALL}
    } finally {
      var __mtIncl = __mtNow() - __mtT0;
      var __mtChild = __mtStack.pop();
      if (__mtStack.length) __mtStack[__mtStack.length - 1] += __mtIncl;
      __mtRows.push([moduleId, __mtIncl - __mtChild, __mtIncl]);
    }`;

function apply() {
  const src = fs.readFileSync(FILE, 'utf8');
  if (src.includes(MARK)) {
    console.log('already patched');
    return;
  }
  if (!src.includes(CALL)) throw new Error('factory call not found: Metro changed, update the patch');
  fs.writeFileSync(BACKUP, src);
  const out = src.replace('"use strict";\n', '"use strict";\n' + HEADER).replace(CALL, WRAPPED);
  fs.writeFileSync(FILE, out);
  console.log('patched', FILE);
}

function restore() {
  if (fs.existsSync(BACKUP)) {
    fs.writeFileSync(FILE, fs.readFileSync(BACKUP));
    fs.unlinkSync(BACKUP);
    console.log('restored', FILE);
  } else {
    const src = fs.readFileSync(FILE, 'utf8');
    if (src.includes(MARK)) throw new Error('patched but no backup: reinstall metro-runtime');
    console.log('nothing to restore');
  }
}

const cmd = process.argv[2];
if (cmd === 'apply') apply();
else if (cmd === 'restore') restore();
else {
  console.error('usage: patch-require.js apply|restore');
  process.exit(2);
}
