/**
 * Every native module of ours is a typed TurboModule, on both sides.
 *
 * `src/native/specs/` holds a contract per module. Codegen turns each into
 * an abstract class (Android) and a protocol (iOS) at build time, so a
 * module that does not match its contract does not compile — but only if
 * the module is actually built against it. That is what this holds: for
 * every contract, the Kotlin extends the generated class and the iOS
 * module adopts the generated protocol and hands React Native its C++
 * class; and nothing has slipped back to the untyped ways.
 *
 * Under Jest the specs themselves are stood in for (jest.config.js), so
 * they are read here as text.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SPECS = path.join(ROOT, 'src', 'native', 'specs');
const KOTLIN = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const IOS = path.join(ROOT, 'ios', 'PrayerApp');

type Where = 'both' | 'android' | 'ios';
type Contract = { name: string; where: Where; text: string; required: string[]; optional: string[] };

const contracts: Contract[] = fs
  .readdirSync(SPECS)
  .filter(f => /^Native\w+\.ts$/.test(f))
  .map(f => {
    const text = fs.readFileSync(path.join(SPECS, f), 'utf8');
    const name = f.replace(/^Native|\.ts$/g, '');
    const where: Where = /Android only\./.test(text) ? 'android' : /iPhone, iPad and Mac only\./.test(text) ? 'ios' : 'both';
    const body = text.slice(text.indexOf('export interface Spec'), text.lastIndexOf('}'));
    const required = [...body.matchAll(/^ {2}(\w+)\(/gm)].map(m => m[1]).filter(m => m !== 'getConstants');
    const optional = [...body.matchAll(/^ {2}(\w+)\?: \(/gm)].map(m => m[1]);
    return { name, where, text, required, optional };
  });

const kotlin = fs
  .readdirSync(KOTLIN)
  .filter(f => f.endsWith('.kt'))
  .map(f => ({ file: f, text: fs.readFileSync(path.join(KOTLIN, f), 'utf8') }));
const objc = fs
  .readdirSync(IOS)
  .filter(f => /\.(m|mm)$/.test(f))
  .map(f => ({ file: f, text: fs.readFileSync(path.join(IOS, f), 'utf8') }));

describe('the contracts', () => {
  it('there are some, and each names itself the way codegen looks for it', () => {
    expect(contracts.length).toBeGreaterThanOrEqual(35);
    for (const c of contracts) {
      expect(c.text).toContain('export interface Spec extends TurboModule {');
      expect(c.text).toContain(`export default TurboModuleRegistry.get<Spec>('${c.name}');`);
    }
  });

  it('are what package.json hands to codegen', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.codegenConfig).toEqual({
      name: 'MihrabSpec',
      type: 'modules',
      jsSrcsDir: 'src/native/specs',
      android: { javaPackageName: 'com.prayer_times.specs' },
    });
  });

  it('use plain types only — nothing codegen would have to invent a struct for', () => {
    for (const c of contracts) {
      const body = c.text.slice(c.text.indexOf('export interface Spec'));
      const methods = body.split('\n').filter(l => /^ {2}\w+\??[(:]/.test(l) && !/getConstants/.test(l));
      for (const line of methods) {
        const params = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
        for (const p of params.split(',').map(s => s.trim()).filter(Boolean)) {
          const type = p.slice(p.indexOf(':') + 1).trim();
          expect(`${c.name}: ${type}`).toMatch(/: (string|number|boolean|Object|Array<Object>)( \| null)?$/);
        }
      }
    }
  });

  it('a module that sends events says so', () => {
    for (const name of ['CompassModule', 'BackgroundLocation', 'MihrabFoldPosture', 'MihrabVolumeKeys', 'AudioRouteWatcher', 'MihrabKeyCommands', 'WidgetQueueWatcher']) {
      const c = contracts.find(x => x.name === name)!;
      expect(c.required).toEqual(expect.arrayContaining(['addListener', 'removeListeners']));
    }
  });
});

describe('Android: each module is built against its contract', () => {
  const android = contracts.filter(c => c.where !== 'ios');

  it.each(android.map(c => [c.name, c] as const))('%s', (_n, c) => {
    const home = kotlin.find(k => new RegExp(`\\bNative${c.name}Spec\\(\\w+\\)`).test(k.text));
    expect(home ? home.file : `no Kotlin class extends Native${c.name}Spec`).toMatch(/\.kt$/);
    expect(home!.text).toContain(`import com.prayer_times.specs.Native${c.name}Spec`);
    // What the contract requires is overridden — the compiler says so too,
    // but only in a build; this says it in a second.
    for (const method of c.required) {
      expect(`${c.name}.${method}: ${new RegExp(`override fun ${method}\\(`).test(home!.text)}`).toBe(`${c.name}.${method}: true`);
    }
    if (/getConstants\(\)/.test(c.text)) expect(home!.text).toContain('override fun getTypedExportedConstants(): Map<String, Any>');
  });

  it('nothing is exported the untyped way any more', () => {
    for (const k of kotlin) {
      expect(`${k.file}: ${/@ReactMethod/.test(k.text)}`).toBe(`${k.file}: false`);
      expect(`${k.file}: ${/ReactContextBaseJavaModule\(/.test(k.text)}`).toBe(`${k.file}: false`);
    }
  });
});

describe('iOS: each module is built against its contract', () => {
  const ios = contracts.filter(c => c.where !== 'android');

  it.each(ios.map(c => [c.name, c] as const))('%s', (_n, c) => {
    const home = objc.find(o => o.text.includes(`Native${c.name}SpecJSI>(params)`));
    expect(home ? home.file : `no module hands over Native${c.name}SpecJSI`).toMatch(/\.mm$/);
    // Adopts the protocol: as the class itself (Objective-C) or as a category on the Swift class.
    expect(home!.text).toMatch(new RegExp(`@interface ${c.name} (\\(Turbo\\) |: \\w+ )<Native${c.name}Spec>`));
    expect(home!.text).toMatch(/- \(std::shared_ptr<facebook::react::TurboModule>\)getTurboModule:/);
    // A promise is `resolve:reject:` in a contract; the old spelling would be a method React Native never calls.
    const own = home!.text.slice(home!.text.indexOf(`@interface ${c.name} `));
    expect(own).not.toMatch(/^- \([^)]*\)[^\n{]*\b(resolver|rejecter):/m);
  });

  it('nothing is exported the untyped way any more — the two native views and the location module apart', () => {
    for (const o of objc) {
      if (['GlassBlur.m', 'MushafLine.m', 'MihrabGeolocation.mm'].includes(o.file)) continue;
      expect(`${o.file}: ${/RCT_EXTERN_MODULE|RCT_EXTERN_METHOD|RCT_EXPORT_METHOD|RCT_REMAP_METHOD/.test(o.text)}`).toBe(`${o.file}: false`);
    }
  });

  it('a Swift module’s .mm only passes on what the Swift class does not already answer to', () => {
    // A category method with the selector the Swift class has would replace
    // it — and, written as a pass-on, call itself for ever.
    for (const o of objc.filter(x => x.text.includes('(Turbo)'))) {
      for (const m of o.text.matchAll(/^- \(\w+\)(\w+)([^\n]*)\n\{\n {2}(?:return )?\[self (\w+)([^\n]*)\];/gm)) {
        const [, protocolName, protocolRest, swiftName, swiftRest] = m;
        if (protocolName !== swiftName) continue;
        // Same first word: then the rest of the selector must differ —
        // resolve/reject for resolver/rejecter, or arguments the other lacks.
        const labels = (rest: string) => [...rest.matchAll(/(\w+):/g)].map(x => x[1]).join(':');
        expect(`${o.file} ${protocolName}: ${labels(protocolRest) !== labels(swiftRest)}`).toBe(`${o.file} ${protocolName}: true`);
      }
    }
  });

  it('the files are in the Xcode project as Objective-C++', () => {
    const project = read('ios', 'PrayerApp.xcodeproj', 'project.pbxproj');
    for (const o of objc.filter(x => x.file.endsWith('.mm'))) {
      expect(project).toContain(`${o.file} in Sources`);
      expect(project).toMatch(new RegExp(`lastKnownFileType = sourcecode\\.cpp\\.objcpp;[^\\n]*path = PrayerApp/${o.file.replace('.', '\\.')};`));
    }
  });
});

describe('JavaScript', () => {
  it('reaches a module through its contract, never by name off NativeModules', () => {
    const offenders: string[] = [];
    const names = contracts.map(c => c.name).join('|');
    const byName = new RegExp(`NativeModules\\.(${names})\\b|NativeModules as [^)]*\\)\\s*\\.(${names})\\b`);
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (full.endsWith(path.join('native', 'notifee'))) continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(e.name) && !full.endsWith('nativeModule.ts')) {
          const code = fs
            .readFileSync(full, 'utf8')
            .split('\n')
            .filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l))
            .join('\n');
          if (byName.test(code)) offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });

  it('the old door is still there behind the new one (nativeModule.ts)', () => {
    const { nativeModule, nativeConstants } = require('../src/native/nativeModule');
    const rn = require('react-native');
    rn.NativeModules.TurboTestStandIn = { getConstants: () => ({ a: 1 }), b: 2 };
    expect(nativeModule(null, 'TurboTestStandIn')).toBe(rn.NativeModules.TurboTestStandIn);
    expect(nativeModule(null, 'TurboTestNotThere')).toBeUndefined();
    const typed = { ping: () => 1 };
    expect(nativeModule(typed, 'TurboTestStandIn')).toBe(typed);
    expect(nativeConstants(null, 'TurboTestStandIn')).toEqual({ a: 1 });
    rn.NativeModules.TurboTestPlain = { versionName: 'x' };
    expect(nativeConstants(null, 'TurboTestPlain')).toEqual({ versionName: 'x' });
    expect(nativeConstants(null, 'TurboTestNotThere')).toBeUndefined();
  });

  it('every contract is stood in for under Jest, and nothing else is', () => {
    const config = require('../jest.config.js');
    const key = Object.keys(config.moduleNameMapper).find(k => k.startsWith('/specs/('))!;
    const pattern = new RegExp(key);
    for (const c of contracts) expect(pattern.test(`./specs/Native${c.name}`)).toBe(true);
    expect(pattern.test('./specs/NativeSafeAreaProvider')).toBe(false);
  });
});
