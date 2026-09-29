/**
 * build-catalyst.sh, ported (scripts/release/catalyst.ts), run end to end
 * against a fake Mac. releaseCatalystGate.test.ts holds the shell's payload
 * gate by its text; these hold the port by what it does: the hidden launch
 * first, the visible one only when the payload did not come, a locked
 * console reported rather than required, the lock put back whatever
 * happens, the ticket stapled with retries, the ghosts swept and swept
 * again before a build is failed for them.
 */
import {
  APP,
  appGroupLine,
  buildCatalyst,
  consoleLocked,
  gatekeeperAccepts,
  ghostApps,
  ghostPaths,
  groupNameFrom,
  isSandboxed,
  localDate,
  macMinimumVerdict,
  notaryAccepted,
  pemFromBase64,
  submissionId,
} from '../scripts/release/catalyst.ts';
import { identityFrom } from '../scripts/release/toolchain.ts';
import { HOME, ROOT, World, stopOf } from './fixtures/releaseWorld';

const LSREG = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const ID = 'Developer ID Application: Hassan (GAW23HT439)';
const GROUP = 'GAW23HT439.group.com.prayerapp';
const DOMAIN = `${HOME}/Library/Group Containers/${GROUP}/Library/Preferences/${GROUP}`;
const ENTS_P = (sandbox: boolean, group = GROUP) =>
  `{\n  "com.apple.security.application-groups" => [\n    0 => "${group}"\n  ]\n${sandbox ? '  "com.apple.security.app-sandbox" => true\n' : ''}  "keychain-access-groups" => [\n    0 => "GAW23HT439.com.hassan.prayerapp"\n  ]\n}`;

/** A Mac on which the whole build succeeds. */
function mac() {
  const w = new World();
  w.file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, 'MARKETING_VERSION = 2.28.0;\n');
  w.file(`${ROOT}/ios/Podfile.lock`, 'PODFILE CHECKSUM: original\n');
  w.file(`${ROOT}/ios/PrayerApp/Catalyst.entitlements`, `<key>com.apple.security.application-groups</key>\n<array>\n\t<string>${GROUP}</string>\n</array>`);
  w.executables.add(LSREG);
  w.dir('/Applications/Mihrab.app');
  w.dir('/Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex');
  let payload = '';
  w.on(/./, {}) // everything else succeeds quietly
    .on('xcodebuild -version', { stdout: 'Xcode 27.0\n' })
    .on('security find-identity', { stdout: `  1) ABC "Apple Development: Hassan (X)"\n  2) DEF "${ID}"\n` })
    .on('pod install', c => {
      // CocoaPods rewrites the lock for the source build.
      w.file(`${ROOT}/ios/Podfile.lock`, 'PODFILE CHECKSUM: rewritten\n');
      return { code: c.opts.env?.MIHRAB_CATALYST === '1' ? 0 : 9 };
    })
    .on('ditto ios/build/catalyst-release', () => {
      w.dir(`${ROOT}/${APP}/Contents/Frameworks/hermesvm.framework`);
      w.file(`${ROOT}/${APP}/Contents/Frameworks/hermesvm.framework/hermesvm`, 'binary');
      w.dir(`${ROOT}/${APP}/Contents/Frameworks/hermesvm.framework/Versions`);
      w.dir(`${ROOT}/${APP}/Contents/PlugIns/PrayerWidgetExtension.appex`);
      return {};
    })
    .on(/plutil -extract LSMinimumSystemVersion raw -o - ios\/build\/catalyst-dist\/Mihrab\.app\/Contents\/Info\.plist/, { stdout: '12.1\n' })
    .on(/plutil -extract LSMinimumSystemVersion .*appex/, { stdout: '14.0\n' })
    .on('codesign -dv', { stderr: 'TeamIdentifier=GAW23HT439\n' })
    .on('codesign -d --entitlements', c => ({ stdout: c.args[c.args.length - 1].endsWith('.appex') ? 'EXT' : 'APP' }))
    .on('plutil -p -', c => ({ stdout: c.opts.input === 'EXT' ? ENTS_P(true) : ENTS_P(false) }))
    .on('pgrep -f ios/build/catalyst-dist/Mihrab.app/Contents/MacOS/PrayerApp', { stdout: '4242\n' })
    .on('defaults delete', () => {
      payload = '';
      return {};
    })
    .on('open', () => {
      payload = `{"days":[{"dateKey":"${localDate(w.now)}"}]}`;
      return {};
    })
    .on(`defaults read ${DOMAIN}`, () => (payload ? { stdout: payload } : { code: 1 }))
    .on('xcrun notarytool history', {})
    .on('xcrun notarytool submit', { stdout: '  id: 1234abcd-0000\n  status: Accepted\n' })
    .on('spctl', { stderr: `${ROOT}/${APP}: accepted\nsource=Notarized Developer ID\n` })
    .on(`${LSREG} -dump`, {
      stdout: 'path:          /Applications/Mihrab.app (0x42c4)\npath:  /Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex (0x1)\n',
    })
    .on('pluginkit -m', { stdout: '+ maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension\n' })
    .on('ditto -c -k', c => {
      w.file(`${ROOT}/${c.args[c.args.length - 1]}`, 'ZIPBYTES');
      return {};
    });
  return w;
}

