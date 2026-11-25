/**
 * The encrypted store is the app's own native code, and it must open what
 * react-native-encrypted-storage wrote: the prayer journal, the fasting
 * log, the saved place and the sync identity of every installed copy are
 * in that library's Keychain items and preferences file. These pin the
 * parts that, changed, would read as an empty store.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Android', () => {
  const kt = code(read('android/app/src/main/java/com/prayer_times/SecureStoreModule.kt'));

  it('opens the library’s file with the library’s schemes', () => {
    expect(kt).toContain('const val FILE = "RN_ENCRYPTED_STORAGE_SHARED_PREF"');
    expect(kt).toMatch(/MasterKey\.Builder\(context\)\.setKeyScheme\(MasterKey\.KeyScheme\.AES256_GCM\)\.build\(\)/);
    expect(kt).toMatch(/EncryptedSharedPreferences\.create\(\s*context,\s*FILE,\s*key,\s*EncryptedSharedPreferences\.PrefKeyEncryptionScheme\.AES256_SIV,\s*EncryptedSharedPreferences\.PrefValueEncryptionScheme\.AES256_GCM,?\s*\)/);
  });

  it('falls back to the plain file of the same name, as the library did', () => {
    expect(kt).toMatch(/catch \(e: Exception\) \{[\s\S]*?context\.getSharedPreferences\(FILE, Context\.MODE_PRIVATE\)/);
  });

  it('is built against the crypto library version the data was written with', () => {
    expect(read('android/app/build.gradle')).toContain('implementation("androidx.security:security-crypto:1.1.0-alpha03")');
  });

  it('is registered, under the name the JS asks for', () => {
    expect(kt).toContain('const val NAME = "MihrabSecureStore"');
    expect(read('android/app/src/main/java/com/prayer_times/MainApplication.kt')).toContain('add(SecureStorePackage())');
  });

  it('writes with commit, so a resolved write is on disk', () => {
    expect(kt.match(/\.commit\(\)/g)).toHaveLength(2);
    expect(kt).not.toContain('.apply()');
  });
});

describe('iOS', () => {
  const m = code(read('ios/PrayerApp/SecureStore.mm'));

  it('finds items as the library stored them: generic passwords by account alone', () => {
    expect(m.match(/kSecClass : \(__bridge id\)kSecClassGenericPassword/g)).toHaveLength(3);
    expect(m.match(/kSecAttrAccount : key/g)).toHaveLength(3);
    // An item written with no service is not found by a query naming one.
    for (const attribute of ['kSecAttrService', 'kSecAttrAccessGroup', 'kSecAttrAccessible', 'kSecAttrSynchronizable']) {
      expect(m).not.toContain(attribute);
    }
  });

  it('tells a failed read from an absent key', () => {
    expect(m).toMatch(/status == errSecItemNotFound\) \{\s*resolve\(nil\);\s*\} else \{[\s\S]*?rejectWith\(reject, @"The value could not be read"/);
  });

  it('has no way to wipe the whole Keychain', () => {
    expect(m).not.toMatch(/RCT_EXPORT_METHOD\(clear/);
    expect(m).not.toMatch(/- \(void\)clear/);
    expect(read('src/native/specs/NativeMihrabSecureStore.ts')).not.toMatch(/clear/);
    expect(m).not.toContain('kSecClassIdentity');
  });

  it('is compiled into the app, under the name the JS asks for', () => {
    expect(m).toContain('RCT_EXPORT_MODULE(MihrabSecureStore)');
    const project = read('ios/PrayerApp.xcodeproj/project.pbxproj');
    expect(project.match(/SecureStore\.mm in Sources \*\/,/g)).toHaveLength(1);
  });
});

describe('JavaScript', () => {
  it('reaches the native module by name and nothing else does the storing', () => {
    expect(read('src/native/SecureStore.ts')).toContain("nativeModule(NativeMihrabSecureStore, 'MihrabSecureStore')");
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('react-native-encrypted-storage');
  });

  it('is the OS keyring on Windows, Linux and the web', () => {
    expect(read('desktop/webpack.config.js')).toMatch(/NormalModuleReplacementPlugin\(\/\\\/native\\\/SecureStore\(\\\.ts\)\?\$\/, shim\('encrypted-storage\.js'\)\)/);
  });
});
