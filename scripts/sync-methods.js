#!/usr/bin/env node
/**
 * The calculation methods and their lists, from MihrabHQ/mihrab-methods.
 *
 * The app computes each authority's times with the method mihrab-methods
 * certifies. Those files are copies: this script makes them, so that a copy
 * is never edited by hand and never drifts from the method it claims to be.
 *
 *   node scripts/sync-methods.js [tree]           write the copies
 *   node scripts/sync-methods.js --check [tree]   say what differs, exit 1 if anything does
 *
 * `tree` is a checkout of mihrab-methods (default: ../mihrab-methods). With
 * no checkout there, --check says so and passes: the check is for the
 * machine a method is brought in on, not for every CI runner.
 *
 * What is copied (MANIFEST below):
 *   - src/methods/<x>.ts -> src/providers/<x>Method.ts, with the imports
 *     pointed at the app's names and one line saying where it is from and
 *     at which revision;
 *   - data/corrections/<a>.json -> src/providers/data/<a>Corrections.json;
 *   - data/places/<f>.json -> src/providers/data/<f>.json, where the app
 *     keeps the same list.
 * A list is compared by what it says, not by its spacing, and rewritten
 * only when what it says has changed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const TREE = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, '..', 'mihrab-methods'));

/** [file under the tree's src/, the app's file under src/providers/, the authority whose revision the copy carries (null: no line)]. */
const METHODS = [
  ['methods/morocco.ts', 'moroccoMethod.ts', null],
  ['methods/sweden.ts', 'congressMethod.ts', null],
  ['methods/indonesia.ts', 'indonesiaMethod.ts', null],
  ['sun/preciseSun.ts', 'preciseSun.ts', null],
  ['methods/algeria.ts', 'algeriaMethod.ts', null],
  ['methods/kazakhstan.ts', 'kazakhstanMethod.ts', 'kazakhstan'],
  ['methods/egypt.ts', 'egyptMethod.ts', 'egypt'],
  ['methods/brunei.ts', 'bruneiMethod.ts', 'brunei'],
  ['methods/qatar.ts', 'qatarMethod.ts', 'qatar'],
  ['methods/kuwait.ts', 'kuwaitMethod.ts', 'kuwait'],
  ['methods/jordan.ts', 'jordanMethod.ts', 'jordan'],
  ['methods/tatarstan.ts', 'tatarstanMethod.ts', 'tatarstan'],
  ['methods/cdum.ts', 'cdumMethod.ts', 'cdum'],
  ['methods/townTable.ts', 'townTableMethod.ts', 'albania'],
  ['methods/albania.ts', 'albaniaMethod.ts', 'albania'],
  ['methods/bulgaria.ts', 'bulgariaMethod.ts', 'bulgaria'],
  ['methods/banuri.ts', 'banuriMethod.ts', 'banuri'],
  ['methods/uae.ts', 'uaeMethod.ts', 'uae'],
  ['methods/tehran.ts', 'tehranMethod.ts', 'tehran'],
  ['methods/wifaq.ts', 'wifaqMethod.ts', 'wifaq'],
];
/**
 * Lists the app keeps under the same name. Corrections: every authority the app has a list for.
 * Not here: Albania's and Bulgaria's towns, which the app keeps in a shape of its own (the reader's
 * town beside the reference point).
 */
const PLACES = ['algeriaCities', 'algeriaMethodPoints', 'banuriCities', 'bruneiDistricts', 'cdumCities', 'egyptCities', 'jordanZones', 'kazakhstanCities', 'kemenagMethodPoints', 'kemenagPlaces', 'kuwaitAreas', 'moroccoCities', 'moroccoMethodPoints', 'qatarCities', 'tatarstanPlaces', 'tehranCities', 'uaeZones', 'wifaqTowns'];

/** Entries of a list the app does not serve: Jordan's ministry also prints a zone for Jerusalem (33), outside the country's outline. */
const LEFT_OUT = { jordanZones: [33] };

if (!fs.existsSync(path.join(TREE, 'src', 'methods', 'revisions.ts'))) {
  const say = `No mihrab-methods checkout at ${TREE}.`;
  if (CHECK) {
    console.log(`${say} Nothing compared.`);
    process.exit(0);
  }
  console.error(`${say} Give its path: node scripts/sync-methods.js <tree>`);
  process.exit(2);
}

