/**
 * Archive Mihrab for iOS and send it to App Store Connect, from this Mac —
 * the port of scripts/build-ios-appstore.sh (A1–A11 in the inventory).
 *
 *   ios-appstore               archive, export, validate, upload
 *   ios-appstore --no-upload   stop after validate
 *   SKIP_PODS=1, SKIP_ARCHIVE=1 as before
 *
 * WHY IT EXISTS, WHEN XCODE CLOUD ALREADY DOES IT: because Xcode Cloud is
 * one service on one company's weather. On 2026-09-11 `POST
 * /v1/ciBuildRuns` answered HTTP 500 three times running, and a release
 * that can only go out through someone else's CI is a release you do not
 * control. It produced 2.18.5 (269) while Xcode Cloud refused everything.
 *
 * WHAT IT CANNOT DO: a local archive exports against profiles already on
 * this Mac; a clean-checkout cloud build does not — which is why builds
 * 520–522 archived green here and died at export in the cloud. Green here
 * is not evidence that Xcode Cloud would be green. The entitlement gate
 * below is the closest it can get.
 */
import type { Ctx } from './common.ts';
import { TEAM, env, flag, irreversible, pbxBuild, pbxMarketingVersion } from './common.ts';
import { findIdentity } from './toolchain.ts';
import type { ExecOptions } from './io.ts';
import { Asc } from './asc.ts';
import { shipped } from './xcodeCloud.ts';

const WORKSPACE = 'ios/PrayerApp.xcworkspace';
const SCHEME = 'PrayerApp';

/**
 * `claims <bundle> <key>`: an entitlement's value as JSON, or '' when the
 * bundle does not claim it (absent, empty list, false, empty string).
 *
 * NOT `plutil -extract`: it reads its argument as a KEY PATH and splits it
 * on dots, so `com.apple.security.application-groups` came back empty for
 * everything — including a widget carrying its App Group perfectly well
 * (caught on the first real run, 2026-09-11). The entitlements are read
 * as JSON and the key looked up whole.
 */
export function claimFrom(entitlementsJson: string, key: string): string {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(entitlementsJson);
  } catch {
    return '';
  }
  const v = d[key];
  if (v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length)) return '';
  return JSON.stringify(v);
}

/**
 * A Swift class's runtime name: `_TtC<len><module><len><class>`. The iOS
 * 27 gate greps the binary for it, so a scene delegate Info.plist names
 * but the binary does not contain is caught.
 */
export function swiftRuntimeName(delegate: string): string {
  const dot = delegate.indexOf('.');
  const module = delegate.slice(0, dot);
  const cls = delegate.slice(dot + 1);
  return `_TtC${module.length}${module}${cls.length}${cls}`;
}

/** The appex rules, as the shell's `case "$name"`: problems, and what it says. */
export function appexVerdict(
  name: string,
  groups: string,
  keychain: string,
): { ok: boolean; lines: string[] } {
  if (name === 'MihrabLiveActivity') {
    if (groups || keychain) {
      return {
        ok: false,
        lines: [
          `${name} claims entitlements it must not:`,
          ...(groups ? [`    app groups: ${groups}`] : []),
          ...(keychain ? [`    keychain:   ${keychain}`] : []),
          '  This is the builds 520-522 failure, caught before export.',
          '  A Live Activity reads no shared storage. Empty its',
          '  entitlements file (ios/MihrabLiveActivity/) rather than',
          '  granting the App ID a capability it does not need —',
          '  App Groups cannot be attached through the API at all.',
        ],
      };
    }
    return { ok: true, lines: [`  ${name} claims nothing — correct.`] };
  }
  if (name === 'PrayerWidgetExtension') {
    return groups
      ? { ok: true, lines: [`  ${name} carries its App Group — correct.`] }
      : { ok: false, lines: [`${name} has LOST its App Group; its widgets will draw empty.`] };
  }
  return { ok: true, lines: [`  ${name}: unrecognised extension, entitlements not asserted.`] };
}

