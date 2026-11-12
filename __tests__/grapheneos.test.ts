/**
 * What GrapheneOS does differently, and what the app does about it.
 *
 * Checked on a Pixel 10 Pro running GrapheneOS 2026110801 and, for the
 * location stack, on an AOSP emulator (API 31, no Google apps: providers
 * `gps`, `fused`, `passive` and no `network`), which is what a GrapheneOS
 * phone has until its owner opts in to a network location service.
 *
 *   • SENSORS. A per-app switch, kept as the runtime permission
 *     `android.permission.OTHER_SENSORS`. Off, an app gets no events and
 *     zeroed values, and is told nothing.
 *   • LOCATION. No network provider by default, and readers who choose
 *     "Approximate" in the permission sheet.
 *   • MEMORY TAGGING. Hardware tags on the native heap (ARM MTE), which an
 *     app with native code is given when its manifest asks.
 *   • NO DYNAMIC CODE. Nothing here loads code that was not in the APK;
 *     the release script checks the APK for it.
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

const repo = (...parts: string[]) => readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const kt = (name: string) => repo('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', `${name}.kt`);

describe('the Sensors switch', () => {
  const module = kt('CompassModule');

  it('is asked of the platform by its permission, and only believed where the platform defines it', () => {
    expect(module).toContain('const val OTHER_SENSORS = "android.permission.OTHER_SENSORS"');
    const body = module.slice(module.indexOf('fun sensorsAccess('), module.indexOf('fun hasSystemCompass('));
    // Stock Android has no such permission, and an unknown permission also
    // reads as not granted: "unknown", never "denied".
    expect(body).toMatch(/pm\.getPermissionInfo\(OTHER_SENSORS, 0\)[\s\S]*?NameNotFoundException[\s\S]*?false/);
    expect(body).toMatch(/!defined -> "unknown"/);
    expect(body).toMatch(/checkSelfPermission\(OTHER_SENSORS\) ==[\s\S]*?PERMISSION_GRANTED -> "granted"[\s\S]*?else -> "denied"/);
    // Never a rejection: the screen must not hang on the question.
    expect(body).toMatch(/catch \(e: Exception\) \{\s*promise\.resolve\("unknown"\)/);
  });

  it('the wrapper answers "unknown" off Android and when the native side is older', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: { CompassModule: { startUpdates: jest.fn(), stopUpdates: jest.fn() } },
    }));
     
    const older = require('../src/native/CompassModule') as typeof import('../src/native/CompassModule');
    await expect(older.CompassModule!.sensorsAccess()).resolves.toBe('unknown');

    jest.resetModules();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        CompassModule: { startUpdates: jest.fn(), stopUpdates: jest.fn(), sensorsAccess: () => Promise.resolve('denied') },
      },
    }));
     
    const denied = require('../src/native/CompassModule') as typeof import('../src/native/CompassModule');
    await expect(denied.CompassModule!.sensorsAccess()).resolves.toBe('denied');

    jest.resetModules();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        CompassModule: { startUpdates: jest.fn(), stopUpdates: jest.fn(), sensorsAccess: () => Promise.reject(new Error('x')) },
      },
    }));
     
    const broken = require('../src/native/CompassModule') as typeof import('../src/native/CompassModule');
    await expect(broken.CompassModule!.sensorsAccess()).resolves.toBe('unknown');
    jest.dontMock('react-native');
    jest.resetModules();
  });

  describe('the compass', () => {
    type Hook = typeof import('../src/screens/compass/useCompassSensor');
    const startUpdates = jest.fn();
    const stopUpdates = jest.fn();
    let access: 'granted' | 'denied' | 'unknown' = 'granted';
    let appState: ((s: string) => void) | null = null;
    let hook: Hook;
    // The module registry is reset for each case, so React and its renderer
    // are taken from the same registry as the hook.
    let R: typeof import('react');
    let act: typeof import('react-test-renderer').act;
    let create: typeof import('react-test-renderer').create;
    let seen: string[] = [];

    beforeEach(() => {
      jest.useFakeTimers();
      jest.resetModules();
      startUpdates.mockClear();
      stopUpdates.mockClear();
      seen = [];
      appState = null;
      jest.doMock('../src/native/CompassModule', () => ({
        CompassModule: { startUpdates, stopUpdates, sensorsAccess: () => Promise.resolve(access) },
        CompassNativeModule: { addListener: jest.fn(), removeListeners: jest.fn() },
      }));
      jest.doMock('react-native', () => ({
        AppState: {
          addEventListener: (_: string, fn: (s: string) => void) => {
            appState = fn;
            return { remove: () => undefined };
          },
        },
        NativeEventEmitter: class {
          addListener() {
            return { remove: () => undefined };
          }
        },
      }));
       
      R = require('react') as typeof import('react');
      ({ act, create } = require('react-test-renderer') as typeof import('react-test-renderer'));
      hook = require('../src/screens/compass/useCompassSensor') as Hook;
       
    });
    afterEach(() => {
      jest.useRealTimers();
      jest.dontMock('react-native');
      jest.dontMock('../src/native/CompassModule');
    });

    function Probe() {
      seen.push(hook.useCompassSensor(true, 59.33, 18.07).mode);
      return null;
    }
    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    it('says so at once when the switch is off, and starts nothing', async () => {
      access = 'denied';
      act(() => {
        create(R.createElement(Probe));
      });
      await flush();
      expect(seen[seen.length - 1]).toBe('permission_denied');
      // No listener registered: there, it would get no events and only
      // make the system notify the reader that the app tried.
      expect(startUpdates).not.toHaveBeenCalled();
      // And it does not drift to "this phone has no compass" ten seconds on.
      act(() => {
        jest.advanceTimersByTime(15_000);
      });
      expect(seen[seen.length - 1]).toBe('permission_denied');
    });

    it('starts as before where the switch is on, or does not exist', async () => {
      for (const a of ['granted', 'unknown'] as const) {
        access = a;
        startUpdates.mockClear();
        act(() => {
          create(R.createElement(Probe));
        });
        await flush();
        expect(startUpdates).toHaveBeenCalledWith(59.33, 18.07);
      }
    });

    it('asks again on the way back from the settings', async () => {
      access = 'denied';
      act(() => {
        create(R.createElement(Probe));
      });
      await flush();
      expect(startUpdates).not.toHaveBeenCalled();
      access = 'granted';
      act(() => appState!('active'));
      await flush();
      expect(startUpdates).toHaveBeenCalledTimes(1);
      expect(seen[seen.length - 1]).toBe('checking');
    });
  });

  it('is said in its own words, with the way to the switch, in every language', () => {
    const banners = repo('src', 'screens', 'compass', 'StatusBanners.tsx');
    expect(banners).toMatch(
      /mode === 'permission_denied' && Platform\.OS === 'android'[\s\S]*?compass\.sensorsOffTitle[\s\S]*?compass\.sensorsOffBody[\s\S]*?Linking\.openSettings\(\)/,
    );
    for (const loc of ['en', 'sv', 'ar', 'tr', 'ur', 'id', 'de', 'fr', 'es', 'ru', 'bn', 'hi', 'zh']) {
      const compass = (JSON.parse(repo('src', 'i18n', 'locales', `${loc}.json`)) as { compass: Record<string, string> }).compass;
      expect(compass.sensorsOffTitle.length).toBeGreaterThan(5);
      expect(compass.sensorsOffBody.length).toBeGreaterThan(30);
    }
  });
});

describe('location without Google, and with "Approximate"', () => {
  const patch = repo('patches', '@react-native-community+geolocation+3.4.0.patch');
  const added = patch
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');

  it('the coarse permission is enough for the satellites from Android 12', () => {
    // Before: the satellites were refused to an app holding only the coarse
    // permission, so on a phone with no network provider — GrapheneOS by
    // default — a reader who chose Approximate could not be located at all.
    expect(added).toMatch(/boolean gpsAllowed = fine \|\| \(coarse && android\.os\.Build\.VERSION\.SDK_INT >= android\.os\.Build\.VERSION_CODES\.S\);/);
    expect(added).toMatch(/return gps \? LocationManager\.GPS_PROVIDER : network \? LocationManager\.NETWORK_PROVIDER : null;/);
    expect(added).toMatch(/return network \? LocationManager\.NETWORK_PROVIDER : gps \? LocationManager\.GPS_PROVIDER : null;/);
  });

  it('a single fix for an Approximate reader is asked of the platform itself, fused provider first', () => {
    // A listener on `gps` for such a reader stood 28 s on an AOSP Android 12
    // emulator and was handed nothing.
    expect(added).toMatch(/if \(approximateOnly\(\) && android\.os\.Build\.VERSION\.SDK_INT >= android\.os\.Build\.VERSION_CODES\.S\) \{\s*\+\s*currentApproximateLocation\(/);
    expect(added).toMatch(/new String\[\] \{LocationManager\.FUSED_PROVIDER, LocationManager\.NETWORK_PROVIDER, LocationManager\.GPS_PROVIDER\}/);
    expect(added).toMatch(/locationManager\.getCurrentLocation\(provider, request, cancel, mReactContext\.getMainExecutor\(\)/);
    // Asked for by name: a "balanced" request to the fused provider is the
    // network provider's alone, and with none it answers at once with nothing.
    expect(added).toMatch(/setQuality\(android\.location\.LocationRequest\.QUALITY_HIGH_ACCURACY\)/);
    // Its own deadline, and one answer only.
    expect(added).toMatch(/handler\.postDelayed\(giveUp, timeout\);/);
    expect(added.match(/answered\.compareAndSet\(false, true\)/g)).toHaveLength(2);
  });

  it('a provider the phone does not have is simply not enabled', () => {
    expect(added).toMatch(/private static boolean isEnabled\([\s\S]*?catch \(RuntimeException e\) \{\s*\+?\s*return false;/);
  });

  it('a permission lost on the way is an error for the caller, not a crash', () => {
    expect(patch).toMatch(/catch \(SecurityException e\) \{\n-\s+throw e;\n(\+.*\n)+?\+\s+error\.invoke\(PositionError\.buildError\(PositionError\.PERMISSION_DENIED/);
  });

  it('still carries no Google Play services', () => {
    expect(patch).toMatch(/^-\s+implementation 'com\.google\.android\.gms:play-services-location/m);
    expect(added).not.toMatch(/com\.google\.android\.gms/);
  });
});

describe('the permission that is held is not asked for again', () => {
  it('checks before it asks, so "Approximate" is not answered with "change to precise?"', () => {
    const src = repo('src', 'utils', 'locationPermission.ts');
    const check = src.indexOf('PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION)');
    const ask = src.indexOf('PermissionsAndroid.requestMultiple(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(ask);
    expect(src).toMatch(/if \(hasFine \|\| hasCoarse\) return 'granted';/);
    // And the library does not ask behind the app's back (it asks for PRECISE).
    expect(repo('src', 'config', 'geolocationInit.ts')).toContain("skipPermissionRequests: Platform.OS === 'android',");
  });
});

describe('memory tagging', () => {
  it('the manifest asks for it, by a value the build can change', () => {
    expect(repo('android', 'app', 'src', 'main', 'AndroidManifest.xml')).toContain('android:memtagMode="${memtagMode}"');
    expect(repo('android', 'app', 'build.gradle')).toMatch(
      /manifestPlaceholders\.memtagMode = \(project\.findProperty\("memtagMode"\) \?: "(async|default)"\)/,
    );
  });
});

describe('what the APK promises a hardened Android', () => {
  const script = path.join(__dirname, '..', 'scripts', 'check-apk-hardening.py');

  /** A 64-bit little-endian ELF with the given program headers: (type, flags, align). */
  function elf(segments: Array<[number, number, number]>): Buffer {
    const head = Buffer.alloc(64);
    head.write('\x7fELF', 0, 'latin1');
    head[4] = 2;
    head[5] = 1;
    head.writeBigUInt64LE(64n, 0x20);
    head.writeUInt16LE(56, 0x36);
    head.writeUInt16LE(segments.length, 0x38);
    const ph = segments.map(([type, flags, align]) => {
      const b = Buffer.alloc(56);
      b.writeUInt32LE(type, 0);
      b.writeUInt32LE(flags, 4);
      b.writeBigUInt64LE(BigInt(align), 0x30);
      return b;
    });
    return Buffer.concat([head, ...ph]);
  }
  const LOAD = 1;
  const STACK = 0x6474e551;

  /** Zip the files with python (stored, as the APK stores its libraries) and run the check on it. */
  function run(files: Record<string, Buffer>) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'apk-'));
    const names: string[] = [];
    for (const [name, data] of Object.entries(files)) {
      const flat = name.replace(/\//g, '__');
      writeFileSync(path.join(dir, flat), data);
      names.push(`${flat}=${name}`);
    }
    const zip = spawnSync(
      'python3',
      ['-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_STORED)\nfor a in sys.argv[2:]:\n    f,n=a.split("=",1); z.write(f,n)\nz.close()', path.join(dir, 'a.apk'), ...names],
      { cwd: dir },
    );
    expect(zip.status).toBe(0);
    // No aapt2: the manifest checks are reported as skipped, never as passed.
    const r = spawnSync('python3', [script, path.join(dir, 'a.apk'), '--aapt2', '/nonexistent'], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout };
  }

  const good = elf([[LOAD, 5, 0x4000], [LOAD, 6, 0x4000], [STACK, 6, 16]]);

  it('passes an APK that keeps them, and says what it could not look at', () => {
    const r = run({ 'classes.dex': Buffer.from('dex\n035 Lcom/prayer_times/MainActivity;'), 'lib/arm64-v8a/libx.so': good });
    expect(r.status).toBe(0);
    expect(r.out).toContain('skipped: the manifest');
    expect(r.out).not.toContain('memory tagging asked for');
  });

  it('stops on a class loader for files or memory', () => {
    const r = run({ 'classes.dex': Buffer.from('xx Ldalvik/system/DexClassLoader; yy'), 'lib/arm64-v8a/libx.so': good });
    expect(r.status).toBe(1);
    expect(r.out).toContain('dalvik.system.DexClassLoader');
  });

  it('stops on a segment both writable and executable, an executable stack, or 4 KB alignment', () => {
    expect(run({ 'classes.dex': Buffer.from('x'), 'lib/arm64-v8a/libx.so': elf([[LOAD, 7, 0x4000], [STACK, 6, 16]]) }).out).toContain(
      'both writable and executable',
    );
    expect(run({ 'classes.dex': Buffer.from('x'), 'lib/arm64-v8a/libx.so': elf([[LOAD, 5, 0x4000], [STACK, 7, 16]]) }).out).toContain(
      'executable stack',
    );
    const small = run({ 'classes.dex': Buffer.from('x'), 'lib/arm64-v8a/libx.so': elf([[LOAD, 5, 0x1000], [STACK, 6, 16]]) });
    expect(small.status).toBe(1);
    expect(small.out).toContain('under 16 KB');
  });

  it('stops when there is nothing to look at, rather than passing', () => {
    const r = run({ 'README.txt': Buffer.from('x') });
    expect(r.status).toBe(1);
    expect(r.out).toContain('no classes*.dex');
    expect(r.out).toContain('no lib/arm64-v8a');
  });

  it('is run on the GitHub APK at every release', () => {
    expect(repo('scripts', 'release.sh')).toMatch(
      /python3 "\$ROOT\/scripts\/check-apk-hardening\.py" "\$APK" --aapt2 "\$AAPT" >\/dev\/null \\\n\s+\|\| die "github APK breaks a hardening promise/,
    );
  });
});

