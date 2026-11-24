/**
 * Notifications go through `src/native/Alerts.ts` and nowhere else.
 *
 * What is underneath is notifee, in our tree (src/native/notifee/; see
 * alertsEngineIsOurs.test.ts). Changing or replacing it is one file's
 * change only while no caller reaches past the door — which is what this
 * holds.
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

/** `import … from`, `require(`, `import(` of the npm package (gone) or of the in-tree engine — not a mention in a comment. */
const REACHES_PAST_THE_DOOR =
  /(?:from\s+|require\(\s*|import\(\s*)['"](?:@notifee\/react-native|(?:\.\.?\/)+(?:native\/)?notifee(?:\/[^'"]*)?)['"]/;
const ENGINE = path.join('src', 'native', 'notifee') + path.sep;

describe('notifications go through one door', () => {
  const files = [...sources('src'), 'index.js'];

  it('finds the callers at all', () => {
    const callers = files.filter(f =>
      /from\s+['"](?:\.\.?\/)+(?:native\/)?Alerts['"]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
    );
    expect(callers.length).toBeGreaterThan(20);
  });

  it('only the door reaches the engine', () => {
    const offenders = files
      .filter(f => f !== DOOR && !f.startsWith(ENGINE))
      .filter(f => REACHES_PAST_THE_DOOR.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the door hands on the whole of it, default and named', () => {
    const door = fs.readFileSync(path.join(ROOT, DOOR), 'utf8');
    expect(door).toMatch(/export \{ default \} from '\.\/notifee';/);
    expect(door).toMatch(/export \* from '\.\/notifee';/);
  });

  it('a suite mocks the door, so no test posts a real notification', () => {
    const setup = fs.readFileSync(path.join(ROOT, 'jest.setup.js'), 'utf8');
    expect(setup).toMatch(/jest\.mock\('\.\/src\/native\/Alerts'/);
    expect(jest.isMockFunction(require('../src/native/Alerts').default.createTriggerNotification)).toBe(true);
  });
});