async function build(w: World, args: string[] = []) {
  const ctx = w.ctx();
  let code: number | undefined;
  const stopped = await stopOf(async () => {
    code = await buildCatalyst(ctx, args);
  });
  return { code, stopped, out: w.out.join('\n'), err: w.err.join('\n') };
}

describe('a whole build on a healthy Mac', () => {
  it('builds, signs inside out, launches hidden, notarises, staples and hands the machine back', async () => {
    const w = mac();
    const { code, stopped, out } = await build(w);
    expect(stopped).toBeUndefined();
    expect(code).toBe(0);
    // Hidden launch only: the payload came.
    expect(w.ran('open').map(c => c.args)).toEqual([['-g', '-j', APP]]);
    // Frameworks, then the extension, then the app.
    const signs = w.ran('codesign --force').map(c => c.args[c.args.length - 1]);
    expect(signs).toEqual([
      `${APP}/Contents/Frameworks/hermesvm.framework`,
      `${APP}/Contents/PlugIns/PrayerWidgetExtension.appex`,
      APP,
    ]);
    // The stray hermes binary became the canonical symlink.
    expect(w.symlinks.get(`${ROOT}/${APP}/Contents/Frameworks/hermesvm.framework/hermesvm`)).toBe('Versions/Current/hermesvm');
    // Staple AFTER the submission, re-zip AFTER the staple.
    expect(w.indexOf('xcrun stapler staple')).toBeGreaterThan(w.indexOf('xcrun notarytool submit'));
    expect(w.calls.map(c => c.line).lastIndexOf(`ditto -c -k --keepParent ${APP} ios/build/catalyst-dist/Mihrab-macOS-2.28.0.zip`))
      .toBeGreaterThan(w.indexOf('xcrun stapler staple'));
    // spctl only ever on the dist copy, never on an unpacked temp one.
    for (const c of w.ran('spctl')) expect(c.args[c.args.length - 1]).toBe(APP);
    expect(out).toContain('▸ Done: ios/build/catalyst-dist/Mihrab-macOS-2.28.0.zip');
    expect(w.files.get(`${ROOT}/ios/build/catalyst-dist/Mihrab-macOS-2.28.0.zip.sha256`)).toMatch(/^[0-9a-f]{64} {2}ios\/build\/catalyst-dist\/Mihrab-macOS-2\.28\.0\.zip\n$/);
  });

  it('puts Podfile.lock back after the Catalyst pod install', async () => {
    const w = mac();
    await build(w);
    expect(w.files.get(`${ROOT}/ios/Podfile.lock`)).toBe('PODFILE CHECKSUM: original\n');
  });

  it('puts it back when the build fails too', async () => {
    const w = mac().on('xcodebuild -workspace', { code: 65 });
    const { stopped } = await build(w);
    expect(stopped).toMatch(/xcodebuild failed/);
    expect(w.files.get(`${ROOT}/ios/Podfile.lock`)).toBe('PODFILE CHECKSUM: original\n');
  });

  it('--check-toolchain answers and builds nothing', async () => {
    const w = mac();
    expect((await build(w, ['--check-toolchain'])).code).toBe(0);
    expect(w.out).toEqual(['▸ Catalyst toolchain: Xcode 27.0']);
    expect(w.ran('pod')).toEqual([]);
  });
});