const read = f => fs.readFileSync(f, 'utf8');
const revisions = Object.fromEntries([...read(path.join(TREE, 'src/methods/revisions.ts')).matchAll(/^\s+([a-z]+): (\d+),/gm)].map(m => [m[1], Number(m[2])]));
// A checkout from before an authority the app computes: older than the copies, so not what they are held to.
const behind = METHODS.filter(([from, , authority]) => !fs.existsSync(path.join(TREE, 'src', from)) || (authority && !revisions[authority])).map(([from]) => from);
if (behind.length) {
  const say = `The mihrab-methods checkout at ${TREE} is older than the app's copies (it has no ${behind[0]}): git pull there.`;
  if (CHECK) {
    console.log(`${say} Nothing compared.`);
    process.exit(0);
  }
  console.error(say);
  process.exit(2);
}
const appName = Object.fromEntries(METHODS.map(([from, to]) => [path.basename(from, '.ts'), to.replace(/\.ts$/, '')]));

/** The app's copy of a method file: its imports renamed, and the line saying where it is from. */
function copyOf(from, authority) {
  let s = read(path.join(TREE, 'src', from));
  s = s.replace(/from '(?:\.\.\/sun|\.)\/([A-Za-z]+)\.js'/g, (whole, base) => {
    if (!appName[base]) throw new Error(`${from} imports ${base}, which the app has no copy of — add it to METHODS`);
    return `from './${appName[base]}'`;
  });
  if (/from '[^']*\.js'/.test(s)) throw new Error(`${from}: an import this script does not know how to point at the app`);
  if (authority) {
    if (!revisions[authority]) throw new Error(`no revision for ${authority}`);
    const end = s.indexOf('\n */\n');
    if (!s.startsWith('/**') || end < 0) throw new Error(`${from}: no opening comment to say where it is from`);
    s = `${s.slice(0, end)}\n *\n * From MihrabHQ/mihrab-methods, revision ${revisions[authority]}.${s.slice(end)}`;
  }
  return s;
}

const differs = [];
const written = [];
function put(dest, text, same) {
  const file = path.join(ROOT, dest);
  const had = fs.existsSync(file) ? read(file) : null;
  if (had !== null && same(had)) return;
  if (CHECK) differs.push(dest);
  else {
    fs.writeFileSync(file, text);
    written.push(dest);
  }
}
const sameJson = wanted => had => {
  try {
    return JSON.stringify(JSON.parse(had)) === JSON.stringify(wanted);
  } catch {
    return false;
  }
};
/** A list as the app keeps it: an array with an entry a line, anything else as the tree has it. */
const listText = (value, raw) => (Array.isArray(value) ? `[\n${value.map(v => ` ${JSON.stringify(v)}`).join(',\n')}\n]\n` : raw);

for (const [from, to, authority] of METHODS) {
  const text = copyOf(from, authority);
  put(path.join('src/providers', to), text, had => had === text);
}
for (const f of fs.readdirSync(path.join(TREE, 'data/corrections'))) {
  const dest = path.join('src/providers/data', f.replace(/\.json$/, 'Corrections.json'));
  if (!fs.existsSync(path.join(ROOT, dest))) continue; // an authority the app does not compute
  const raw = read(path.join(TREE, 'data/corrections', f));
  put(dest, raw, sameJson(JSON.parse(raw)));
}
for (const name of PLACES) {
  const src = path.join(TREE, 'data/places', `${name}.json`);
  const dest = path.join('src/providers/data', `${name}.json`);
  if (!fs.existsSync(src) || !fs.existsSync(path.join(ROOT, dest))) continue;
  const raw = read(src);
  let value = JSON.parse(raw);
  if (LEFT_OUT[name]) value = value.filter(v => !LEFT_OUT[name].includes(v.id));
  put(dest, listText(value, raw), sameJson(value));
}

if (CHECK) {
  if (differs.length) {
    console.error(`Not what mihrab-methods has (${TREE}):\n${differs.map(d => `  ${d}`).join('\n')}\nRun: node scripts/sync-methods.js ${path.relative(ROOT, TREE)}`);
    process.exit(1);
  }
  console.log(`✓ methods and lists are mihrab-methods' (${METHODS.length} files, revisions ${Object.entries(revisions).map(([a, n]) => `${a} ${n}`).join(', ')})`);
} else {
  console.log(written.length ? `wrote ${written.length}:\n${written.map(d => `  ${d}`).join('\n')}` : 'nothing to write: the copies are current');
}
