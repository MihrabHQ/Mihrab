/**
 * The F-Droid build is not found broken by F-Droid.
 *
 * F-Droid's recipe lowers the SDK the app is compiled against, and its bot
 * builds whatever is tagged. Twice a change that built here did not build
 * there: a call to a newer API (2.38.1, #131), and a library whose metadata
 * refuses the lower SDK (androidx.pdf, 2026-11-28 — three pushes went out on
 * a red F-Droid job before it was read). These are the four things that now
 * say so first; each is pinned here so none is dropped quietly.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8');

describe('the F-Droid build is guarded', () => {
  const recipe = read('contrib/fdroid/com.prayer_times.yml');
  const gradle = read('android/app/build.gradle');

  it('lowers the SDK in the recipe by lines every guard reads for itself', () => {
    expect(recipe).toMatch(/- sed -i 's\/SdkVersion = \d+\/SdkVersion = \d+\/' \.\.\/build\.gradle/);
  });

  it('1. before a push: preflight builds the F-Droid release the recipe\'s way when Android has changed', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.preflight.endsWith('&& sh scripts/fdroid-check.sh --if-android-changed')).toBe(true);
    expect(pkg.scripts['fdroid-check']).toBe('sh scripts/fdroid-check.sh');
    const sh = read('scripts/fdroid-check.sh');
    // The recipe's own lines, the flavour, build type and ABI it builds, and the file put back whatever happens.
    expect(sh).toContain("grep -E \"^[[:space:]]+- sed -i 's/(SdkVersion|\\\"37)\" \"$RECIPE\"");
    expect(sh).toContain('./gradlew assembleFdroidRelease -PreactNativeArchitectures=arm64-v8a');
    expect(sh).toContain('trap restore EXIT INT TERM');
    expect(sh).toMatch(/\^\(android\/\|contrib\/fdroid\/\|package\\\.json\$\|package-lock\\\.json\$\)/);
    // Under CI the Android job is this build.
    expect(sh).toContain('if [ "${CI:-}" != "" ]; then');
  });

  it('2. on every Android build: each library is asked what SDK it needs, against the recipe\'s', () => {
    expect(gradle).toContain("tasks.register('checkFdroidLibraries')");
    expect(gradle).toContain("tasks.matching { it.name == 'preBuild' }.configureEach { dependsOn 'checkFdroidLibraries' }");
    expect(gradle).toContain("rootProject.file('../contrib/fdroid/com.prayer_times.yml')");
    expect(gradle).toContain('if ((sdk > floor || ext > 0) && !FDROID_SDK_EXEMPT.any');
    // Fetched libraries only: a module built with the app says the SDK the build was given, and asking it
    // stopped every ordinary build.
    expect(gradle).toContain('if (!(a.id.componentIdentifier instanceof org.gradle.api.artifacts.component.ModuleComponentIdentifier)) return');
    // One library is known to ask for more and shown to build F-Droid's way; the list is not a place to add to quietly.
    expect(gradle).toContain("def FDROID_SDK_EXEMPT = ['androidx.pdf']");
  });

  it('3. in CI: the Android job builds the release, at the recipe\'s SDK', () => {
    const ci = read('.github/workflows/native.yml');
    expect(ci).toContain('sh /tmp/fdroid-sdk.sh');
    expect(ci).toContain('./gradlew assembleFdroidRelease');
    expect(ci).not.toContain('assembleFdroidDebug');
  });

  it('4. before a tag: the release stops on native builds that are red', () => {
    expect(read('scripts/release.sh')).toContain('gh run list --workflow=native.yml --branch main --status completed');
    expect(read('scripts/release/preflight.ts')).toContain('() => nativeBuildsOnMain(ctx),');
  });
});
