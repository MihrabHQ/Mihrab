#!/usr/bin/env node
/**
 * What a component reads, while rendering, that React cannot see change —
 * in the folders the React Compiler is listed for (babel.reactCompiler.js).
 *
 * The compiler takes rendering to be pure: the same props, state and hook
 * results give the same output, so it keeps the output until one of them
 * changes. A read of anything else goes stale the moment the component is
 * compiled. Two were found the day after the compiler went on, before any
 * release carried it:
 *
 *  - `resolveRiwayah(prefs.riwayah)` answers from what the device can draw.
 *    The screen subscribed to that and rendered again when a muṣḥaf's data
 *    arrived — and, compiled, kept the answer it had for the same
 *    preference (AGENTS.md §3, the riwayah on screen).
 *  - `const today = dayKey()` was asked once for the component's life.
 *
 * So this reads every listed component and hook and reports, for the code
 * that RUNS while it renders — its body, the callbacks it runs on the spot
 * (`map`, `filter`…), and its own inner functions where it calls them:
 *
 *  clock      `Date.now()`, `new Date()`, `Math.random()`, `performance.now()`
 *  helper     a call to a function of ours that answers from something that
 *             changes: a module-level `let` that is reassigned, a module-level
 *             Map/Set/array/object that is written to, the clock (also by a
 *             parameter's default, when the call leaves that parameter out),
 *             a live singleton — or that calls one that does. Imports are
 *             followed to the file that defines the name.
 *  singleton  a call on, or a live property of, something that exists once
 *             and changes: `Dimensions.get`, `I18nManager.isRTL`,
 *             `AppState.currentState`, the `i18n` instance, a module-level
 *             store.
 *
 * Not reported: what is inside a function that runs later (a handler, an
 * effect), inside `useMemo`/`useCallback` (the list given with it is what
 * the compiler keeps to), or a helper handed the time of the render
 * (`useRenderClock`).
 *
 * WHAT IS DONE ABOUT ONE. Either the read is made something React sees — a
 * hook that subscribes (`useShownRiwayah`), the render's clock as an
 * argument — or the component says `'use no memo'` and is left exactly as
 * written, which is what it was before the compiler. `--unanswered` lists
 * the components with a read and no directive; the test
 * `__tests__/reactCompilerScope.test.ts` holds that list empty, and that is
 * the condition for the compiler being on at all.
 *
 * It errs on the side of reporting: a cache that is a pure function of its
 * key is named in PURE (below) once it has been read and found to be one.
 *
 *   node tools/compiler-impure.js               every read, by component
 *   node tools/compiler-impure.js --unanswered  components with a read and no 'use no memo'
 *   node tools/compiler-impure.js --json
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const parser = require(path.join(root, 'node_modules/@babel/parser'));
const traverse = require(path.join(root, 'node_modules/@babel/traverse')).default;
const { isListed } = require(path.join(root, 'babel.reactCompiler'));

const isComponentOrHook = name => (/^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name)) || /^use[A-Z0-9]/.test(name);

/** Hooks whose callback runs later, or is kept by the list given with it. */
const LATER = new Set([
  'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo', 'useState', 'useRef',
  'useConst', 'useFocusEffect', 'useImperativeHandle', 'useReducer', 'useSyncExternalStore', 'useKeepLatest',
]);
/** Array methods (and the like) that run their callback before they return. */
const ON_THE_SPOT = new Set([
  'map', 'filter', 'forEach', 'reduce', 'reduceRight', 'some', 'every', 'find', 'findIndex', 'findLast',
  'flatMap', 'sort', 'toSorted', 'replace', 'from',
]);
/** From 'react-native': things that exist once and change. */
// Not `I18nManager`: the layout's direction is fixed for the life of the
// process — a change of direction restarts the app (AppNavigationRoot.tsx).
const RN_LIVE = new Set(['Dimensions', 'PixelRatio', 'AppState', 'Appearance', 'Keyboard', 'AccessibilityInfo', 'NativeModules']);
/** Writes to a collection. */
const WRITES = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice', 'fill', 'sort', 'reverse']);

/**
 * Helpers that touch changing state and answer the same whatever it holds —
 * each read, and found to be so:
 *
 *  quiet            (utils/quiet.ts) spaces out its own log lines by the clock.
 */
const SAME_ANSWER = new Set(['quiet']);

/**
 * Module-level caches that are a pure function of their key: what is put in
 * under a key is worked out from the key alone, so a hit and a miss answer
 * the same. `file: name`, each read and found to be so. A cache filled as
 * DATA ARRIVES (a page's layout, a font, a download) is not one of these.
 */
// The names; beside each, the fingerprint tools/compiler-pure-caches.js holds it to.
const PURE = new Set(Object.keys(require('./compiler-pure-caches.json')));