describe('the smoke launch', () => {
  it('a sleeping Mac: nothing from the hidden launch, then the visible one writes it (2.19.0)', async () => {
    const w = mac();
    let opens = 0;
    w.on('open', () => {
      opens++;
      return {};
    });
    // Only the visible launch (no -g) produces a payload.
    w.on('open ios/build', () => {
      opens++;
      w.on(`defaults read ${DOMAIN}`, { stdout: localDate(w.now) });
      return {};
    });
    const { stopped, out } = await build(w);
    expect(stopped).toBeUndefined();
    expect(opens).toBe(2);
    expect(out).toContain('(it took a visible launch; the Mac was probably asleep)');
  });

  it('a locked Mac: reported, not required, and the widget data is put back (2.27.0)', async () => {
    const w = mac()
      .on('open', {})
      .on('ioreg', { stdout: '<dict>\n\t<key>IOConsoleLocked</key>\n\t<true/>\n</dict>' })
      .on('defaults export', c => {
        w.file(c.args[2], 'saved prefs');
        return {};
      });
    const { stopped, err } = await build(w);
    expect(stopped).toBeUndefined();
    expect(err).toContain('the Mac is locked');
    expect(w.ran('defaults import')).toHaveLength(1);
    expect(w.ran('open').filter(c => !c.args.includes('-g'))).toHaveLength(0);
  });

  it('no payload hidden or visible, on an unlocked Mac, fails and says both', async () => {
    const w = mac().on('open', {}).on('ioreg', { stdout: '<key>IOConsoleLocked</key><false/>' });
    const { stopped, err } = await build(w);
    expect(stopped).toMatch(/has no payload for today, hidden or visible/);
    expect(err).toContain('entitlement is on BOTH the app and the .appex');
    expect(w.ran('kill 4242').length).toBeGreaterThan(0);
  });

  it('an app that never comes up fails and asks AMFI why', async () => {
    const w = mac().on('pgrep -f ios/build', { code: 1 });
    const { stopped, err } = await build(w);
    expect(stopped).toMatch(/the app never came up/);
    expect(err).toContain('AppleMobileFileIntegrity');
    expect(w.ran('pgrep -f ios/build')).toHaveLength(30);
  });

  it('reads the group container by path, never as a bare domain', async () => {
    const w = mac();
    await build(w);
    for (const c of w.ran('defaults')) expect(c.args[1]).toBe(DOMAIN);
  });
});

