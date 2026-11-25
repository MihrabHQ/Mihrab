/**
 * The recorder of `tools/compiler-differential.js` — and nothing at all in
 * an ordinary test run (no MIHRAB_DIFFERENTIAL, no effect).
 *
 * WHAT IT IS FOR. The React Compiler keeps a component's output until its
 * props, state or hook results change. A component that reads anything
 * else while rendering goes stale when compiled, silently
 * (babel.reactCompiler.js has the two times it did). `tools/compiler-impure.js`
 * finds such reads by reading the code, and cannot see all of them. This
 * finds them by what is drawn: every render test is run compiled and as
 * written, and the two must draw the same thing at every step.
 *
 * WHAT IT RECORDS. For every tree a test makes with react-test-renderer:
 * what it draws after each `act`, and at the end of the test once more
 * after THE SHAKE (where the test unmounts the tree, or at its end) — the
 * clock put on by twenty-six hours, the language changed, the text size
 * changed, and the tree rendered again from the top with the same props. As written, a component asked to render reads the
 * world again; compiled, it must come to the same answer. The shake is what
 * makes every render test, present and future, a test of this without
 * saying so.
 *
 * A CLOCK THAT IS THE SAME EVERY RUN. The real clock would make two runs
 * of the same code differ at a turn of the minute. Under the recorder the
 * clock starts at one fixed instant and moves a millisecond each time it is
 * read. (A test that installs fake timers has its own, as always.)
 */
/* eslint-env jest, node */
const out = process.env.MIHRAB_DIFFERENTIAL;