/**
 * F-Droid's build was the one without R8: a dex of 32.8 MB against 10.5 MB,
 * all of it compiled at every install on a phone that compiles ahead of time
 * — 4.7 s against 2.8 s on a Pixel 10 Pro under GrapheneOS.
 */
describe('R8 runs in every release flavor, F-Droid included', () => {
  const gradle = repo('android', 'app', 'build.gradle');

  it('is on unless a build asks otherwise by name', () => {
    expect(gradle).toContain('def fdroidWithoutR8 = wantsFdroid && project.hasProperty("fdroidNoR8")');
    expect(gradle).toContain('def enableProguardInReleaseBuilds = !fdroidWithoutR8 && !profileBuild');
    expect(gradle).not.toContain('!wantsFdroid && !profileBuild');
    expect(gradle).toMatch(/minifyEnabled enableProguardInReleaseBuilds/);
    expect(gradle).toMatch(/shrinkResources enableProguardInReleaseBuilds/);
  });

  it('lint stays off for that flavor: it was the other half of what the builder ran out of memory on', () => {
    expect(gradle).toMatch(/checkReleaseBuilds !wantsFdroid/);
  });

  it('the recipe mirrored here turns nothing of it off', () => {
    const recipe = repo('contrib', 'fdroid', 'com.prayer_times.yml');
    expect(recipe).not.toMatch(/minifyEnabled false|fdroidNoR8/);
  });
});