describe('what signing must have sealed in', () => {
  it('an unsandboxed extension stops the build', async () => {
    const w = mac().on('plutil -p -', { stdout: ENTS_P(false) });
    expect((await build(w)).stopped).toMatch(/the widget extension is not sandboxed/);
  });

  it('app and extension naming different groups stops the build', async () => {
    const w = mac().on('plutil -p -', c => ({ stdout: c.opts.input === 'EXT' ? ENTS_P(true, 'other.group') : ENTS_P(false) }));
    expect((await build(w)).stopped).toMatch(/app and extension disagree about the App Group/);
  });

  it('a profile that does not carry the signing certificate stops before signing (AMFI SIGKILL)', async () => {
    const w = mac()
      .file(`${ROOT}/ios/PrayerApp/embedded.provisionprofile`, 'PROFILE')
      .on('security cms', { stdout: '<plist>profile</plist>' })
      .on('plutil -p -', c => ({ stdout: c.opts.input?.startsWith('<plist>') ? '{ "Name" => "x" }' : ENTS_P(true) }))
      .on('plutil -extract DeveloperCertificates xml1', { stdout: '<array><data>AAAA</data></array>' })
      .on('plutil -extract DeveloperCertificates raw', { stdout: '1\n' })
      .on('plutil -extract DeveloperCertificates.0', { stdout: 'QUJD\n' })
      .on('openssl x509', { stdout: 'subject=CN=Apple Development: Hassan (X)\n' });
    const { stopped, err } = await build(w);
    expect(stopped).toMatch(/the profile does not carry the certificate being signed with/);
    expect(err).toContain('profile holds 1 certificate(s), none of them that one.');
    expect(w.ran('codesign --force')).toEqual([]);
  });

  it('the 10.15 fallback stops the build', async () => {
    const w = mac().on(/plutil -extract LSMinimumSystemVersion raw -o - ios\/build\/catalyst-dist\/Mihrab\.app\/Contents\/Info\.plist/, { stdout: '10.15\n' });
    expect((await build(w)).stopped).toMatch(/the\s+macOS 10\.15 fallback is back|LSMinimumSystemVersion is '10\.15'/);
  });

  it('a signature that does not verify stops the build (the shell skipped past it)', async () => {
    const w = mac().on('codesign --verify', { code: 1 });
    expect((await build(w)).stopped).toMatch(/codesign --verify --strict --deep rejects/);
  });
});

