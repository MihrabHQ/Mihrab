#!/usr/bin/env node
/**
 * Has what the React Compiler compiles been lived with?
 *
 *   node tools/compiler-soak.js --start    a build with the compiler as it is now is on a phone, today
 *   node tools/compiler-soak.js --check    may a release carry it? (scripts/release.sh asks)
 *   node tools/compiler-soak.js            say where things stand
 *
 * The checks that run on a desk (tools/compiler-impure.js reads the code,
 * tools/compiler-differential.js compares what is drawn) cannot see a
 * phone kept open through midnight, a muṣḥaf arriving while its page is
 * up, a language changed on the way to Maghrib. The two mistakes the
 * compiler has made here were both of that kind (babel.reactCompiler.js).
 * So a release carries the compiler only after a build with it has been on
 * a phone in daily use for SOAK_DAYS.
 *
 * `compiler-soak.json` keeps the day that started, and the fingerprint of
 * WHAT was compiled then (the snapshot of what is left as written, with
 * the compiler's version — tools/compiler-report.js). A change to either
 * starts the wait again: it is another build that has to be lived with.
 *
 * A release that cannot wait has two honest ways out, and the release
 * script names them: ship with the compiler off (`ON = false` — the app
 * renders as it did before it), or set MIHRAB_COMPILER_SOAK=waived for
 * that one run, which is the maintainer saying so.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'compiler-soak.json');
const SOAK_DAYS = 7;

const { ON } = require(path.join(root, 'babel.reactCompiler'));
const fingerprint = () =>
  crypto
    .createHash('sha1')
    .update(fs.readFileSync(path.join(__dirname, 'compiler-report.snapshot.json')))
    .digest('hex')
    .slice(0, 16);
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** { ok, why } — may a release carry the compiler today? */
function state(asOf = today()) {
  if (!ON) return { ok: true, why: 'the compiler is off' };
  let kept;
  try {
    kept = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { ok: false, why: 'no build with the compiler has been recorded as on a phone' };
  }
  if (kept.compiled !== fingerprint()) {
    return {
      ok: false,
      why: `what is compiled has changed since the build that went on a phone on ${kept.onPhoneSince}`,
    };
  }
  const days = daysBetween(kept.onPhoneSince, asOf);
  if (days < SOAK_DAYS) {
    return {
      ok: false,
      why: `the compiled build has been on a phone for ${days} day(s) (since ${kept.onPhoneSince}); ${SOAK_DAYS} are asked`,
    };
  }
  return { ok: true, why: `on a phone since ${kept.onPhoneSince} (${days} days)` };
}

module.exports = { state, fingerprint, SOAK_DAYS };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--start') {
    fs.writeFileSync(FILE, `${JSON.stringify({ onPhoneSince: today(), compiled: fingerprint() }, null, 2)}\n`);
    console.log(`recorded: on a phone since ${today()}`);
  } else {
    const s = state();
    console.log(`${s.ok ? '✓' : '✗'} ${s.why}`);
    if (arg === '--check' && !s.ok) {
      if (process.env.MIHRAB_COMPILER_SOAK === 'waived') {
        console.log('  waived for this run (MIHRAB_COMPILER_SOAK=waived)');
        process.exit(0);
      }
      console.error(
        '\nA release carries the React Compiler only after a build with it has been lived with.\n' +
          '  - wait, with that build on a phone (after installing one: node tools/compiler-soak.js --start);\n' +
          '  - or release with it off: `const ON = false;` in babel.reactCompiler.js;\n' +
          '  - or MIHRAB_COMPILER_SOAK=waived for this one run.',
      );
      process.exit(1);
    }
  }
}
