/**
 * Android: our own native modules are built when JavaScript asks for them
 * (android/.../MihrabPackage.kt), not all of them while the app starts.
 *
 * A module registered through a plain `ReactPackage` is built at start-up
 * by React Native's door for old packages, whether the launch needs it or
 * not. So every module with a contract in src/native/specs is listed in
 * the one on-demand package — in both of its lists, under the name it
 * answers to — and no package of the old kind is left for any of them.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const dir = path.join(root, 'android/app/src/main/java/com/prayer_times');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');

const pkg = read('MihrabPackage.kt');
const made = [...pkg.matchAll(/^\s+"(\w+)" -> (\w+)\(reactContext\)$/gm)].map(m => [m[1], m[2]]);
const listed = [...pkg.matchAll(/^\s+"(\w+)" to (\w+)::class\.java,$/gm)].map(m => [m[1], m[2]]);

/** Every Kotlin class that implements a contract: [the name it answers to, the class]. */
const modules = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.kt'))
  .flatMap(f => {
    const text = read(f);
    return [...text.matchAll(/class (\w+)\([^)]*\)\s*:\s*Native\w+Spec\(\w+\)/g)].map(m => {
      const body = text.slice(m.index);
      const literal = /override fun getName\(\)(?:: String)? = "(\w+)"/.exec(body);
      const constant = /const val NAME = "(\w+)"/.exec(body);
      return [(literal ?? constant)![1], m[1]];
    });
  });

const sorted = (rows: string[][]) => rows.map(r => r.join(' ')).sort();

describe('the on-demand package', () => {
  it('makes every module that has a contract, under the name it answers to', () => {
    expect(modules.length).toBeGreaterThanOrEqual(24);
    expect(sorted(made)).toEqual(sorted(modules));
  });

  it('lists the same modules for React Native as it makes', () => {
    expect(sorted(listed)).toEqual(sorted(made));
  });

  it('says they are TurboModules, built when first asked for', () => {
    expect(pkg).toMatch(/class MihrabPackage : BaseReactPackage\(\)/);
    expect(pkg).toMatch(/false, \/\/ needsEagerInit[^\n]*\n\s+false, \/\/ isCxxModule\n\s+true, \/\/ isTurboModule/);
  });

  it('has a contract in JavaScript for each', () => {
    const specs = fs.readdirSync(path.join(root, 'src/native/specs')).join('\n');
    const source = fs
      .readdirSync(path.join(root, 'src/native/specs'))
      .filter(f => f.endsWith('.ts'))
      .map(f => fs.readFileSync(path.join(root, 'src/native/specs', f), 'utf8'))
      .join('\n');
    expect(specs).toContain('NativeAppVersion.ts');
    for (const [name] of made) expect(source).toContain(`'${name}'`);
  });
});

describe('the application', () => {
  const app = read('MainApplication.kt');

  it('registers the one package', () => {
    expect(app).toContain('add(MihrabPackage())');
  });

  it('has no package of the old kind left for a module with a contract', () => {
    const old = fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.kt'))
      .filter(f => /override fun createNativeModules\([^)]*\)[^=]*=\s*(?:\n\s*)?listOf\(/.test(read(f)));
    expect(old).toEqual([]);
    // The muṣḥaf line's view manager, the location module and the alerts'
    // engine are the three packages that remain beside it.
    expect([...app.matchAll(/^\s+add\(([\w.]+)\(\)\)$/gm)].map(m => m[1])).toEqual([
      'MihrabPackage',
      'MushafLinePackage',
      'com.prayer_times.geolocation.GeolocationPackage',
      'io.invertase.notifee.NotifeePackage',
    ]);
  });
});