function filesUnder(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) filesUnder(p, out);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const file = base + ext;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function nameOf(fnPath) {
  const n = fnPath.node;
  if (n.id && n.id.name) return n.id.name;
  const parent = fnPath.parentPath;
  if (parent.isVariableDeclarator() && parent.node.id.type === 'Identifier') return parent.node.id.name;
  if (parent.isCallExpression()) {
    const up = parent.parentPath;
    if (up.isVariableDeclarator() && up.node.id.type === 'Identifier') return up.node.id.name;
    // memo(forwardRef(function …))
    if (up.isCallExpression() && up.parentPath.isVariableDeclarator() && up.parentPath.node.id.type === 'Identifier') return up.parentPath.node.id.name;
  }
  return '';
}

function clockRead(node) {
  if (node.type === 'NewExpression') {
    return node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0 ? 'new Date()' : null;
  }
  if (node.type !== 'CallExpression') return null;
  const c = node.callee;
  if (c.type !== 'MemberExpression' || c.object.type !== 'Identifier' || c.property.type !== 'Identifier') return null;
  const call = `${c.object.name}.${c.property.name}`;
  return call === 'Date.now' || call === 'Math.random' || call === 'performance.now' ? `${call}()` : null;
}

/** The identifier a member chain hangs off: `a` of `a.b.c()`. */
function rootOf(node) {
  let n = node;
  while (n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression')) n = n.object;
  return n && n.type === 'Identifier' ? n : null;
}

function load() {
  const modules = new Map();
  for (const file of filesUnder(path.join(root, 'src'))) {
    let ast;
    try {
      ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    const mod = { file, rel, ast, fns: new Map(), imports: new Map(), external: new Map(), changing: new Map(), instances: new Set(), program: null };
    modules.set(file, mod);

    traverse(ast, {
      Program(p) {
        mod.program = p;
        for (const [name, b] of Object.entries(p.scope.bindings)) {
          if (PURE.has(`${rel}: ${name}`)) continue;
          if (b.kind === 'let' || b.kind === 'var') {
            if (b.constantViolations.length > 0) mod.changing.set(name, 'reassigned');
            continue;
          }
          if (b.kind !== 'const' || !b.path.isVariableDeclarator()) continue;
          const init = b.path.node.init;
          if (!init) continue;
          const isNew = init.type === 'NewExpression' && init.callee.type === 'Identifier';
          const isLiteral = init.type === 'ObjectExpression' || init.type === 'ArrayExpression';
          if (isNew && !/^(Map|Set|WeakMap|WeakSet|Animated|RegExp|Intl|Date)$/.test(init.callee.name)) mod.instances.add(name);
          if (!(isNew && /^(Map|Set|WeakMap|WeakSet)$/.test(init.callee.name)) && !isLiteral) continue;
          const written = b.referencePaths.some(r => {
            const m = r.parentPath;
            if (!m.isMemberExpression() || m.node.object !== r.node) return false;
            const up = m.parentPath;
            // X.set(…) / X.push(…)
            if (up.isCallExpression() && up.node.callee === m.node && m.node.property.type === 'Identifier' && WRITES.has(m.node.property.name)) return true;
            // X[k] = …, X.k = …, delete X[k], X[k]++
            if (up.isAssignmentExpression() && up.node.left === m.node) return true;
            if (up.isUnaryExpression({ operator: 'delete' }) || up.isUpdateExpression()) return true;
            return false;
          });
          if (written) mod.changing.set(name, 'written to');
        }
      },
      ImportDeclaration(p) {
        const spec = p.node.source.value;
        const target = resolveImport(file, spec);
        for (const s of p.node.specifiers) {
          if (p.node.importKind === 'type' || s.importKind === 'type') continue;
          if (target) {
            mod.imports.set(s.local.name, { file: target, name: s.type === 'ImportSpecifier' ? s.imported.name || s.imported.value : s.type === 'ImportDefaultSpecifier' ? 'default' : '*' });
          } else {
            mod.external.set(s.local.name, { from: spec, name: s.type === 'ImportSpecifier' ? s.imported.name || s.imported.value : 'default' });
          }
        }
      },
      Function(p) {
        if (p.getFunctionParent()) return;
        const name = nameOf(p);
        if (!name) return;
        const defaults = [];
        p.node.params.forEach((param, i) => {
          if (param.type !== 'AssignmentPattern') return;
          const right = param.right;
          let reads = Boolean(clockRead(right));
          traverse(right, { noScope: true, enter(q) { if (clockRead(q.node)) reads = true; } }, p.scope, p);
          if (reads) defaults.push(i);
        });
        mod.fns.set(name, { name, file, rel, path: p, defaults, own: null, calls: [] });
      },
    });
  }
  return modules;
}

function analyse() {
  const modules = load();

  /** What an identifier at module scope stands for, followed through an import. */
  const lookupFn = (mod, name) => {
    if (mod.fns.has(name)) return mod.fns.get(name);
    const imp = mod.imports.get(name);
    if (!imp) return null;
    const target = modules.get(imp.file);
    return target && target.fns.has(imp.name) ? target.fns.get(imp.name) : null;
  };

  /** Is `name`, in `mod`, an imported thing of ours that is not a function — an instance, a store? */
  const importedObject = (mod, name) => {
    const imp = mod.imports.get(name);
    if (!imp) return null;
    const target = modules.get(imp.file);
    if (!target) return null;
    if (imp.name === 'default' || imp.name === '*') return imp.name === 'default' ? `${target.rel} (default)` : null;
    if (target.fns.has(imp.name)) return null;
    if (target.changing.has(imp.name)) return `${target.rel}: ${imp.name} is ${target.changing.get(imp.name)}`;
    if (target.instances.has(imp.name)) return `${target.rel}: ${imp.name}`;
    return null;
  };

  /**
   * One node, in `mod`, read where `scopePath` can see it: a description of
   * the changing thing it reads, or null. Calls to our own functions are
   * returned as { call } for the caller to follow.
   */
  const readAt = (mod, p) => {
    const node = p.node;
    const clock = clockRead(node);
    if (clock) return { what: clock, kind: 'clock' };

    if (node.type === 'Identifier') {
      if (!p.isReferencedIdentifier() || !mod.changing.has(node.name)) return null;
      const b = p.scope.getBinding(node.name);
      if (!b || b.scope.block.type !== 'Program') return null;
      // A write is not a read of it.
      const parent = p.parentPath;
      if (parent.isAssignmentExpression() && parent.node.left === node) return null;
      return { what: `${node.name} (${mod.changing.get(node.name)}, ${mod.rel})`, kind: 'state' };
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      // Only the outermost member of a chain.
      if (p.parentPath.isMemberExpression() && p.parentPath.node.object === node) return null;
      const r = rootOf(node);
      if (!r) return null;
      const b = p.scope.getBinding(r.name);
      if (!b || b.scope.block.type !== 'Program') return null;
      const ext = mod.external.get(r.name);
      const isCall = p.parentPath.isCallExpression() && p.parentPath.node.callee === node;
      const text = () => p.toString().replace(/\s+/g, ' ').slice(0, 60);
      if (ext && ext.from === 'react-native' && RN_LIVE.has(ext.name)) return { what: text(), kind: 'singleton' };
      if (ext && (ext.from === 'i18next' || ext.from === 'react-i18next') && ext.name === 'default') return { what: text(), kind: 'singleton' };
      const obj = importedObject(mod, r.name);
      if (obj && (isCall || /i18n/.test(obj))) return { what: `${text()}  [${obj}]`, kind: 'singleton' };
      if (mod.instances.has(r.name) && isCall) return { what: `${text()}  [module-level instance]`, kind: 'singleton' };
      return null;
    }
    return null;
  };

  // What each module-level function of ours reads for itself, and whom it calls.
  for (const mod of modules.values()) {
    for (const fn of mod.fns.values()) {
      fn.path.get('body').traverse({
        enter(q) {
          const read = readAt(mod, q);
          if (read && !fn.own) fn.own = read.what;
          if (q.isCallExpression() && q.node.callee.type === 'Identifier') {
            fn.calls.push({ name: q.node.callee.name, args: q.node.arguments.length, spread: q.node.arguments.some(a => a.type === 'SpreadElement') });
          }
        },
      });
    }
  }

  const memo = new Map();
  const why = new Map();
  /** Does calling `fn` with `args` arguments answer from something that changes? */
  const changes = (fn, args, spread, seen = new Set()) => {
    if (isComponentOrHook(fn.name) || SAME_ANSWER.has(fn.name)) return false;
    const key = `${fn.file}#${fn.name}#${spread || fn.defaults.length === 0 ? 'any' : args}`;
    if (memo.has(key)) return memo.get(key);
    if (seen.has(key)) return false;
    seen.add(key);
    let answer = false;
    if (fn.own) {
      answer = true;
      why.set(key, `${fn.name} reads ${fn.own}`);
    } else if (!spread && fn.defaults.some(i => args <= i)) {
      answer = true;
      why.set(key, `${fn.name}'s default reads the clock`);
    } else {
      const mod = modules.get(fn.file);
      for (const call of fn.calls) {
        const callee = lookupFn(mod, call.name);
        if (callee && callee !== fn && changes(callee, call.args, call.spread, seen)) {
          answer = true;
          const k = `${callee.file}#${callee.name}#${call.spread || callee.defaults.length === 0 ? 'any' : call.args}`;
          why.set(key, `${fn.name} → ${why.get(k) || callee.name}`);
          break;
        }
      }
    }
    memo.set(key, answer);
    return answer;
  };

  const components = [];
  for (const mod of modules.values()) {
    if (!isListed(mod.file)) continue;
    traverse(mod.ast, {
      Function(top) {
        if (top.getFunctionParent()) return;
        const name = nameOf(top);
        if (!isComponentOrHook(name)) return;
        const body = top.get('body');
        if (!body.isBlockStatement()) return;
        const optedOut = (top.node.body.directives || []).some(d => d.value.value === 'use no memo');
        const reads = [];
        const visited = new Set();

        const walk = fnPath => {
          if (visited.has(fnPath.node)) return;
          visited.add(fnPath.node);
          fnPath.get('body').traverse({
            Function(q) {
              // An inner function: does it run while rendering?
              const parent = q.parentPath;
              let onTheSpot = false;
              if (parent.isCallExpression() && parent.node.callee !== q.node) {
                const c = parent.node.callee;
                if (c.type === 'MemberExpression' && c.property.type === 'Identifier' && ON_THE_SPOT.has(c.property.name)) onTheSpot = true;
              }
              // (function () {})()
              if (parent.isCallExpression() && parent.node.callee === q.node) onTheSpot = true;
              if (!onTheSpot) q.skip();
            },
            CallExpression(q) {
              const c = q.node.callee;
              if (c.type === 'Identifier' && LATER.has(c.name)) {
                q.skip();
                return;
              }
              if (c.type !== 'Identifier') return;
              const b = q.scope.getBinding(c.name);
              // One of the component's own inner functions, called here: its body runs now.
              if (b && b.scope.block !== mod.program.node) {
                const init = b.path.isVariableDeclarator() ? b.path.get('init') : b.path.isFunctionDeclaration() ? b.path : null;
                if (init && init.isFunction() && init.findParent(x => x.node === top.node)) walk(init);
                return;
              }
              const callee = lookupFn(mod, c.name);
              if (!callee) return;
              const args = q.node.arguments.length;
              const spread = q.node.arguments.some(a => a.type === 'SpreadElement');
              const givenTheClock = q.node.arguments.some(a => {
                if (a.type !== 'Identifier') return false;
                const ab = q.scope.getBinding(a.name);
                const init = ab && ab.path.isVariableDeclarator() ? ab.path.node.init : null;
                return Boolean(init && init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'useRenderClock');
              });
              if (givenTheClock) return;
              if (changes(callee, args, spread)) {
                const k = `${callee.file}#${callee.name}#${spread || callee.defaults.length === 0 ? 'any' : args}`;
                reads.push({ line: q.node.loc.start.line, kind: 'helper', what: `${callee.name}(…)`, why: why.get(k) || '' });
              }
            },
            enter(q) {
              if (q.isFunction() || q.isCallExpression()) {
                const clock = clockRead(q.node);
                if (clock) reads.push({ line: q.node.loc.start.line, kind: 'clock', what: clock, why: '' });
                return;
              }
              if (q.isNewExpression()) {
                const clock = clockRead(q.node);
                if (clock) reads.push({ line: q.node.loc.start.line, kind: 'clock', what: clock, why: '' });
                return;
              }
              const read = readAt(mod, q);
              if (read && read.kind !== 'clock') reads.push({ line: q.node.loc.start.line, kind: read.kind, what: read.what, why: '' });
            },
          });
        };
        walk(top);
        if (reads.length > 0) components.push({ file: mod.rel, name, line: top.node.loc.start.line, optedOut, reads });
      },
    });
  }
  components.sort((a, b) => (a.file + a.name).localeCompare(b.file + b.name));
  return components;
}

module.exports = { analyse, unanswered: () => analyse().filter(c => !c.optedOut) };

if (require.main === module) {
  const args = process.argv.slice(2);
  const only = args.find(a => !a.startsWith('--'));
  let components = analyse().filter(c => !only || c.file.includes(only));
  if (args.includes('--unanswered')) components = components.filter(c => !c.optedOut);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(components, null, 1));
  } else {
    for (const c of components) {
      console.log(`${c.file}:${c.line}  ${c.name}${c.optedOut ? "   ('use no memo')" : ''}`);
      for (const r of c.reads) console.log(`    ${r.line}  ${r.kind}  ${r.what}${r.why ? `   [${r.why}]` : ''}`.slice(0, 230));
    }
    const reads = components.reduce((n, c) => n + c.reads.length, 0);
    console.log(`${components.length} component(s) and hook(s), ${reads} read(s) of changing state while rendering`);
  }
}