describe('notarisation', () => {
  it('Invalid is read from the log — --wait exits 0 on it — and the log is fetched', async () => {
    const w = mac().on('xcrun notarytool submit', { stdout: '  id: 9f9f-0001\n  status: Invalid\n' });
    expect((await build(w)).stopped).toBe('notarization was not accepted.');
    expect(w.ran('xcrun notarytool log 9f9f-0001')).toHaveLength(1);
  });

  it('staples with six tries, 10 to 50 seconds apart, before it gives up (2.14.0)', async () => {
    let tries = 0;
    const w = mac().on('xcrun stapler staple', () => ({ code: ++tries < 4 ? 73 : 0 }));
    const { stopped, out } = await build(w);
    expect(stopped).toBeUndefined();
    expect(tries).toBe(4);
    expect(out.split('\n').filter(l => l.includes('no ticket yet'))).toEqual([
      '  ▸ no ticket yet (attempt 1 of 6) — waiting 10s…',
      '  ▸ no ticket yet (attempt 2 of 6) — waiting 20s…',
      '  ▸ no ticket yet (attempt 3 of 6) — waiting 30s…',
    ]);
  });

  it('with no credentials at all it stops and says how to set them up', async () => {
    const w = mac().on('xcrun notarytool history', { code: 1 });
    const { stopped, err } = await build(w);
    expect(stopped).toBe('  ✗ No notarization credentials.');
    expect(err).toContain('xcrun notarytool store-credentials mihrab');
  });

  it('SKIP_NOTARIZE builds an unpublishable zip and says so', async () => {
    const w = mac();
    w.env.SKIP_NOTARIZE = '1';
    const { stopped, err } = await build(w);
    expect(stopped).toBeUndefined();
    expect(err).toContain('this zip is NOT notarized and MUST NOT be');
    expect(w.ran('xcrun notarytool submit')).toEqual([]);
  });

  it('in dry run nothing is sent to Apple', async () => {
    const w = mac();
    const ctx = w.ctx({ dryRun: true });
    await buildCatalyst(ctx, []);
    expect(w.ran('xcrun notarytool submit')).toEqual([]);
    expect(ctx.wouldDo[0]).toMatch(/^submit ios\/build\/catalyst-dist\/Mihrab-macOS-2\.28\.0\.zip to Apple's notary service/);
  });
});

describe('handing the machine back', () => {
  it('unregisters .app ghosts, never an .appex by name', async () => {
    const w = mac().on(`${LSREG} -dump`, {
      stdout: [
        'path:   /Applications/Mihrab.app (0x1)',
        'path:   /private/var/folders/x/T/AppTranslocation/Y/d/Mihrab.app (0x2)',
        'path:   /private/var/folders/x/T/AppTranslocation/Y/d/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex (0x3)',
      ].join('\n'),
    });
    // The re-sweep sees the ghost gone.
    let dumps = 0;
    w.on(`${LSREG} -dump`, () => ({
      stdout: ++dumps === 1 ? 'path:   /private/var/folders/x/T/AppTranslocation/Y/d/Mihrab.app (0x2)\n' : '',
    }));
    await build(w);
    const unregistered = w.ran(`${LSREG} -u`).map(c => c.args[1]);
    expect(unregistered).toContain('/private/var/folders/x/T/AppTranslocation/Y/d/Mihrab.app');
    expect(unregistered.some(p => p.endsWith('.appex'))).toBe(false);
  });

  it('a ghost that keeps coming back fails the build after four sweeps (2.27.0)', async () => {
    const w = mac().on(`${LSREG} -dump`, { stdout: `path:   ${ROOT}/ios/build/catalyst-release/Build/Products/Release-maccatalyst/PrayerApp.app (0x9)\n` });
    const { stopped, err } = await build(w);
    expect(stopped).toMatch(/LaunchServices still points at a build copy/);
    expect(err).toContain('The zip is built and fine');
  });
});

describe('the small parsers', () => {
  it('finds the identity of the kind asked for', () => {
    expect(identityFrom(`  1) A "Apple Development: X (1)"\n  2) B "${ID}"`, 'Developer ID Application')).toBe(ID);
    expect(identityFrom('', 'Apple Distribution')).toBe('');
  });

  it('reads the Mac minimum', () => {
    expect(macMinimumVerdict('12.1')).toBe('ok');
    expect(macMinimumVerdict('13.0')).toBe('unexpected');
    expect(macMinimumVerdict('10.15')).toBe('fallback');
    expect(macMinimumVerdict('')).toBe('fallback');
  });

  it('reads plutil’s booleans both ways', () => {
    expect(isSandboxed('"com.apple.security.app-sandbox" => 1')).toBe(true);
    expect(isSandboxed('"com.apple.security.app-sandbox" => false')).toBe(false);
  });

  it('takes the first group after application-groups', () => {
    expect(appGroupLine(ENTS_P(true))).toBe(`    0 => "${GROUP}"`);
    expect(appGroupLine('{}')).toBe('');
  });

  it('reads the console lock from ioreg’s XML', () => {
    expect(consoleLocked('<key>IOConsoleLocked</key>\n\t\t<true/>')).toBe(true);
    expect(consoleLocked('<key>IOConsoleLocked</key><false/>')).toBe(false);
    expect(consoleLocked('')).toBe(false);
  });

  it('reads the notary verdict and submission id', () => {
    expect(notaryAccepted('  status: Accepted')).toBe(true);
    expect(submissionId('Conducting…\n  id: 1a2b-3c4d \n  status: Invalid')).toBe('1a2b-3c4d');
  });

  it('wants both halves from Gatekeeper', () => {
    expect(gatekeeperAccepts('x: accepted\nsource=Developer ID')).toBe(false);
    expect(gatekeeperAccepts('x: accepted\nsource=Notarized Developer ID')).toBe(true);
  });

  it('matches dump paths with the record id after them — no $ anchor', () => {
    const dump = 'path:  /Users/h/x/Mihrab.app (0x42c4)\npath:  /Applications/Mihrab.app (0x1)\n';
    expect(ghostApps(dump)).toEqual(['/Users/h/x/Mihrab.app']);
    expect(ghostPaths(`${dump}path:  /Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex (0x2)\n`)).toEqual([
      '/Users/h/x/Mihrab.app',
    ]);
  });

  it('reads the group from the entitlements and wraps a certificate as PEM', () => {
    expect(groupNameFrom(`<array>\n\t<string>${GROUP}</string>\n</array>`)).toBe(GROUP);
    expect(pemFromBase64('A'.repeat(70))).toBe(`-----BEGIN CERTIFICATE-----\n${'A'.repeat(64)}\nAAAAAA\n-----END CERTIFICATE-----\n`);
  });
});
