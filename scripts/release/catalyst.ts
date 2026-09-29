/**
 * Build the Mac Catalyst .app and zip it for the GitHub release and
 * Homebrew — the port of scripts/build-catalyst.sh (ids C1–C15 in the
 * inventory). Output: ios/build/catalyst-dist/Mihrab-macOS-<version>.zip
 * and its .sha256.
 *
 * ── AD-HOC IS NOT "THE SAME BUILD WITHOUT NOTARIZATION" ───────────────
 *
 * An ad-hoc signature carries no team identifier, and codesign will not
 * apply entitlements without one: no App Group (where the widget payload
 * lives), no widget host, no Keychain — so 2.11.0 shipped with no widgets
 * and silently generated a NEW sync identity, orphaning the old device's
 * file in everyone's shared folder. The gate that would have caught it
 * was written `if [ "$SIGN_IDENTITY" != "-" ]` and switched itself off in
 * exactly the case that needed it. So the identity is found
 * automatically, an ad-hoc build has to be asked for by name
 * (SIGN_IDENTITY=-), and the entitlements are asserted on the built
 * bundle rather than inferred from what we meant to sign with.
 *
 * Relative paths on purpose: the shell ran from the repo root with
 * `APP=ios/build/catalyst-dist/Mihrab.app`, and the `pgrep`/`pkill`
 * patterns match the running process's path by that substring. Every
 * command here runs with the root as its working directory.
 */
import type { Ctx } from './common.ts';
import {
  INSTALLED_APP,
  INSTALLED_EXT,
  LSREGISTER,
  WIDGET_EXT_ID,
  codesignDetails,
  codesignEntitlements,
  env,
  flag,
  irreversible,
  pbxMarketingVersion,
  unregisterAndRemove,
} from './common.ts';
import type { ExecOptions } from './io.ts';
import { ReleaseStop } from './report.ts';
import { findIdentity, resolveCatalystToolchain } from './toolchain.ts';

export const DIST = 'ios/build/catalyst-dist';
export const APP = `${DIST}/Mihrab.app`;
export const BUILT = 'ios/build/catalyst-release/Build/Products/Release-maccatalyst/PrayerApp.app';
export const PROFILE = 'ios/PrayerApp/embedded.provisionprofile';
export const EXPECTED_MAC_MIN = '12.1';

/** C7: what the product's LSMinimumSystemVersion means. */
export function macMinimumVerdict(min: string): 'fallback' | 'unexpected' | 'ok' {
  // Below 12 is the 10.15 fallback. The shell compared with `-lt` behind
  // `2>/dev/null`, so a value that is not a number fell through to the
  // "not the documented one" warning; that is kept.
  if (!min) return 'fallback';
  const major = Number(min.split('.')[0]);
  if (!Number.isNaN(major) && major < 12) return 'fallback';
  return min === EXPECTED_MAC_MIN ? 'ok' : 'unexpected';
}

/** C8: `plutil -p` renders booleans as `true`, older versions as `1`. */
export const isSandboxed = (plutilP: string) =>
  /"com\.apple\.security\.app-sandbox" => (true|1)/.test(plutilP);

/**
 * C8: the shell's `grep -A2 'application-groups' | grep '=> "' | head -1`
 * over `plutil -p` output — the first group the entitlements name.
 */
export function appGroupLine(plutilP: string): string {
  const lines = plutilP.split('\n');
  const picked = new Set<number>();
  lines.forEach((l, i) => {
    if (l.includes('application-groups')) for (let j = i; j <= i + 2 && j < lines.length; j++) picked.add(j);
  });
  for (const i of [...picked].sort((a, b) => a - b)) if (lines[i].includes('=> "')) return lines[i];
  return '';
}

/**
 * C9: IS ANYONE AT THE MAC? `ioreg -n Root -d1 -a` as XML; locked when
 * the value after `<key>IOConsoleLocked</key>` is `<true/>`.
 */
export function consoleLocked(ioreg: string): boolean {
  const key = '<key>IOConsoleLocked</key>';
  const at = ioreg.indexOf(key);
  if (at < 0) return false;
  return ioreg.slice(at + key.length).trimStart().startsWith('<true/>');
}

/** C12: `--wait` exits 0 on Invalid as well as Accepted, so read the verdict. */
export const notaryAccepted = (log: string) => log.includes('status: Accepted');
export function submissionId(log: string): string {
  return /^ *id: ([0-9a-f-]*) *$/m.exec(log)?.[1] ?? '';
}

/**
 * C13: both halves. "accepted" alone can come from a Developer ID that is
 * merely trusted locally; the source line is what says a notarised ticket
 * was the reason.
 */
export const gatekeeperAccepts = (assess: string) =>
  assess.includes('accepted') && assess.includes('source=Notarized Developer ID');

/**
 * C15: every registered `.app` of this app outside /Applications, from
 * `lsregister -dump`. NO `$` ANCHOR ON THE PATH: the dump writes
 * `path:  /Applications/Mihrab.app (0x42c4)` — a trailing record id — so a
 * pattern ending in `\.app$` matched nothing and the sweep silently did
 * nothing, with two ghosts still in the database. Without the anchor an
 * `.appex` line matches up to its parent `.app`, which is the path to
 * unregister anyway.
 */
