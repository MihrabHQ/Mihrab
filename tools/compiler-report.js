#!/usr/bin/env node
/**
 * What the React Compiler does with the folders it is switched on for
 * (babel.reactCompiler.js): every component and hook it compiled, and every
 * one it left as written, with the reason and the line.
 *
 *   node tools/compiler-report.js            a summary, by reason and by file
 *   node tools/compiler-report.js --json     everything, for a script
 *   node tools/compiler-report.js src/quran  one folder or file
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

module.exports = { report };

if (require.main === module) {
  const args = process.argv.slice(2);
  const only = args.find(a => !a.startsWith('--'));
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
