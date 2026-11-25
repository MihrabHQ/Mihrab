#!/usr/bin/env node
/**
 * The caches named as pure, and the code that makes each one so.
 *
 *   node tools/compiler-pure-caches.js            check: has any of them changed since it was read?
 *   node tools/compiler-pure-caches.js --update   record them as they are now — AFTER reading the change
 *
 * `tools/compiler-impure.js` reports a compiled component that reads a
 * module-level value which is written to: compiled, such a read is kept
 * and goes stale (babel.reactCompiler.js). A CACHE is written to and is
 * still safe to read, as long as what it holds is a pure function of its
 * key — the same answer whenever it is asked. Whether one is, is a
 * judgement made by reading it, and `compiler-pure-caches.json` is the
 * list of those judgements.
 *
 * A judgement is about the code as it was read. So beside each name the
 * list keeps a fingerprint of every top-level statement of the file that
 * mentions the cache — its declaration, and each function that reads or
 * fills it. Edit one of those and the fingerprint no longer matches:
 * `__tests__/reactCompilerScope.test.ts` fails until the change has been
 * read ("is it still the same answer for the same key?") and recorded with
 * `--update`. An edit anywhere else in the file changes nothing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const parser = require(path.join(root, 'node_modules/@babel/parser'));
const LIST = path.join(__dirname, 'compiler-pure-caches.json');

/** Does this node, anywhere inside it, name `name`? */
function mentions(node, name) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(n => mentions(n, name));
  if (node.type === 'Identifier' && node.name === name) return true;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (v && typeof v === 'object' && mentions(v, name)) return true;
  }
  return false;
}

/** The fingerprint of `name` in `file`: the statements that mention it, comments and spacing aside. */
function fingerprint(file, name) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return null;
  const code = fs.readFileSync(abs, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], tokens: true });
  const hash = crypto.createHash('sha1');
  let found = 0;
  for (const statement of ast.program.body) {
    if (!mentions(statement, name)) continue;
    found++;
    // Its tokens, not its text: a comment reworded or a line rewrapped is
    // not a change to what the code does.
    for (const t of ast.tokens) {
      if (t.start < statement.start || t.end > statement.end) continue;
      if (t.type === 'CommentLine' || t.type === 'CommentBlock') continue;
      hash.update(code.slice(t.start, t.end)).update('\u0000');
    }
  }
  return found ? hash.digest('hex').slice(0, 16) : null;
}

function check() {
  const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const changed = [];
  for (const [entry, was] of Object.entries(list)) {
    const [file, name] = entry.split(': ');
    const now = fingerprint(file, name);
    if (now === null) changed.push({ entry, why: 'is not in that file any more — take it off the list' });
    else if (now !== was) changed.push({ entry, why: 'has been edited since it was read as pure' });
  }
  return changed;
}

function update() {
  const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const next = {};
  for (const entry of Object.keys(list)) {
    const [file, name] = entry.split(': ');
    const now = fingerprint(file, name);
    if (now !== null) next[entry] = now;
  }
  fs.writeFileSync(LIST, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

module.exports = { check, fingerprint };

if (require.main === module) {
  if (process.argv.includes('--update')) {
    const next = update();
    console.log(`recorded ${Object.keys(next).length} caches as read`);
  } else {
    const changed = check();
    for (const c of changed) console.error(`✗ ${c.entry} ${c.why}`);
    if (changed.length) {
      console.error(
        '\nRead the change: does the cache still hold the same answer for the same key, whenever it is asked?\n' +
          'If so: node tools/compiler-pure-caches.js --update. If not, take it off the list, and\n' +
          'tools/compiler-impure.js will name the components that read it.',
      );
      process.exit(1);
    }
    console.log('✓ every cache named as pure is as it was read');
  }
}