export function ghostApps(dump: string): string[] {
  const out = new Set<string>();
  for (const m of dump.matchAll(/^path: +(\/[^ \n]*(?:PrayerApp|Mihrab)\.app)/gm)) {
    if (m[1] !== INSTALLED_APP) out.add(m[1]);
  }
  return [...out].sort();
}

/** C15: what the final check calls a ghost — `.appex` included, anything under /Applications/Mihrab.app not. */
export function ghostPaths(dump: string): string[] {
  const out = new Set<string>();
  for (const m of dump.matchAll(
    /^path: +(\/[^ \n]*(?:PrayerApp\.app|Mihrab\.app|PrayerWidgetExtension\.appex)[^ \n]*)/gm,
  )) {
    if (!m[1].startsWith(INSTALLED_APP)) out.add(m[1]);
  }
  return [...out].sort();
}

/** The App Group named in Catalyst.entitlements (the shell's sed). */
export function groupNameFrom(entitlements: string): string {
  for (const line of entitlements.split('\n')) {
    const hit = /<string>(.*group.*)<\/string>/.exec(line);
    if (hit) return hit[1];
  }
  return '';
}

/** Today, as `date +%Y-%m-%d` prints it: the Mac's local date. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** DER certificates as PEM, so `openssl` can read one from stdin as text. */
export function pemFromBase64(b64: string): string {
  const body = b64.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

export async function buildCatalyst(ctx: Ctx, args: string[]): Promise<number> {
  const say = (l: string) => ctx.report.say(l);
  const err = (l: string) => ctx.report.sayErr(l);
  const fail = (id: string, ...lines: string[]): never => {
    for (const l of lines) err(l);
    return ctx.report.halt(id, lines[0] ?? id);
  };
  const root = ctx.root;
  const abs = (p: string) => (p.startsWith('/') ? p : `${root}/${p}`);

  // ── C1 ──
  // `--check-toolchain` answers "would this build even start?" and exits.
  // release.sh asks in PREFLIGHT, so a missing toolchain costs a second
  // rather than being found after the Android build, as 2.22.0 found it.
  const tool = await resolveCatalystToolchain(ctx);
  if (args[0] === '--check-toolchain') {
    for (const l of tool.lines) (tool.ok ? say : err)(l);
    return tool.ok ? 0 : 1;
  }
  if (!tool.ok) fail('C1', ...tool.lines);
  say(tool.lines[0]);
  const devEnv = tool.developerDir ? { DEVELOPER_DIR: tool.developerDir } : {};
  const run = (cmd: string, a: string[], o: ExecOptions = {}) =>
    ctx.io.exec.run(cmd, a, { cwd: root, ...o, env: { ...devEnv, ...(o.env ?? {}) } });
  const must = async (id: string, what: string, cmd: string, a: string[], o: ExecOptions = {}) => {
    const r = await run(cmd, a, o);
    // `set -e` in the shell: a failing command ended the build. It said
    // nothing; this names the step.
    if (r.code !== 0) fail(id, `✗ ${what} failed (exit ${r.code}).`, ...(r.stderr ? [r.stderr.trim()] : []));
    return r;
  };

  // ── C2 ── Default to whatever Developer ID this Mac holds, rather than to
  // ad hoc. Naming one explicitly still wins; `SIGN_IDENTITY=-` is the
  // deliberate opt-out and says so out loud.
  let identity = env(ctx, 'SIGN_IDENTITY');
  if (!identity) {
    identity = await findIdentity(ctx, 'Developer ID Application');
    if (!identity) {
      fail(
        'C2',
        "✗ No 'Developer ID Application' identity in the keychain.",
        '  A Catalyst build without one gets no team id, so codesign',
        '  drops the entitlements: no App Group, no widgets, and a new',
        '  sync identity every install. That is what shipped as 2.11.0.',
        '  Unlock the login keychain, or ask for it deliberately:',
        '      SIGN_IDENTITY=- ./scripts/build-catalyst.sh   # local only',
      );
    }
    say(`▸ Signing identity found: ${identity}`);
  }
  const adhoc = identity === '-';
  if (adhoc) {
    err('⚠ AD-HOC BUILD. No entitlements, no App Group, no widgets.');
    err('  Runs locally past Gatekeeper; MUST NOT be published.');
  }

  const version = pbxMarketingVersion(ctx.io.fs.readText(abs('ios/PrayerApp.xcodeproj/project.pbxproj')));
  const zip = `${DIST}/Mihrab-macOS-${version}.zip`;

  // ── C3 ── Catalyst pod settings are opt-in: enabling them globally broke
  // the plain iOS device archive on Xcode Cloud (hermes-engine framework
  // layout). This install also builds React from source (codesign refuses
  // the prebuilt React.framework in a Mac bundle), which rewrites
  // Podfile.lock — so the lock is put back however this ends: release.sh
  // refuses to start on a tree with tracked changes. `finally` covers a
  // stop and a throw; a Ctrl-C or a `kill` skips it, which the shell's
  // `trap … EXIT` never did, so the interrupt is asked to restore it too.
  say('▸ Preparing pods with Catalyst support (MIHRAB_CATALYST=1)…');
  const lock = abs('ios/Podfile.lock');
  const lockKept = ctx.io.fs.exists(lock) ? ctx.io.fs.readText(lock) : undefined;
  const restoreLock = () => {
    if (lockKept !== undefined) ctx.io.fs.writeText(lock, lockKept);
  };
  const stopListening = ctx.io.onInterrupt(restoreLock);
  try {
    await must('C3', 'pod install', 'pod', ['install', '--silent'], {
      cwd: abs('ios'),
      env: { MIHRAB_CATALYST: '1' },
      stream: true,
    });
    return await afterPods();
  } finally {
    stopListening();
    restoreLock();
  }

  async function afterPods(): Promise<number> {
    // ── C4 ── Build UNSIGNED (a global signing override would also apply to
    // the widget target and trip its provisioning check), then sign the
    // copied bundle below.
    say(`▸ Building Mihrab ${version} for Mac Catalyst (Release)…`);
    await must('C4', 'xcodebuild', 'xcodebuild', [
      '-workspace', 'ios/PrayerApp.xcworkspace',
      '-scheme', 'PrayerApp',
      '-configuration', 'Release',
      '-destination', 'platform=macOS,variant=Mac Catalyst,arch=arm64',
      '-derivedDataPath', 'ios/build/catalyst-release',
      'CODE_SIGNING_ALLOWED=NO',
      '-quiet', 'build',
    ], { stream: true });
    ctx.io.fs.rm(abs(DIST));
    ctx.io.fs.mkdir(abs(DIST));
    // ditto (not cp -R): preserves the framework symlink structure — cp
    // mangles it and codesign then rejects the bundle as "ambiguous".
    await must('C4', 'ditto', 'ditto', [BUILT, APP]);

    // ── C5 / C6 — SIGNING ──
    say(`▸ Signing (${identity})…`);
    // Hardened runtime ONLY with a real identity: its library validation
    // requires all frameworks to share the app's Team ID, which ad-hoc
    // signatures lack — the app then dies at launch on "Library not loaded:
    // hermesvm" (2026-07-16). Notarisation needs it, so Developer ID keeps it.
    const runtime = adhoc ? [] : ['--options', 'runtime'];
    // The extension gets its OWN entitlements, not the app's: macOS will
    // not host an unsandboxed app extension, and the app must not be
    // sandboxed.
    const extEnts = adhoc ? [] : ['--entitlements', 'ios/PrayerWidgetExtension/CatalystExtension.entitlements'];
    let appEnts: string[] = [];
    if (!adhoc) {
      if (ctx.io.fs.isFile(abs(PROFILE))) {
        // ── C5 — THE PROFILE HAS TO NAME THE CERTIFICATE WE SIGN WITH ──
        //
        // A Developer ID provisioning profile is what lets this build have a
        // Keychain at all: keychain-access-groups is restricted, and macOS
        // SIGKILLs an app that claims it without a profile. And AMFI checks
        // that the signing certificate is one of the profile's
        // DeveloperCertificates — SIGKILL before main(), exit 137, nothing
        // in the log — while codesign and the notary service both pass the
        // bundle. Xcode leaves a DEVELOPMENT Catalyst profile lying in
        // ~/Library/Developer/Xcode/UserData; reaching for it and signing
        // with Developer ID looks exactly right and cannot work.
        const decoded = (await run('security', ['cms', '-D', '-i', PROFILE])).stdout;
        const readable = (await run('plutil', ['-p', '-'], { input: decoded })).stdout;
        if (!decoded || !readable.trim()) fail('C5', `  ✗ ${PROFILE} is not a readable provisioning profile.`);
        const certsXml = (
          await run('plutil', ['-extract', 'DeveloperCertificates', 'xml1', '-o', '-', '-'], { input: decoded })
        ).stdout;
        const profileCerts = (certsXml.match(/<data>/g) ?? []).length;
        if (!(await profileHasSigner(decoded, identity))) {
          fail(
            'C5',
            '  ✗ the profile does not carry the certificate being signed with.',
            `      signing as: ${identity}`,
            `      profile holds ${profileCerts} certificate(s), none of them that one.`,
            '    AMFI will SIGKILL the app before main() and say nothing.',
            '    A Developer ID build needs a Developer ID profile: portal →',
            '    Profiles → + → Developer ID → maccatalyst.com.hassan.prayerapp.',
            "    Xcode's own Mac Catalyst profile is a DEVELOPMENT one and only",
            '    works with the Apple Development identity.',
          );
        }
        say(`▸ Embedding ${PROFILE} — this build gets a Keychain.`);
        // BEFORE codesign: it seals the profile, and one added afterwards
        // invalidates the signature.
        ctx.io.fs.copy(abs(PROFILE), abs(`${APP}/Contents/embedded.provisionprofile`));
        appEnts = ['--entitlements', 'ios/PrayerApp/Catalyst-keychain.entitlements'];
      } else {
        say(`▸ No ${PROFILE} — signing without a Keychain group.`);
        say('  The journal, the fasting log and the sync identity will use the');
        say('  plaintext fallback in src/storage/durableWrite.ts. See the');
        say('  comment above PROFILE for how to fix that properly.');
        appEnts = ['--entitlements', 'ios/PrayerApp/Catalyst.entitlements'];
      }
    }
    // hermesvm.framework ships with a proper Versions/ tree PLUS a stray real
    // binary at the framework root — codesign then cannot classify the bundle
    // ("ambiguous"). Replace the stray copy with the canonical symlink.
    const hermes = abs(`${APP}/Contents/Frameworks/hermesvm.framework`);
    if (
      ctx.io.fs.isFile(`${hermes}/hermesvm`) &&
      !ctx.io.fs.isSymlink(`${hermes}/hermesvm`) &&
      ctx.io.fs.isDir(`${hermes}/Versions`)
    ) {
      ctx.io.fs.rm(`${hermes}/hermesvm`);
      ctx.io.fs.symlink('Versions/Current/hermesvm', `${hermes}/hermesvm`);
    }
    const frameworksIn = (dir: string) =>
      ctx.io.fs
        .list(abs(dir))
        .filter(f => f.endsWith('.framework') || f.endsWith('.dylib'))
        .map(f => `${dir}/${f}`);
    // Inside-out, always: frameworks, then each extension's frameworks and
    // the extension, then the app. Signing the app first fails outright —
    // "code object is not signed at all, in subcomponent …appex".
    for (const fw of frameworksIn(`${APP}/Contents/Frameworks`)) {
      await must('C6', `codesign ${fw}`, 'codesign', ['--force', ...runtime, '-s', identity, fw]);
    }
    for (const name of ctx.io.fs.list(abs(`${APP}/Contents/PlugIns`)).filter(f => f.endsWith('.appex'))) {
      const ext = `${APP}/Contents/PlugIns/${name}`;
      // An extension with no Frameworks directory made the shell's `find`
      // exit non-zero and, under `set -e` + `pipefail`, end the build
      // silently between the frameworks and the extension.
      if (ctx.io.fs.isDir(abs(`${ext}/Contents/Frameworks`))) {
        for (const efw of frameworksIn(`${ext}/Contents/Frameworks`)) {
          await must('C6', `codesign ${efw}`, 'codesign', ['--force', ...runtime, '-s', identity, efw]);
        }
      }
      say(`  ▸ signing extension: ${name}`);
      // The extension needs the App Group too — it is the side that READS
      // the payload. Entitle only one side and the widget renders empty.
      await must('C6', `codesign ${name}`, 'codesign', ['--force', ...runtime, ...extEnts, '-s', identity, ext]);
    }
    await must('C6', 'codesign Mihrab.app', 'codesign', ['--force', ...runtime, ...appEnts, '-s', identity, APP]);
    // Not `verify && echo`: an AND-list is exempt from `set -e`, and the
    // shell once skipped a signature that did not verify in silence. It
    // stops the build here, in both. `--deep` names the nested piece that
    // is wrong rather than only the app.
    const verified = await run('codesign', ['--verify', '--strict', '--deep', APP]);
    if (verified.code !== 0) {
      fail(
        'C6',
        `  ✗ codesign --verify --strict --deep rejects ${APP}:`,
        ...`${verified.stderr}${verified.stdout}`.trim().split('\n').map((l) => `    ${l}`),
      );
    }
    say(`▸ Signature verifies (${identity}).`);

    // ── C7 — THE MAC MINIMUM, READ OFF THE PRODUCT ──
    //
    // The configuration is held by catalystDeploymentTarget.test.ts, but
    // only the product says what Xcode derived from it: an iOS minimum
    // missing from the SDK's map falls back to macOS 10.15, which Xcode 27
    // refuses and an older Xcode would ship without a word.
    const plistMin = async (plist: string) =>
      (await run('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', '-o', '-', plist])).stdout.trim();
    const macMin = await plistMin(`${APP}/Contents/Info.plist`);
    const verdict = macMinimumVerdict(macMin);
    if (verdict === 'fallback') {
      fail(
        'C7',
        `✗ The Mac app's LSMinimumSystemVersion is '${macMin || 'missing'}': the`,
        '  macOS 10.15 fallback is back. Look for a target whose iOS minimum is',
        "  not in the SDK's iOS-to-Catalyst map (SDKSettings.json, iOSMac_macOS).",
      );
    }
    if (verdict === 'unexpected') {
      err(`⚠ The Mac app needs macOS ${macMin}, not the documented ${EXPECTED_MAC_MIN} —`);
      err('  update CHANGELOG, docs/DISTRIBUTION.md and this line if that is intended.');
    }
    const extMin = await plistMin(`${APP}/Contents/PlugIns/PrayerWidgetExtension.appex/Contents/Info.plist`);
    say(`▸ Mac minimum: macOS ${macMin} (widgets: macOS ${extMin || 'unknown'}).`);

    // ── C8 — THE ENTITLEMENTS THAT ACTUALLY GOT SEALED IN ──
    if (!adhoc) {
      say('▸ Checking the entitlements that actually got sealed in…');
      // A TEAM IDENTIFIER FIRST, because without one none of the rest can be
      // true: codesign drops every entitlement and still reports success.
      if ((await codesignDetails(ctx, APP)).includes('TeamIdentifier=not set')) {
        fail(
          'C8',
          '  ✗ no TeamIdentifier on the signed app.',
          '    Every entitlement below has been silently dropped: no App',
          '    Group, no widgets, and a new sync identity on every install.',
          '    The identity did not take — check the login keychain.',
        );
      }
      const plutilP = async (bundle: string) =>
        (await run('plutil', ['-p', '-'], { input: await codesignEntitlements(ctx, bundle) })).stdout;
      const extEntsP = await plutilP(`${APP}/Contents/PlugIns/PrayerWidgetExtension.appex`);
      const appEntsP = await plutilP(APP);
      if (!isSandboxed(extEntsP)) {
        fail(
          'C8',
          '  ✗ the widget extension is not sandboxed.',
          '    macOS will refuse to host it: chronod fails every timeline query',
          '    with "Extension must have com.apple.security.app-sandbox".',
        );
      }
      // The Keychain group, when a profile said it was allowed: otherwise a
      // silent downgrade to plaintext.
      if (ctx.io.fs.isFile(abs(PROFILE))) {
        if (!appEntsP.includes('keychain-access-groups')) {
          fail('C8', '  ✗ a profile was embedded but no Keychain group was sealed in.');
        }
        if (!ctx.io.fs.isFile(abs(`${APP}/Contents/embedded.provisionprofile`))) {
          fail('C8', '  ✗ the embedded profile is missing from the signed bundle.');
        }
        say('  ✓ Keychain group sealed in, profile embedded.');
      }
      const appGroup = appGroupLine(appEntsP);
      const extGroup = appGroupLine(extEntsP);
      if (!appGroup || appGroup !== extGroup) {
        fail(
          'C8',
          '  ✗ app and extension disagree about the App Group:',
          `      app: ${appGroup || '<none>'}`,
          `      ext: ${extGroup || '<none>'}`,
          '    The writer and the reader must name the same group or the',
          '    widget renders an empty card.',
        );
      }
      say(`  ▸ extension sandboxed; both sides share${appGroup.slice(appGroup.indexOf('=>') + 2)}`);
    }

    // FROM THE SMOKE LAUNCH ON, THIS COPY IS REGISTERED, and a stop after
    // it (the launch check, notarisation Invalid, a staple that never
    // came) used to exit with it still registered — which is what blanks
    // every widget on the release Mac. So the machine is handed back on
    // every way out from here, not only at the end.
    let handedBack = false;
    try {
      await smokeLaunch();

      // ── C11 ──
      say('▸ Zipping…');
      await must('C11', 'ditto -c', 'ditto', ['-c', '-k', '--keepParent', APP, zip]);

      await notarise();

      // ── C14 ──
      const sha = ctx.io.fs.sha256(abs(zip));
      const shaLine = `${sha}  ${zip}`;
      say(shaLine);
      ctx.io.fs.writeText(abs(`${zip}.sha256`), `${shaLine}\n`);

      handedBack = true;
      await handBackTheMachine(true);
    } finally {
      if (!handedBack) {
        // The stop that brought us here is the one to report; a ghost the
        // hand-back cannot clear has already said so on stderr.
        try {
          await handBackTheMachine(false);
        } catch (e) {
          if (!(e instanceof ReleaseStop)) throw e;
        }
      }
    }
    say(`▸ Done: ${zip}`);
    return 0;
  }

  async function profileHasSigner(decodedProfile: string, ident: string): Promise<boolean> {
    // Walks the profile's DeveloperCertificates and compares common names.
    const dir = ctx.io.fs.mkdtemp('mihrab-profile-');
    try {
      ctx.io.fs.writeText(`${dir}/p.plist`, decodedProfile);
      const count = Number(
        (await run('plutil', ['-extract', 'DeveloperCertificates', 'raw', '-o', '-', `${dir}/p.plist`])).stdout.trim(),
      ) || 0;
      for (let i = 0; i < count; i++) {
        const b64 = (
          await run('plutil', ['-extract', `DeveloperCertificates.${i}`, 'raw', '-o', '-', `${dir}/p.plist`])
        ).stdout;
        if (!b64.trim()) continue;
        const subject = (
          await run('openssl', ['x509', '-inform', 'PEM', '-noout', '-subject'], { input: pemFromBase64(b64) })
        ).stdout;
        if (subject.includes(ident)) return true;
      }
      return false;
    } finally {
      ctx.io.fs.rm(dir);
    }
  }

  // ── C9 / C10 — A SIGNATURE THAT VERIFIES IS NOT A BUNDLE THAT RUNS ──
  //
  // Restricted entitlements need a profile to back them; without one AMFI
  // SIGKILLs the process before main() while `codesign --verify` and the
  // notary service both pass (2026-08-07). So the gate is an actual launch,
  // and proof that the app reached the App Group: today's widget payload.
  async function smokeLaunch() {
    say('▸ Smoke-launching the signed app…');
    const launchLog = `${ctx.io.fs.mkdtemp('mihrab-catalyst-launch-')}/launch.log`;
    // Address the group container BY PATH, never as a bare domain: an
    // unsandboxed `defaults` asked for `GAW23HT439.group.com.prayerapp`
    // CREATES a shadow ~/Library/Preferences plist that masks the real
    // container for every later read (2026-08-07).
    const groupName = groupNameFrom(ctx.io.fs.readText(abs('ios/PrayerApp/Catalyst.entitlements')));
    const domain = `${ctx.home}/Library/Group Containers/${groupName}/Library/Preferences/${groupName}`;
    // Quit any copy already running: same bundle id, so `open` would hand
    // the launch to IT and this build's binary would never run (three
    // builds failed that way on 2026-08-24). By executable PATH — the
    // process is PrayerApp, not Mihrab — which also catches /Applications.
    await run('pkill', ['-f', 'Mihrab.app/Contents/MacOS/PrayerApp']);
    await ctx.io.clock.sleep(3000);
    // Clear the payload so the check cannot be satisfied by a value an
    // earlier build left behind — kept first, so a locked Mac gets its
    // widget's data back instead of a blank card.
    const backup = `${ctx.io.fs.mkdtemp('mihrab-group-prefs-')}/prefs.plist`;
    if (!adhoc) {
      await run('defaults', ['export', domain, backup]);
      await run('defaults', ['delete', domain, 'prayer_widget_payload_v2']);
    }
    const openLogged = async (a: string[]) => {
      const r = await run('open', a);
      if (r.stderr) ctx.io.fs.appendText(launchLog, r.stderr);
    };
    const findPid = async (tries: number) => {
      for (let i = 0; i < tries; i++) {
        await ctx.io.clock.sleep(2000);
        const pid = (await run('pgrep', ['-f', `${APP}/Contents/MacOS/PrayerApp`])).stdout.split('\n')[0].trim();
        if (pid) return pid;
      }
      return '';
    };
    const alive = async (pid: string) => !!pid && (await run('kill', ['-0', pid])).code === 0;
    const tail = () => {
      const t = ctx.io.fs.exists(launchLog) ? ctx.io.fs.readText(launchLog) : '';
      return t.split('\n').slice(-21).join('\n');
    };
    // `open -g -j`: hidden and in the background — POLITE FIRST, THEN
    // RELIABLE. A hidden scene never becomes foreground-active, and on a
    // Mac whose display has slept the screen that writes the payload never
    // runs (2.19.0, 2026-09-13), so the visible launch is the fallback.
    await openLogged(['-g', '-j', APP]);
    // WAIT FOR IT: the first launch of a freshly signed bundle is not the
    // second — Gatekeeper verifies the binary and asks Apple (2026-09-03).
    let pid = await findPid(30);
    if (!(await alive(pid))) {
      fail(
        'C9',
        `  ✗ the app never came up (or died on launch) — see ${launchLog}`,
        tail(),
        '  ✗ if it left nothing, AMFI killed it. Ask why:',
        `    /usr/bin/log show --last 5m --predicate 'senderImagePath CONTAINS "AppleMobileFileIntegrity"' --style compact | tail -30`,
      );
    }
    await ctx.io.clock.sleep(10_000);
    if (!(await alive(pid))) fail('C9', `  ✗ the app started and then died — see ${launchLog}`, tail());
    say('  ▸ alive.');
    // Read the value, don't watch the file's mtime: NSUserDefaults writes
    // nothing when the payload is byte-identical. POLL: a cold launch off a
    // full rebuild has been measured past 30 s on this Mac.
    const today = localDate(ctx.io.clock.now());
    const payloadLanded = async (looks: number) => {
      for (let i = 0; i < looks; i++) {
        const r = await run('defaults', ['read', domain, 'prayer_widget_payload_v2']);
        if (r.code === 0 && r.stdout.includes(today)) return true;
        await ctx.io.clock.sleep(5000);
      }
      return false;
    };
    if (!adhoc) {
      if (await payloadLanded(12)) {
        say('  ▸ App Group holds today\'s payload — the widget will have data.');
      } else if (consoleLocked((await run('ioreg', ['-n', 'Root', '-d1', '-a'])).stdout)) {
        // A release must not need someone at the keyboard (2.27.0 stopped
        // twice on 2026-09-26 on a locked Mac). The launch still proves the
        // bundle runs; the entitlement check proves both sides share the group.
        err('  ⚠ the Mac is locked, so the app never reached the foreground and');
        err('    wrote no widget payload. Not required on a locked Mac: the app');
        err(`    launched and stayed up, and app and extension share ${groupName}.`);
        if (ctx.io.fs.size(backup) > 0) await run('defaults', ['import', domain, backup]);
      } else {
        // THE HIDDEN LAUNCH IS A SUSPECT BEFORE THE APP IS: one window,
        // once, and only on a build that was about to be rejected anyway.
        err('  ▸ nothing yet — retrying with a visible launch (the hidden one');
        err('    never brings the scene to the foreground on a sleeping Mac).');
        await run('kill', [pid]);
        await run('pkill', ['-f', 'Mihrab.app/Contents/MacOS/PrayerApp']);
        await ctx.io.clock.sleep(3000);
        await openLogged([APP]);
        // Pick the new PID back up, or the window outlives the build.
        pid = await findPid(10);
        if (await payloadLanded(12)) {
          say('  ▸ App Group holds today\'s payload — the widget will have data.');
          say('    (it took a visible launch; the Mac was probably asleep)');
        } else {
          if (pid) await run('kill', [pid]);
          fail(
            'C9',
            `  ✗ ${groupName} has no payload for today, hidden or visible.`,
            '    The widget would render an empty card. Check that the app group',
            '    entitlement is on BOTH the app and the .appex, and that the app',
            '    got far enough to compute prayer times (needs a location).',
          );
        }
      }
    }
    if (pid) await run('kill', [pid]);
    ctx.io.fs.rm(launchLog.slice(0, launchLog.lastIndexOf('/')));
    ctx.io.fs.rm(backup.slice(0, backup.lastIndexOf('/')));
    // ── C10 ── THE EXTENSION THE LAUNCH SPAWNED, TOO. It survives the app,
    // then the `rm` of the bundle — a widget extension running out of a
    // bundle that no longer exists (found 2026-08-29, hours after a build).
    await run('pkill', ['-f', `${APP}/Contents/PlugIns/`]);
  }

  // ── C12 / C13 — NOTARISE, STAPLE, AND PROVE IT ──
  //
  // EVERY RELEASE FROM 2.11.0 TO 2.13.3 SHIPPED UNNOTARISED: the step was a
  // comment asking a human to run notarytool afterwards. STAPLING IS THE
  // HALF PEOPLE SKIP — the ticket in the bundle is what an offline Mac
  // uses. THE ASSERTIONS ARE ON THE ARTIFACT: stapling mutates the .app
  // after it was zipped, so the zip is rebuilt and then unpacked and asked.
  async function notarise() {
    if (adhoc) {
      err('⚠ Ad-hoc build: nothing to notarize. This zip cannot be published.');
      return;
    }
    if (flag(ctx, 'SKIP_NOTARIZE')) {
      err('⚠ SKIP_NOTARIZE=1 — this zip is NOT notarized and MUST NOT be');
      err('  published. release.sh checks the artifact, not this flag, and');
      err('  will refuse it.');
      return;
    }
    const profile = env(ctx, 'NOTARY_PROFILE') || 'mihrab';
    const ascJson = `${ctx.home}/.config/mihrab/asc.json`;
    let notaryArgs: string[];
    if ((await run('xcrun', ['notarytool', 'history', '--keychain-profile', profile])).code === 0) {
      notaryArgs = ['--keychain-profile', profile];
      say(`▸ Notarizing (keychain profile: ${profile})…`);
    } else if (ctx.io.fs.isFile(ascJson)) {
      // The same App Store Connect key xcode-cloud uses: one credential
      // for both, rather than a second thing noticed only when missing.
      let cfg: Record<string, string> = {};
      try {
        cfg = JSON.parse(ctx.io.fs.readText(ascJson));
      } catch {
        cfg = {};
      }
      if (!cfg.keyPath || !cfg.keyId || !cfg.issuerId) {
        fail('C12', `  ✗ ${ascJson} is missing keyPath, keyId or issuerId.`);
      }
      notaryArgs = ['--key', cfg.keyPath, '--key-id', cfg.keyId, '--issuer', cfg.issuerId];
      say(`▸ Notarizing (App Store Connect key from ${ascJson})…`);
    } else {
      return fail(
        'C12',
        '  ✗ No notarization credentials.',
        '    Gatekeeper blocks the first launch of an unnotarized build,',
        '    which is what 2.11.0 through 2.13.3 shipped as. Set one up:',
        '      xcrun notarytool store-credentials mihrab \\',
        '        --key <AuthKey.p8> --key-id <id> --issuer <uuid>',
        `    or put keyPath/keyId/issuerId in ${ascJson}.`,
        '    SKIP_NOTARIZE=1 builds a zip that cannot be released.',
      );
    }
    const submitted = await irreversible(
      ctx,
      `submit ${zip} to Apple's notary service, staple the ticket and re-zip`,
      async () => {
        const r = await run('xcrun', ['notarytool', 'submit', zip, ...notaryArgs, '--wait', '--timeout', '30m']);
        const log = r.stdout + r.stderr;
        for (const l of log.split('\n').filter(Boolean)) say(l);
        if (r.code !== 0) fail('C12', '  ✗ notarytool submit failed — see above.');
        if (!notaryAccepted(log)) {
          const id = submissionId(log);
          err('  ✗ notarization was not accepted.');
          if (id) {
            const why = await run('xcrun', ['notarytool', 'log', id, ...notaryArgs]);
            err(why.stdout + why.stderr);
          }
          ctx.report.halt('C12', 'notarization was not accepted.');
        }
        return true;
      },
      false,
    );
    if (!submitted) return; // dry run: nothing to staple

    // ── STAPLING IS A DOWNLOAD, AND A DOWNLOAD CAN BE EARLY ──
    // `stapler` fetches the ticket from Apple's CDN, published a while
    // AFTER the submission comes back Accepted. Ask too soon and it exits
    // 73, which reads like a broken build and is not (2.14.0's first
    // attempt). Six tries over two and a half minutes.
    say('▸ Stapling the ticket into the bundle…');
    let stapled = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      if ((await run('xcrun', ['stapler', 'staple', APP], { stream: true })).code === 0) {
        stapled = true;
        break;
      }
      if (attempt === 6) break;
      say(`  ▸ no ticket yet (attempt ${attempt} of 6) — waiting ${attempt * 10}s…`);
      await ctx.io.clock.sleep(attempt * 10_000);
    }
    if (!stapled) fail('C13', '  ✗ stapler failed after 6 attempts over 2.5 minutes.');
    // The ticket goes where the seal does not reach, so the signature must
    // still verify. Asserted, because "must" is a claim.
    if ((await run('codesign', ['--verify', '--strict', APP])).code !== 0) {
      fail('C13', '  ✗ stapling broke the signature.');
    }
    say('▸ Re-zipping with the ticket…');
    ctx.io.fs.rm(abs(zip));
    await must('C13', 'ditto -c', 'ditto', ['-c', '-k', '--keepParent', APP, zip]);

    // AND NOW ASK THE ZIP — `stapler validate` on the unpacked copy, which
    // does not invoke Gatekeeper; and `spctl` only on $APP, a path this
    // build already registers and cleans up. `spctl -a` on a bundle in a
    // temp directory hands it to App Translocation, and the translocated
    // .appex record took the INSTALLED app's widgets with it (2026-08-29).
    say('▸ Checking the notarization that actually got shipped…');
    // UNREGISTERED BEFORE IT IS REMOVED, and removed however the check
    // ends: unpacking an .app is enough to register it (2026-08-29), and
    // this copy used to be deleted still registered — or, when the check
    // failed, left behind registered.
    const check = ctx.io.fs.mkdtemp('mihrab-ncheck-');
    try {
      if ((await run('ditto', ['-x', '-k', zip, check])).code !== 0) fail('C13', `  ✗ cannot unpack ${zip}`);
      if ((await run('xcrun', ['stapler', 'validate', `${check}/Mihrab.app`])).code !== 0) {
        fail(
          'C13',
          '  ✗ the zip carries no stapled ticket.',
          '    An offline Mac will refuse to launch it. The re-zip above',
          '    must happen AFTER the staple.',
        );
      }
    } finally {
      await unregisterAndRemove(ctx, `${check}/Mihrab.app`, check);
    }
    const assess = await run('spctl', ['-a', '-t', 'exec', '-vv', APP]);
    const text = assess.stdout + assess.stderr;
    if (!gatekeeperAccepts(text)) {
      fail(
        'C13',
        '  ✗ Gatekeeper does not accept the bundle this zip was made from:',
        ...text.split('\n').filter(Boolean).map(l => `      ${l}`),
      );
    }
    say('  ✓ Gatekeeper accepts it: notarized Developer ID, ticket stapled.');
  }

  // ── C15 — HAND THE MACHINE BACK ──
  //
  // Launching the app registered THIS copy with LaunchServices, and Xcode
  // registers its own build product whether or not anything is launched.
  // A record pointing at a path that no longer holds the bundle it
  // remembers makes chronod reject every archived timeline —
  // `bundleStubNotSupported` — on the copy in /Applications that was never
  // the problem (2026-08-26). So unregister what was registered, then
  // DELETE the bundle, then check, and stop if a ghost survived.
  //
  // THE .appex PATHS ARE NEVER UNREGISTERED BY NAME: `-u` drops records by
  // BUNDLE IDENTIFIER, and every copy of the extension carries the same
  // one — unregistering the build tree's .appex took the installed app's
  // plugin registration with it (2026-08-27).
  //
  // `built` says whether this is the end of a build that made its zip, or
  // the way out of one that stopped — which is when the zip is not "fine".
  async function handBackTheMachine(built: boolean) {
    if (!ctx.io.fs.isExecutable(LSREGISTER)) return;
    for (const stale of [APP, BUILT]) await run(LSREGISTER, ['-u', stale]);
    // The fixed list was not enough: notarisation brought App
    // Translocation, and a translocated copy lives at a path nobody can
    // predict. So every registered `.app` outside /Applications too.
    for (const stale of ghostApps((await run(LSREGISTER, ['-dump'])).stdout)) {
      await run(LSREGISTER, ['-u', stale]);
    }
    ctx.io.fs.rm(abs(APP));
    // AND PUT THE REAL ONE BACK — and its widget extension, separately:
    // unregistering any copy drops the plugin record for ALL of them, and
    // `lsregister -f` does not restore it. Ask PlugInKit, and check it
    // STAYED: a late LaunchServices event can drop it a second later.
    if (ctx.io.fs.isDir(INSTALLED_APP)) {
      await run(LSREGISTER, ['-f', INSTALLED_APP]);
      let seen = '';
      for (let i = 0; i < 8; i++) {
        await run('pluginkit', ['-a', INSTALLED_EXT]);
        await ctx.io.clock.sleep(3000);
        seen = (await run('pluginkit', ['-m', '-i', WIDGET_EXT_ID])).stdout.trim();
        if (seen) break;
      }
      if (seen) {
        say("  ▸ the installed app's widget extension is still registered.");
      } else {
        err("  ⚠ /Applications/Mihrab.app's widget extension is NOT registered.");
        err('    Its widgets will be blank until it is. See');
        err(built ? '    docs/release/catalyst-widgets.md; the zip is fine.' : '    docs/release/catalyst-widgets.md.');
      }
    }
    // SWEPT AGAIN BEFORE IT IS CALLED A FAILURE: LaunchServices registers a
    // bundle it notices on its own, and 2.27.0's first run found the build
    // product registered again seconds after the sweep. Three re-sweeps;
    // only a ghost that keeps coming back stops the build.
    let ghosts: string[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      await ctx.io.clock.sleep(2000);
      ghosts = ghostPaths((await run(LSREGISTER, ['-dump'])).stdout);
      if (!ghosts.length || attempt === 4) break;
      for (const stale of ghosts) await run(LSREGISTER, ['-u', stale]);
    }
    if (ghosts.length) {
      fail(
        'C15',
        '  ✗ LaunchServices still points at a build copy:',
        ...ghosts.map(g => `      ${g}`),
        '    Every widget on this Mac will go blank — see',
        '    docs/release/catalyst-widgets.md. Clear them with:',
        `      for p in ${ghosts.join(' ')}; do "${LSREGISTER}" -u "$p"; done`,
        ...(built ? [`    The zip is built and fine: ${zip}`] : []),
      );
    }
    say('  ▸ LaunchServices knows only /Applications/Mihrab.app.');
  }
}
