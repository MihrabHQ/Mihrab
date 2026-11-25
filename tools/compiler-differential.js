#!/usr/bin/env node
/**
 * Compiled and as written, held to the same output.
 *
 *   node tools/compiler-differential.js            every render test
 *   node tools/compiler-differential.js Tasbih     the tests matching a pattern
 *   node tools/compiler-differential.js --keep     leave the recordings (the path is printed)
 *
 * Every test that renders with react-test-renderer is run three times under
 * the recorder (jest/differential.js, which says what is recorded and why):
 * twice AS WRITTEN (the React Compiler off) and once COMPILED. A step the
 * two as-written runs do not agree on is not the same from run to run
 * whatever the compiler does (a random id, an order that depends on timing)
 * and is set aside, counted. Every other step must be drawn the same
 * compiled as it is as written; one that is not — and is not again on a
 * second compiled run — is printed, with the first place the two differ,
 * and the run fails.
 *
 * A difference means a compiled component came to another answer than the
 * same component as written — it read something React does not know about
 * (babel.reactCompiler.js). The ways out are there and in CONTRIBUTING.md:
 * hand the value in, subscribe to it, or `'use no memo'`.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const pattern = args.find(a => !a.startsWith('--'));

function renderTests() {
  const dir = path.join(root, '__tests__');
  const found = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) {
        if (name !== 'fixtures') walk(p);
      } else if (/\.test\.tsx?$/.test(name) && /react-test-renderer/.test(fs.readFileSync(p, 'utf8'))) {
        found.push(p);
      }
    }
  })(dir);
  return found.filter(f => !pattern || f.includes(pattern)).sort();
}

function run(name, compiled, files, work) {
  const out = path.join(work, name);
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/jest/bin/jest.js'),
        '--ci',
        '--silent',
        // Three runs share the machine: a slow first render is not a difference.
        '--testTimeout=120000',
        // Compiled and as written are different code for the same file:
        // each its own transform cache.
        '--cacheDirectory',
        path.join(os.tmpdir(), `mihrab-differential-${compiled ? 'compiled' : 'written'}`),
        '--runTestsByPath',
        ...files,
      ],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'test', MIHRAB_DIFFERENTIAL: out, MIHRAB_COMPILER: compiled ? 'on' : 'off' },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let err = '';
    child.stderr.on('data', d => (err += d));
    child.on('close', () => resolve({ out, summary: (/Tests:.*$/m.exec(err) || ['?'])[0] }));
  });
}

function load(dir) {
  const byFile = {};
  if (!fs.existsSync(dir)) return byFile;
  for (const name of fs.readdirSync(dir)) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    byFile[data.file] = data;
  }
  return byFile;
}

/** The steps of a file, keyed by test and by their order within it. */
function keyed(data) {
  const map = new Map();
  const nth = new Map();
  for (const s of data.steps) {
    // A test named twice in a file (`it.each` aside) shares its name: the
    // order within the name tells them apart.
    const k = `${s.test} › ${s.step}`;
    const n = nth.get(k) || 0;
    nth.set(k, n + 1);
    map.set(n ? `${k} (${n})` : k, s.hash);
  }
  return map;
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 160);
  return { written: a.slice(from, i + 200), compiled: b.slice(from, i + 200) };
}

