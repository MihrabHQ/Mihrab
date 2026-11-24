/**
 * Notifications go through `src/native/Alerts.ts` and nowhere else.
 *
 * The library underneath (notifee, unmaintained) is to be replaced by a
 * module of our own. That is one file's change only while no caller names
 * the library itself — which is what this holds.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DOOR = path.join('src', 'native', 'Alerts.ts');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(rel, out);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** `import … from '<lib>'`, `require('<lib>')`, `import('<lib>')` — not a mention in a comment. */
const NAMES_THE_LIBRARY = /(?:from\s+|require\(\s*|import\(\s*)['"]@notifee\/react-native['"]/;

describe('notifications go through one door', () => {
  const files = [...sources('src'), 'index.js'];

  it('finds the callers at all', () => {
    const callers = files.filter(f =>
      /from\s+['"](?:\.\.?\/)+(?:native\/)?Alerts['"]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
    );
    expect(callers.length).toBeGreaterThan(20);
  });

  it('only the door names the library', () => {
    const offenders = files
      .filter(f => f !== DOOR)
      .filter(f => NAMES_THE_LIBRARY.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the door hands on the whole of it, default and named', () => {
    const door = fs.readFileSync(path.join(ROOT, DOOR), 'utf8');
    expect(door).toMatch(/export \{ default \} from '@notifee\/react-native';/);
    expect(door).toMatch(/export \* from '@notifee\/react-native';/);
  });

  it('what comes through is the module itself', () => {
    const lib = require('@notifee/react-native');
    const door = require('../src/native/Alerts');
    expect(door.default).toBe(lib.default);
    expect(door.TriggerType).toBe(lib.TriggerType);
    expect(door.EventType).toBe(lib.EventType);
  });
});
