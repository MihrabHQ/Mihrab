#!/usr/bin/env node
/**
 * What the React Compiler does with the folders it is switched on for
 * (babel.reactCompiler.js): every component and hook it compiled, and every
 * one it left as written, with the reason and the line.
 *
 *   node tools/compiler-report.js            a summary, by reason and by file
 *   node tools/compiler-report.js --json     everything, for a script
 *   node tools/compiler-report.js src/quran  one folder or file
 *   node tools/compiler-report.js --check    against the recorded snapshot (below)
 *   node tools/compiler-report.js --update   record it as it is now
 *
 * Not part of the app or of preflight's lint; `__tests__/reactCompilerScope`
 * runs it to hold the count of skipped components where it is.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const babel = require(path.join(root, 'node_modules/@babel/core'));
const { OPTIONS, isListed: isCompiled } = require(path.join(root, 'babel.reactCompiler'));

function filesUnder(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) filesUnder(p, out);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) && isCompiled(p)) out.push(p);
  }
  return out;
}

function reasonOf(detail) {
  const d = detail || {};
  const o = d.options || d;
  return String(o.reason || o.description || d.reason || d.description || '?');
}

function report(only) {
  const compiled = [];
  const skipped = [];
  const files = filesUnder(path.join(root, 'src')).filter(f => !only || path.relative(root, f).startsWith(only));
  for (const file of files) {
    const rel = path.relative(root, file);
    const seen = new Set();
    try {
      babel.transformSync(fs.readFileSync(file, 'utf8'), {
        filename: file,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [
          [
            path.join(root, 'node_modules/babel-plugin-react-compiler'),
            {
              ...OPTIONS,
              logger: {
                logEvent(_filename, e) {
                  const line = e.fnLoc && e.fnLoc.start ? e.fnLoc.start.line : 0;
                  if (e.kind === 'CompileSuccess') {
                    compiled.push({ file: rel, line, name: e.fnName || '' });
                  } else if (e.kind === 'CompileError' || e.kind === 'CompileSkip' || e.kind === 'PipelineError') {
                    const key = `${line}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    const d = e.detail || {};
                    const at = (d.options && d.options.details && d.options.details[0] && d.options.details[0].loc) || d.loc || (d.options && d.options.loc);
                    skipped.push({
                      file: rel,
                      line,
                      reason: e.kind === 'CompileSkip' ? (/directive/.test(String(e.reason)) ? "'use no memo'" : `skip: ${e.reason}`) : reasonOf(d),
                      at: at && at.start ? at.start.line : 0,
                      why: String((d.options && (d.options.description || (d.options.details && d.options.details[0] && d.options.details[0].message))) || d.description || '').slice(0, 400),
                    });
                  }
                },
              },
            },
          ],
        ],
      });
    } catch (error) {
      skipped.push({ file: rel, line: 0, reason: `threw: ${String(error).slice(0, 120)}`, at: 0 });
    }
  }
  return { files: files.length, compiled, skipped };
}

/**
 * WHAT IS LEFT AS WRITTEN, HELD (`compiler-report.snapshot.json`).
 *
 * For each file, how many of its components the compiler leaves alone and
 * why — and the compiler's version. No names and no line numbers: an edit
 * to a file moves nothing here, and a new component that compiles adds
 * nothing. It moves when the SET moves:
 *
 *  - a new version of the compiler compiles what it used to leave, or
 *    leaves what it used to compile (which is why the version is pinned
 *    exactly in package.json, and is part of this);
 *  - a `'use no memo'` is added or taken away;
 *  - a new component is one the compiler will not take.
 *
 * Each of those is worth a look by a person, once.
 * `__tests__/reactCompilerScope.test.ts` fails until the difference has been
 * looked at and recorded: `node tools/compiler-report.js --update`. For a
 * component newly COMPILED (a directive removed, a new compiler), run
 * `node tools/compiler-differential.js` as well: that is the question it
 * answers.
 */
const SNAPSHOT = path.join(__dirname, 'compiler-report.snapshot.json');
const compilerVersion = () =>
  require(path.join(root, 'node_modules/babel-plugin-react-compiler/package.json')).version;

function leftAsWritten() {
  const out = {};
  for (const s of report().skipped) {
    const file = (out[s.file] = out[s.file] || {});
    file[s.reason] = (file[s.reason] || 0) + 1;
  }
  const sorted = {};
  for (const file of Object.keys(out).sort()) {
    sorted[file] = {};
    for (const reason of Object.keys(out[file]).sort()) sorted[file][reason] = out[file][reason];
  }
  return { compiler: compilerVersion(), leftAsWritten: sorted };
}

/** The lines that differ between the snapshot and now; empty when they agree. */
function snapshotDifference() {
  const was = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const now = leftAsWritten();
  const lines = [];
  if (was.compiler !== now.compiler) lines.push(`the compiler is ${now.compiler}; the snapshot was taken with ${was.compiler}`);
  const files = new Set([...Object.keys(was.leftAsWritten), ...Object.keys(now.leftAsWritten)]);
  for (const file of [...files].sort()) {
    const a = was.leftAsWritten[file] || {};
    const b = now.leftAsWritten[file] || {};
    for (const reason of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const before = a[reason] || 0;
      const after = b[reason] || 0;
      if (before === after) continue;
      lines.push(
        after > before
          ? `${file}: ${after - before} more left as written — ${reason}`
          : `${file}: ${before - after} fewer left as written (now compiled, or gone) — ${reason}`,
      );
    }
  }
  return lines;
}

module.exports = { report, leftAsWritten, snapshotDifference };

if (require.main === module) {
  const args = process.argv.slice(2);
  const only = args.find(a => !a.startsWith('--'));
  if (args.includes('--update')) {
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(leftAsWritten(), null, 2)}\n`);
    console.log('recorded what is left as written');
    process.exit(0);
  }
  if (args.includes('--check')) {
    const lines = snapshotDifference();
    for (const l of lines) console.error(`✗ ${l}`);
    if (lines.length) {
      console.error('\nLook at each, then: node tools/compiler-report.js --update');
      process.exit(1);
    }
    console.log('✓ what is left as written is what was recorded');
    process.exit(0);
  }
  const r = report(only);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(r, null, 1));
  } else {
    const by = (key) => {
      const m = new Map();
      for (const s of r.skipped) m.set(s[key], (m.get(s[key]) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    console.log(`${r.files} files · ${r.compiled.length} compiled · ${r.skipped.length} left as written`);
    console.log('\nBy reason:');
    for (const [k, n] of by('reason')) console.log(`  ${String(n).padStart(4)}  ${k}`);
    console.log('\nBy file:');
    for (const [k, n] of by('file')) console.log(`  ${String(n).padStart(4)}  ${k}`);
    if (args.includes('--lines')) {
      console.log('\nEach:');
      for (const s of r.skipped) console.log(`  ${s.file}:${s.line}  (at ${s.at})  ${s.reason}${s.why ? `\n      ${s.why}` : ''}`);
    }
  }
}