if (out) {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  // ── The clock ────────────────────────────────────────────────────────
  const RealDate = Date;
  const DAY_AND_A_BIT = 26 * 60 * 60 * 1000;
  let base = RealDate.UTC(2026, 2, 10, 11, 0, 0);
  let reads = 0;
  const tick = () => base + reads++;
  class RecorderDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(tick());
      else super(...args);
    }
    static now() {
      return tick();
    }
  }
  global.Date = RecorderDate;

  /** Fake timers bring their own Date; `clock` is how they are known. */
  const fakeTimersOn = () => typeof setTimeout.clock !== 'undefined' || global.Date !== RecorderDate;

  // ── What a tree draws, as text ───────────────────────────────────────
  function plain(value, depth, seen) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    // A key made by chance (react-navigation's, twenty-one characters
    // after the route's name) is another one every run, and says nothing.
    if (typeof value === 'string') return value.replace(/-[A-Za-z0-9_-]{21}(?![A-Za-z0-9_-])/g, '-[key]');
    if (typeof value === 'function') return '[fn]';
    if (typeof value === 'symbol') return String(value);
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[seen]';
    if (depth > 400) return '[deep]';
    // An animated value: where it stands, not the node behind it.
    if (typeof value.__getValue === 'function') {
      try {
        const v = value.__getValue();
        return `[animated ${typeof v === 'number' ? Math.round(v * 1000) / 1000 : JSON.stringify(v)}]`;
      } catch {
        return '[animated]';
      }
    }
    if (value instanceof RealDate) return `[date ${value.toISOString()}]`;
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = value.map(v => plain(v, depth + 1, seen));
    } else {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null && !('type' in value && 'props' in value)) {
        result = `[${(proto.constructor && proto.constructor.name) || 'object'}]`;
      } else {
        result = {};
        for (const key of Object.keys(value).sort()) {
          if (key === '_owner' || key === '_store' || key === 'ref') continue;
          result[key] = plain(value[key], depth + 1, seen);
        }
      }
    }
    seen.delete(value);
    return result;
  }
  const drawn = root => {
    try {
      return JSON.stringify(plain(root.toJSON(), 0, new Set()));
    } catch (e) {
      return `[could not be read: ${String(e && e.message).slice(0, 120)}]`;
    }
  };

  // ── The trees a test makes ───────────────────────────────────────────
  /** @type {{root: any, element: any, alive: boolean}[]} */
  let live = [];
  /** @type {{test: string, step: string, hash: string}[]} */
  const steps = [];
  /** @type {Record<string, string>} */
  const texts = {};
  const testName = () => {
    try {
      return expect.getState().currentTestName || '(outside a test)';
    } catch {
      return '(outside a test)';
    }
  };
  let counter = 0;
  function record(step, only) {
    for (let i = 0; i < live.length; i++) {
      const entry = live[i];
      if (!entry.alive || (only && !only.includes(entry))) continue;
      const text = drawn(entry.root);
      const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
      texts[hash] = text;
      steps.push({ test: testName(), step: `${counter++}:${step}:tree${i}`, hash });
    }
  }

  // The renderer hands its internals to a DevTools hook when there is one
  // as it loads; `scheduleUpdate` among them — render this component again
  // with nothing changed — is what the shake is made of.
  let internals = null;
  let renderers = 0;
  if (typeof global.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      // More than one renderer may come by (react-native loads its own
      // when something asks for a native handle): the test renderer's is
      // the one whose trees these are.
      inject(given) {
        if (given && given.rendererPackageName === 'react-test-renderer') internals = given;
        return ++renderers;
      },
      onScheduleFiberRoot() {},
      onCommitFiberRoot() {},
      onPostCommitFiberRoot() {},
      onCommitFiberUnmount() {},
      setStrictMode() {},
      checkDCE() {},
    };
  }
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const realCreate = TestRenderer.create;
  const realRendererAct = TestRenderer.act;
  const realReactAct = React.act;

  TestRenderer.create = function create(element, options) {
    const root = realCreate(element, options);
    const update = root.update.bind(root);
    const unmount = root.unmount.bind(root);
    const entry = { root, element, alive: true, shaken: false, update, unmount };
    root.update = next => {
      entry.element = next;
      return update(next);
    };
    root.unmount = () => {
      if (entry.alive) {
        record('end', [entry]);
        shake([entry]);
      }
      entry.alive = false;
      return unmount();
    };
    live.push(entry);
    return root;
  };

  let shaking = false;
  const recording = realAct =>
    function act(callback) {
      const result = realAct(callback);
      if (shaking) return result;
      if (result && typeof result.then === 'function') {
        return {
          then(resolve, reject) {
            return result.then(value => {
              record('act');
              return resolve ? resolve(value) : value;
            }, reject);
          },
        };
      }
      record('act');
      return result;
    };
  try {
    if (typeof realReactAct === 'function') React.act = recording(realReactAct);
    if (typeof realRendererAct === 'function') TestRenderer.act = recording(realRendererAct);
  } catch {
    // A build of React whose exports cannot be replaced: the ends of the
    // tests are still recorded, and the shake.
  }
  const act = realReactAct || realRendererAct;

  // ── The shake ────────────────────────────────────────────────────────
  // Done where a tree ends: when the test unmounts it, or at the end of
  // the test for one left standing. Without a wait in it — an unmount is
  // not waited for — so what the shake changes is what is told at once.

  /**
   * Function components, plain and forwardRef. Not `memo`: one of those
   * given the props it had does not render again as written either.
   */
  const RENDERS = new Set([0, 11]);
  /**
   * EVERY COMPONENT OF A TREE RENDERED AGAIN, with the props, state and
   * context it has. As written, a component asked to render reads whatever
   * it reads again; compiled, it gives back what it kept unless something
   * React knows of changed — and nothing has. So after this the two draw
   * the same thing exactly when no compiled component read anything React
   * does not know of. (Rendering from the top is not enough: a parent that
   * hands on the same children re-renders none of them, in either.)
   */
  function renderAll(entry) {
    if (!internals || typeof internals.scheduleUpdate !== 'function') return false;
    let top = entry.root.root && entry.root.root._fiber;
    if (!top) return false;
    while (top.return) top = top.return;
    // The tree that is on show, not the one kept from the render before.
    if (top.stateNode && top.stateNode.current) top = top.stateNode.current;
    const fibers = [];
    (function walk(fiber) {
      for (let f = fiber; f; f = f.sibling) {
        if (RENDERS.has(f.tag)) fibers.push(f);
        if (f.child) walk(f.child);
      }
    })(top.child);
    // Inside a test's own `act` (a tree is unmounted there), an `act` of
    // ours renders nothing until the outer one is left: only then is the
    // render asked for at once. Everywhere else `act` itself renders, and
    // is the safer of the two — a render that throws inside a forced
    // flush leaves React refusing every later one.
    const shared = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const nested = !!shared && shared.actQueue != null;
    act(() => {
      const all = () => {
        for (const f of fibers) {
          try {
            // The same props in a new object, as a parent rendering again
            // hands them: React takes a component's new output only if it
            // was given something new, and asked to render with nothing
            // new at all it renders and throws the result away.
            f.pendingProps = { ...f.memoizedProps };
            internals.scheduleUpdate(f);
          } catch {}
        }
      };
      if (nested && typeof entry.root.unstable_flushSync === 'function') entry.root.unstable_flushSync(all);
      else all();
    });
    return true;
  }

  function shake(entries) {
    const standing = entries.filter(e => e.alive && !e.shaken);
    if (standing.length === 0 || typeof act !== 'function' || shaking) return;
    shaking = true;
    const undo = [];
    const again = step => {
      // Twice, drawn after each: what a component kept is held by the
      // render before last as well as by the last, and one pass can land
      // on either.
      for (const pass of ['', '+']) {
        for (const entry of standing) {
          try {
            renderAll(entry);
          } catch {}
        }
        record(step + pass, standing);
      }
    };
    try {
      for (const entry of standing) entry.shaken = true;
      // Nothing changed but what the test itself left changed behind it
      // (its own teardown runs first): a module's value, a stand-in's answer.
      again('again');
      // The clock: tomorrow, and past it.
      if (fakeTimersOn()) {
        try {
          const was = Date.now();
          jest.setSystemTime(was + DAY_AND_A_BIT);
          undo.push(() => jest.setSystemTime(was));
        } catch {}
      } else {
        base += DAY_AND_A_BIT;
        undo.push(() => {
          base -= DAY_AND_A_BIT;
        });
      }
      again('clock');
      // The text size.
      try {
        const { PixelRatio, Dimensions } = require('react-native');
        const wasScale = PixelRatio.getFontScale;
        const wasWindow = Dimensions.get('window');
        PixelRatio.getFontScale = () => 1.5;
        act(() => {
          Dimensions.set({ window: { ...wasWindow, fontScale: 1.5 } });
        });
        undo.push(() => {
          PixelRatio.getFontScale = wasScale;
          act(() => {
            Dimensions.set({ window: wasWindow });
          });
        });
      } catch {}
      again('textsize');
      // The language (where the test runs the app's own translations).
      try {
        const i18n = require('../src/i18n').default;
        if (i18n && typeof i18n.changeLanguage === 'function' && i18n.isInitialized) {
          const was = i18n.language;
          act(() => {
            void i18n.changeLanguage(was === 'sv' ? 'en' : 'sv');
          });
          undo.push(() =>
            act(() => {
              void i18n.changeLanguage(was);
            }),
          );
        }
      } catch {}
      again('language');
    } finally {
      for (const back of undo.reverse()) {
        try {
          back();
        } catch {}
      }
      shaking = false;
    }
  }

  afterEach(() => {
    record('end');
    shake(live);
    // Unmounted here, inside an `act`: left to the scheduler, an unmount
    // lands in the middle of the next test.
    try {
      act(() => {
        for (const entry of live) {
          if (!entry.alive) continue;
          entry.alive = false;
          try {
            entry.unmount();
          } catch {}
        }
      });
    } catch {}
    live = [];
    counter = 0;
  });

  afterAll(() => {
    const file = expect.getState().testPath || 'unknown';
    const rel = path.relative(path.join(__dirname, '..'), file);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, `${rel.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`),
      JSON.stringify({ file: rel, steps, texts }),
    );
  });
}