(async () => {
  const files = renderTests();
  if (files.length === 0) {
    console.error('no render tests found');
    process.exit(1);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mihrab-differential-'));
  // As written twice, one after the other (they share a transform cache);
  // compiled beside the first.
  const [written, compiled] = await Promise.all([run('written', false, files, work), run('compiled', true, files, work)]);
  const again = await run('written-again', false, files, work);

  const W = load(written.out);
  const W2 = load(again.out);
  const C = load(compiled.out);
  let same = 0;
  let unsteady = 0;
  let missing = 0;
  const differences = [];
  for (const file of Object.keys(W).sort()) {
    const w = keyed(W[file]);
    const w2 = W2[file] ? keyed(W2[file]) : new Map();
    const c = C[file] ? keyed(C[file]) : new Map();
    for (const [key, hash] of w) {
      if (w2.get(key) !== hash) {
        unsteady++;
        continue;
      }
      const other = c.get(key);
      if (other === hash) {
        same++;
      } else if (other === undefined) {
        // A step only one of them reached: an `act` more or fewer is a
        // difference in what the test did, and is one.
        missing++;
        differences.push({ file, key, written: W[file].texts[hash], compiled: null });
      } else {
        differences.push({ file, key, written: W[file].texts[hash], compiled: C[file].texts[other] });
      }
    }
  }
  // A difference has to be there twice. What is not the same from run to
  // run is set aside above by the two as-written runs, but chance can agree
  // twice and differ the third time; a second compiled run of the files in
  // question says which this is.
  let passing = 0;
  if (differences.length) {
    const suspect = [...new Set(differences.map(d => path.join(root, d.file)))];
    const second = await run('compiled-again', true, suspect, work);
    const C2 = load(second.out);
    for (let i = differences.length - 1; i >= 0; i--) {
      const d = differences[i];
      const c2 = C2[d.file] ? keyed(C2[d.file]) : new Map();
      const w = keyed(W[d.file]);
      if (c2.get(d.key) === w.get(d.key)) {
        differences.splice(i, 1);
        passing++;
      }
    }
    missing = differences.filter(d => d.compiled == null).length;
  }
  const recorded = Object.keys(W).length;
  console.log(
    `${files.length} render tests (${recorded} drew something) · ${same} steps the same compiled and as written · ` +
      `${unsteady} set aside (not the same twice as written) · ${differences.length} different` +
      (passing ? ` (${passing} more differed once and not again)` : ''),
  );
  console.log(`as written: ${written.summary}\ncompiled:   ${compiled.summary}`);
  if (same === 0) {
    console.error('✗ nothing was compared — the recorder did not run');
    process.exit(1);
  }
  // The canary (__tests__/compiledAsWritten.test.tsx) reads the clock while
  // rendering: if the shake did not change what it draws, the shake is not
  // working, and nothing above means anything.
  if (!pattern) {
    const canary = (W['__tests__/compiledAsWritten.test.tsx'] || { steps: [] }).steps.filter(s => /^canary/.test(s.test));
    const end = canary.find(s => /:again:/.test(s.step));
    const shaken = canary.find(s => /:clock:/.test(s.step));
    if (!end || !shaken || end.hash === shaken.hash) {
      console.error('✗ the canary was not moved by the shake — the recorder is not doing its work (jest/differential.js)');
      process.exit(1);
    }
  }
  const shown = new Set();
  for (const d of differences) {
    const head = `${d.file} › ${d.key.replace(/ › \d+:([\w+]+):tree(\d+).*$/, ' — $1, tree $2')}`;
    if (shown.has(head)) continue;
    shown.add(head);
    if (shown.size > 25) {
      console.error(`… and ${differences.length - 25} more`);
      break;
    }
    console.error(`\n✗ ${head}`);
    if (d.compiled == null) {
      console.error('  compiled, this step was not reached');
    } else {
      const { written: a, compiled: b } = firstDifference(d.written, d.compiled);
      console.error(`  as written: …${a}…\n  compiled:   …${b}…`);
    }
  }
  if (keep || differences.length) console.log(`\nrecordings: ${work}`);
  else fs.rmSync(work, { recursive: true, force: true });
  if (differences.length) {
    console.error(
      `\n✗ ${differences.length} step(s) are drawn differently compiled (${missing} not reached). ` +
        'See babel.reactCompiler.js and CONTRIBUTING.md ("A compiled component reads nothing…").',
    );
    process.exit(1);
  }
  console.log('✓ compiled draws what the code as written draws');
})();