/**
 * A stretchable card is sixteen sizes, each composed in full at every
 * redraw, and each drew its own practice graph: 150 bitmaps (25 MB) stood in
 * the app's memory on a Pixel 10 Pro with three cards placed, and a redraw
 * put 170 more beside them. The same record on the same day in the same
 * shape is the same picture.
 */
describe('the widgets’ practice graph is drawn once for the same question', () => {
  const src = repo('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'glance', 'StreakGlanceWidget.kt');

  it('is kept by everything it is drawn from, the day included', () => {
    expect(src).toContain('val key = "$today|$rows|$columns|$cellWPx|$cellHPx|$gapPx|$accent|$mirror|$since|$days"');
    expect(src).toMatch(/return GridCache\.get\(key\) \{/);
    // Every card draws through it.
    for (const card of ['LogGlanceWidget', 'PrayerGlanceWidget', 'StreakGlanceWidget']) {
      const kt = repo('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'glance', `${card}.kt`);
      expect(kt).toMatch(/practiceGrid\(pr, /);
      expect(kt.replace(src, '')).not.toMatch(/PracticeGridBitmap\.render\(/);
    }
  });

  it('is small, and lets a picture go without recycling it', () => {
    const cache = src.slice(src.indexOf('internal object GridCache'));
    expect(cache).toContain('private const val MAX_ENTRIES = 40');
    expect(cache).toContain('private const val MAX_BYTES = 8L * 1024 * 1024');
    // A RemoteViews on its way to the launcher may still hold it.
    expect(cache).not.toMatch(/\.recycle\(\)/);
    expect(cache).toMatch(/kept\[key\]\?\.let \{ if \(!it\.isRecycled\) return it \}/);
  });
});