export const EXPORT_OPTIONS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
`;

export async function buildIosAppStore(ctx: Ctx, args: string[]): Promise<number> {
  const root = ctx.root;
  const abs = (p: string) => (p.startsWith('/') ? p : `${root}/${p}`);
  const say = (l: string) => ctx.report.say(`▸ ${l}`);
  const warn = (l: string) => ctx.report.sayErr(`⚠ ${l}`);
  const die = (id: string, text: string): never => {
    ctx.report.sayErr(`✗ ${text}`);
    return ctx.report.halt(id, text.split('\n')[0]);
  };
  const run = (cmd: string, a: string[], o: ExecOptions = {}) => ctx.io.exec.run(cmd, a, { cwd: root, ...o });
  const upload = args[0] !== '--no-upload';

  // ── A1 ──
  const identity = await findIdentity(ctx, 'Apple Distribution');
  if (!identity) {
    die('A1', `No 'Apple Distribution' identity in the login keychain.

  App Store Connect will not take an archive signed with the Development
  or Developer ID certificate — those are for your own devices and for
  the Homebrew channel. Create the distribution certificate:

      Xcode → Settings → Accounts → <your Apple ID> → the team
            → Manage Certificates… → + → Apple Distribution

  or, the manual way, generate a CSR and upload it at
  developer.apple.com/account → Certificates → + → Apple Distribution,
  then import the issued .cer together with its private key.

  Note that a .cer downloaded from the portal is only the public half:
  without the matching private key in this keychain it is not an
  identity and this check will keep failing.`);
  }
  say(`Signing identity: ${identity}`);

  // ── A2 ──
  const ascPath = `${ctx.home}/.config/mihrab/asc.json`;
  if (!ctx.io.fs.exists(ascPath)) {
    die('A2', `No App Store Connect API key config at ${ascPath}.
  It needs {"keyId": …, "issuerId": …, "keyPath": …} — the same
  credentials scripts/xcode-cloud.py and the notarization step use.`);
  }
  const asc = JSON.parse(ctx.io.fs.readText(ascPath)) as Record<string, string>;
  const keyId = asc.keyId;
  const issuer = asc.issuerId;
  const keyPath = asc.keyPath?.startsWith('~/') ? `${ctx.home}${asc.keyPath.slice(1)}` : asc.keyPath;
  if (!keyPath || !ctx.io.fs.exists(keyPath)) {
    die('A2', `The API key file ${keyPath} named by ${ascPath} is not there.`);
  }

  // ── A3 ── altool does not take a path to the key. It looks for
  // AuthKey_<id>.p8 in ./private_keys, ~/private_keys, ~/.private_keys and
  // ~/.appstoreconnect/private_keys, and says only "could not find the API
  // key" when it is anywhere else. So put a link where it looks rather than
  // copying the secret about.
  const keyDir = `${ctx.home}/.appstoreconnect/private_keys`;
  const keyLink = `${keyDir}/AuthKey_${keyId}.p8`;
  if (!ctx.io.fs.exists(keyLink)) {
    ctx.io.fs.mkdir(keyDir);
    await run('chmod', ['700', keyDir]);
    ctx.io.fs.symlink(keyPath, keyLink);
    say(`Linked the API key where altool looks: ${keyLink}`);
  }

  // ── A4 ──
  const pbx = ctx.io.fs.readText(abs('ios/PrayerApp.xcodeproj/project.pbxproj'));
  const version = pbxMarketingVersion(pbx);
  const build = pbxBuild(pbx);
  if (!version || !build) die('A4', 'Could not read MARKETING_VERSION / CURRENT_PROJECT_VERSION from the pbxproj.');
  say(`Mihrab ${version} (${build})`);

  // ── A5 ── A version that has already gone live cannot take another
  // build, and the refusal arrives at the END — after the archive, the
  // export and the upload have all succeeded. This turns twenty-five
  // wasted minutes into one question asked up front.
  let live = false;
  try {
    live =
      (await shipped({ asc: new Asc(ctx.io, ctx.home), io: ctx.io, root, say: () => undefined }, version)) === 0;
  } catch {
    live = false;
  }
  if (live) {
    warn(`${version} has already reached App Store Connect.`);
    warn('App Store Connect refuses further builds for a version that is live:');
    warn('the archive and export will both succeed and the upload will fail.');
    warn('Bump the version first (docs/DISTRIBUTION.md, "Version bumps") unless this is a TestFlight-only build.');
    if ((await ctx.io.ask('   Continue anyway? [y/N] ')) !== 'y') return ctx.report.halt('A5', 'not continuing');
  }

  const archive = `ios/build/appstore/Mihrab-${version}.xcarchive`;
  const exportDir = `ios/build/appstore/export-${version}`;
  ctx.io.fs.mkdir(abs('ios/build/appstore'));
  ctx.io.fs.rm(abs(exportDir));
  if (!flag(ctx, 'SKIP_ARCHIVE')) ctx.io.fs.rm(abs(archive));

  // Xcode signs in with an Apple ID; xcodebuild on its own does not have
  // one. Without these, `-allowProvisioningUpdates` has no credentials to
  // create App Store profiles with and the export dies on "No Accounts" —
  // which reads as a project misconfiguration and is authentication.
  const auth = [
    '-authenticationKeyPath', keyPath,
    '-authenticationKeyID', keyId,
    '-authenticationKeyIssuerID', issuer,
  ];

  // ── A6 ── build-catalyst regenerates the Pods project with Catalyst on,
  // which breaks the plain iOS device archive; put it back rather than assume.
  if (env(ctx, 'SKIP_PODS') !== '1') {
    say('pod install (plain iOS — undoing any Catalyst pod state)…');
    if ((await run('pod', ['install', '--silent'], { cwd: abs('ios'), stream: true })).code !== 0) {
      die('A6', 'pod install failed.');
    }
  }

  // ── A7 ──
  if (flag(ctx, 'SKIP_ARCHIVE') && ctx.io.fs.isDir(abs(archive))) {
    say(`SKIP_ARCHIVE=1 — reusing ${archive}`);
  } else {
    say('Archiving for generic/platform=iOS (Release)…');
    const r = await run('xcodebuild', [
      'archive',
      '-workspace', WORKSPACE,
      '-scheme', SCHEME,
      '-configuration', 'Release',
      '-destination', 'generic/platform=iOS',
      '-archivePath', archive,
      '-allowProvisioningUpdates',
      ...auth,
      `DEVELOPMENT_TEAM=${TEAM}`,
      '-quiet',
    ], { stream: true });
    if (r.code !== 0) die('A7', `xcodebuild archive failed (exit ${r.code}).`);
  }
  if (!ctx.io.fs.isDir(abs(archive))) {
    die('A7', `No archive at ${archive} — xcodebuild reported success and produced nothing.`);
  }

  // ── A8 — THE GATE THAT BUILDS 520–522 NEEDED ──
  //
  // Every entitlement an appex claims has to be authorised by a profile,
  // and automatic signing will neither create an App ID nor add a
  // capability to one — so a copied entitlements file ARCHIVES FINE and
  // fails at export. `Widgets phase 0` copied the widget's entitlements,
  // App Group and all, onto the Live Activity, which reads no shared
  // storage. Read off the signed bundle, not the source file.
  const apps = ctx.io.fs.list(abs(`${archive}/Products/Applications`)).filter(f => f.endsWith('.app'));
  if (!apps.length) die('A8', 'No .app inside the archive.');
  const appBundle = `${archive}/Products/Applications/${apps[0]}`;
  const claims = async (bundle: string, key: string) => {
    const xml = (await run('codesign', ['-d', '--entitlements', ':-', bundle])).stdout;
    const json = (await run('plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml })).stdout;
    return claimFrom(json, key);
  };
  let failed = false;
  for (const f of ctx.io.fs.list(abs(`${appBundle}/PlugIns`)).filter(n => n.endsWith('.appex')).sort()) {
    const appex = `${appBundle}/PlugIns/${f}`;
    if (!ctx.io.fs.isDir(abs(appex))) continue;
    const name = f.replace(/\.appex$/, '');
    const v = appexVerdict(
      name,
      await claims(appex, 'com.apple.security.application-groups'),
      await claims(appex, 'keychain-access-groups'),
    );
    for (const l of v.lines) (v.ok ? say : warn)(l);
    if (!v.ok) failed = true;
  }
  if (failed) die('A8', 'Entitlement check failed — not exporting. See above.');
  // The app itself last: its two entitlements are what the sync identity
  // and every widget payload depend on — the macOS 2.11.0 failure.
  if (!(await claims(appBundle, 'com.apple.security.application-groups'))) {
    die('A8', 'The app has no App Group: widgets would draw empty.');
  }
  if (!(await claims(appBundle, 'keychain-access-groups'))) {
    die('A8', 'The app has no keychain access group: it would generate a new sync identity on install.');
  }
  say('  Mihrab.app carries its App Group and keychain group — correct.');

  // ── A9 — THE GATE 2.22.0 TO 2.27.1 NEEDED ──
  //
  // From the iOS 27 SDK on, an app with no scene life cycle does not
  // LAUNCH on iOS 27 — "UIScene life cycle is required for apps built with
  // this SDK" — while it archives, exports, validates, uploads and runs on
  // every older iOS without a word. App Review found it on 2.27.1
  // (2026-09-28), after 2.27.0 had gone live to people who then could not
  // open it. Read from the ARCHIVED bundle: the manifest, the delegate it
  // names with the module substituted, and that class in the binary.
  const plist = `${appBundle}/Info.plist`;
  const buddy = async (entry: string) =>
    (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${entry}`, plist])).stdout.trim();
  const delegate = await buddy(
    'UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName',
  );
  if (!delegate) {
    die(
      'A9',
      'The app declares no scene (UIApplicationSceneManifest) — built with the iOS 27 SDK it will not launch on iOS 27. See AppDelegate.swift.',
    );
  }
  if (delegate.includes('$(')) die('A9', `The scene delegate name was not substituted: ${delegate}`);
  const runtimeName = swiftRuntimeName(delegate);
  const exe = await buddy('CFBundleExecutable');
  if (!ctx.io.fs.readBinary(abs(`${appBundle}/${exe}`)).includes(runtimeName)) {
    die('A9', `Info.plist names ${delegate} as the scene delegate, but the binary has no such class (${runtimeName}).`);
  }
  say(`  Mihrab.app has its scene (${delegate}) — it will launch on iOS 27.`);

  // ── A10 ──
  ctx.io.fs.writeText(abs('ios/build/appstore/ExportOptions.plist'), EXPORT_OPTIONS);
  say('Exporting a signed .ipa…');
  const exported = await run('xcodebuild', [
    '-exportArchive',
    '-archivePath', archive,
    '-exportPath', exportDir,
    '-exportOptionsPlist', 'ios/build/appstore/ExportOptions.plist',
    '-allowProvisioningUpdates',
    ...auth,
    '-quiet',
  ], { stream: true });
  if (exported.code !== 0) {
    die('A10', `Export failed.

  The one-line summary above is rarely the real message. The export
  log is the file to read:
      ${exportDir}/../DistributionSummary.plist
      ~/Library/Logs/gym  (if present)
  and for the profile/entitlement class of failure, the text to look
  for is 'Automatic signing cannot register bundle identifier' or
  'provisioning profile … doesn't include the entitlement'.`);
  }
  const ipas = ctx.io.fs.list(abs(exportDir)).filter(f => f.endsWith('.ipa'));
  if (!ipas.length) die('A10', `Export reported success but produced no .ipa in ${exportDir}.`);
  const ipa = `${exportDir}/${ipas[0]}`;
  const mb = `${Math.round(ctx.io.fs.size(abs(ipa)) / 1e6)}M`;
  say(`Exported ${ipas[0]} (${mb})`);

  // ── A11 ── Validation asks App Store Connect the same questions the
  // upload will, in seconds rather than after the bytes have gone: a
  // duplicate build number, a closed version train, a missing icon.
  const altool = (verb: string) =>
    run('xcrun', ['altool', verb, '-f', ipa, '-t', 'ios', '--apiKey', keyId, '--apiIssuer', issuer]);
  const errorLines = (log: string) =>
    log.split('\n').filter(l => /error|message/i.test(l)).slice(0, 10);
  say('Validating with App Store Connect…');
  const validated = await altool('--validate-app');
  // The shell `tee`d both answers: shown as they come, and kept.
  for (const l of (validated.stdout + validated.stderr).split('\n').filter(Boolean)) ctx.report.say(l);
  ctx.io.fs.writeText('/tmp/mihrab-validate.log', validated.stdout + validated.stderr);
  if (validated.code !== 0) {
    warn('Validation failed. The full response is in /tmp/mihrab-validate.log.');
    for (const l of errorLines(validated.stdout + validated.stderr)) ctx.report.sayErr(l);
    die('A11', 'Not uploading a build App Store Connect has already refused.');
  }
  say('Validation passed.');
  if (!upload) {
    say(`--no-upload: stopping here. The signed build is at ${ipa}`);
    return 0;
  }
  say(`Uploading… (this is the slow part; the .ipa is ${mb})`);
  const uploaded = await irreversible(
    ctx,
    `upload ${ipa} to App Store Connect`,
    () => altool('--upload-app'),
    { code: 0, stdout: '', stderr: '' },
  );
  if (!ctx.dryRun) ctx.io.fs.writeText('/tmp/mihrab-upload.log', uploaded.stdout + uploaded.stderr);
  for (const l of (uploaded.stdout + uploaded.stderr).split('\n').filter(Boolean)) ctx.report.say(l);
  if (uploaded.code !== 0) {
    warn('Upload failed. The full response is in /tmp/mihrab-upload.log.');
    for (const l of errorLines(uploaded.stdout + uploaded.stderr)) ctx.report.sayErr(l);
    die('A11', `The archive is fine and is still at ${ipa} — retry the upload alone:
      xcrun altool --upload-app -f '${ipa}' -t ios --apiKey ${keyId} --apiIssuer ${issuer}`);
  }
  ctx.report.say(`
✓ Mihrab ${version} (${build}) uploaded to App Store Connect.

  Processing takes a few minutes before the build appears in TestFlight.
  Nothing is submitted for review by this script — that stays a decision
  a person makes in App Store Connect.

  Worth remembering: this was signed against profiles already on this
  Mac. It is a real build and a real upload, and it is still not proof
  that a clean-checkout Xcode Cloud run would be green.`);
  return 0;
}
