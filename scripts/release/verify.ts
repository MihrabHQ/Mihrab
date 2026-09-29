/**
 * Post-release verification — a release is NOT done until this passes.
 * The port of scripts/verify-release.sh, check for check (V1–V12 in the
 * inventory), in its order and with its words.
 *
 * Guards against the failure modes hit live: retagging silently turned the
 * GitHub release into a DRAFT and every asset URL 404'd (v2.7.39); the
 * cask's version or sha drifting from the published zip; a missing asset;
 * the wrong APK — Obtainium installs whatever is there.
 *
 * Three marks: ✓ passed, ✗ failed (exit 1), ⧗ not finished. A check that
 * has not finished has not passed, and printing a ✓ next to "still
 * building" is exactly how 2.13.0 was called done.
 */
import type { Ctx } from './common.ts';
import {
  APP_GROUP,
  ARM_ONLY,
  DEX_UNREADABLE,
  INSTALLED_EXT,
  JDK,
  PLAY_LOCALES,
  PLAY_NOTE_LIMIT,
  RELEASE_CERT,
  REPO,
  SITE_URL,
  TEAM,
  WIDGET_EXT_ID,
  apkAbis,
  apkGoogleClasses,
  apkName,
  assetUrl,
  caskAgainstApp,
  caskAgainstZip,
  charCount,
  codesignDetails,
  codesignEntitlements,
  env,
  gh,
  git,
  has,
  newestBuildTool,
  row3,
  staplerValidates,
  tapPath,
  unregisterAndRemove,
  zipName,
} from './common.ts';
import { Asc, AscExit } from './asc.ts';
import { POSTFLIGHT_DO, POSTFLIGHT_STEPS } from './preflight.ts';
import * as xc from './xcodeCloud.ts';

export function caskVersion(cask: string): string {
  return /.*version "(.*)".*/.exec(cask)?.[1] ?? '';
}
export function caskSha(cask: string): string {
  return /.*sha256 "([a-f0-9]*)".*/.exec(cask)?.[1] ?? '';
}

/** V12's verdict on a finished or unfinished run. */
export function ciVerdict(row: string, short: string): ['ok' | 'fail' | 'pend', string] {
  if (!row) return ['pend', `CI: no run on ${short} yet — re-run once GitHub has picked the push up`];
  const [status, conclusion, url] = row3(row);
  if (status !== 'completed') return ['pend', `CI: ${status} on ${short} — ${url}`];
  if (conclusion === 'success') return ['ok', `CI: green on ${short}`];
  if (['failure', 'timed_out', 'startup_failure'].includes(conclusion)) {
    return ['fail', `CI: ${conclusion} on the released commit ${short} — ${url}`];
  }
  // cancelled, skipped, neutral, action_required: finished without
  // deciding anything. A pass would be a lie and a failure a false alarm.
  return ['pend', `CI: ${conclusion} on ${short} — no verdict — ${url}`];
}

export async function verify(ctx: Ctx, tag: string, opts: { self?: string } = {}): Promise<number> {
  // How the verifier was invoked, for the "re-run this" hint — the shell
  // printed its own `$0`, which release.sh gives as an absolute path.
  const self = opts.self ?? './scripts/verify-release.sh';
  const r = ctx.report;
  const fs = ctx.io.fs;
  const version = tag.replace(/^v/, '');
  const tap = tapPath(ctx.home);
  const zipUrl = assetUrl(tag, zipName(version));
  const apkUrl = assetUrl(tag, apkName(version));
  const ok = (id: string, t: string) => r.ok(id, t);
  const fail = (id: string, t: string) => r.fail(id, t);
  const pend = (id: string, t: string) => r.pend(id, t);

  // ── V1 ──
  const remote = (await git(ctx, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])).stdout;
  if (has(remote, tag)) ok('V1', `tag ${tag} exists on origin`);
  else fail('V1', `tag ${tag} missing on origin`);

  // ── V2 ── published (NOT draft). Retagging once turned the release into
  // a draft and every asset URL started returning 404.
  const view = await gh(ctx, ['release', 'view', tag, '-R', REPO, '--json', 'isDraft,assets']);
  const relJson = view.code === 0 ? view.stdout.trim() : '';
  let rel: { isDraft?: boolean; assets?: Array<{ name: string }> } | undefined;
  try {
    rel = relJson ? JSON.parse(relJson) : undefined;
  } catch {
    rel = undefined;
  }
  if (!relJson) {
    fail('V2', `GitHub release ${tag} not found`);
  } else {
    if (rel?.isDraft === false) ok('V2', 'release is published (not draft)');
    else fail('V2', `release is a DRAFT — assets 404 publicly. Fix: gh release edit ${tag} -R ${REPO} --draft=false --latest`);
    for (const asset of [apkName(version), zipName(version)]) {
      if (has(relJson, `"${asset}"`)) ok('V2', `asset present: ${asset}`);
      else fail('V2', `asset MISSING from release: ${asset}`);
    }
  }

  // ── V3 ── The asset URLs actually resolve (public, redirects followed).
  for (const url of [zipUrl, apkUrl]) {
    const code = (await ctx.io.http.request({ method: 'HEAD', url })).status;
    if (code === 200) ok('V3', `HTTP 200: ${url.slice(url.lastIndexOf('/') + 1)}`);
    else fail('V3', `HTTP ${code === 0 ? '000' : code}: ${url}`);
  }

  // ── V4 ── The APK AS SERVED is the GitHub build. Obtainium picks
  // unattended only when there is exactly one APK, and after 2.25.0 that one
  // is the `github` flavour: ARM only, R8 on, nothing Google, signed with
  // the key every earlier GitHub APK carried — a different key and Android
  // refuses the update on every phone that already has the app.
  let apkCount = -1;
  try {
    apkCount = (rel?.assets ?? []).filter(a => a.name.endsWith('.apk')).length;
    if (!rel?.assets) apkCount = -1;
  } catch {
    apkCount = -1;
  }
  if (apkCount === 1) ok('V4', 'exactly one APK on the release (Obtainium can pick it unattended)');
  else {
    fail(
      'V4',
      `${apkCount} APKs on the release — Obtainium needs exactly one; remove the extra with gh release delete-asset ${tag} <name> -R ${REPO} -y`,
    );
  }
  const apkDir = fs.mkdtemp('mihrab-apk-');
  const apk = `${apkDir}/app.apk`;
  const gotApk = await ctx.io.http.download(apkUrl, apk);
  if (gotApk.status >= 200 && gotApk.status < 300) {
    const abis = await apkAbis(ctx, apk);
    if (abis === ARM_ONLY) ok('V4', 'published APK is ARM only (github flavor)');
    else fail('V4', `published APK carries ABIs '${abis}' — expected arm64-v8a armeabi-v7a; is this the F-Droid build?`);
    const google = await apkGoogleClasses(ctx, apk);
    if (google === 'found') fail('V4', 'published APK contains Google Play Services / Firebase / Play Core classes');
    else if (google === 'unreadable') fail('V4', `published APK ${DEX_UNREADABLE}`);
    else ok('V4', 'published APK carries no Google Play Services');
    const signer = newestBuildTool(ctx, 'apksigner');
    if (signer) {
      const certs = await ctx.io.exec.run(signer, ['verify', '--print-certs', apk], {
        env: { JAVA_HOME: env(ctx, 'JDK') || JDK },
      });
      const cert = /certificate SHA-256 digest: (.*)/.exec(certs.stdout)?.[1]?.trim() ?? '';
      if (cert === RELEASE_CERT) ok('V4', 'published APK is signed with the release key');
      else {
        fail(
          'V4',
          `published APK signer is '${cert || 'unverifiable'}', not the release key — existing installs cannot update over it`,
        );
      }
    } else {
      pend('V4', 'apksigner not found — signing key of the published APK not checked');
    }
  } else {
    fail('V4', `could not download ${apkUrl} to inspect it`);
  }
  fs.rm(apkDir);

  // ── V5 / V6 / V7 — the cask and the published Mac app ──
  if (fs.isFile(tap)) {
    const cask = fs.readText(tap);
    const cv = caskVersion(cask);
    const cs = caskSha(cask);
    if (cv === version) ok('V5', `cask version ${cv} matches`);
    else fail('V5', `cask version is ${cv}, release is ${version} — bump Casks/mihrab.rb and push the tap`);
    // Against the zip AS SERVED — catches stale uploads and drift. Plain
    // `curl -sL -o`, as the shell had it: an error page is saved and its
    // sha simply does not match.
    const zipDir = fs.mkdtemp('mihrab-verifyzip-');
    const zip = `${zipDir}/Mihrab.zip`;
    const got = await ctx.io.http.download(zipUrl, zip, { keepErrorBody: true });
    if (got.status !== 0 && fs.exists(zip)) {
      const dl = fs.sha256(zip);
      if (dl === cs) ok('V5', 'cask sha256 matches the published zip');
      else fail('V5', `cask sha256 (${cs}) != published zip (${dl}) — re-upload the zip or update the cask`);

      // ── THE CASK RESTARTS THE WIDGET DAEMON ──
      // Replacing the app in place freezes every widget: chronod validates
      // its archived timelines against the bundle that produced them and
      // after an upgrade every reload fails `bundleStubNotSupported`, for a
      // day and more (measured 2026-08-28). Restarting chronod fixes it,
      // and the cask's postflight is the only code that runs at that
      // moment. `postflight_steps` sandboxes its `run` step, where
      // `pluginkit -a` fails (2026-09-14) — only the legacy block works.
      if (POSTFLIGHT_STEPS.test(cask)) {
        fail(
          'V5',
          `cask uses postflight_steps — its sandboxed run step cannot register the widget extension (pluginkit -a fails); every Mac upgrading to ${tag} loses its widgets. Keep the legacy 'postflight do' block.`,
        );
      } else if (POSTFLIGHT_DO.test(cask) && has(cask, 'chronod')) {
        ok('V5', 'cask restarts chronod after install');
      } else {
        fail('V5', `cask has no chronod postflight — every Mac upgrading to ${tag} freezes its widgets`);
      }
      // AND IT MUST RE-REGISTER THE WIDGET EXTENSION. Replacing the app
      // drops PlugInKit's record, and with no provider WidgetKit does not
      // draw a stale card, it REMOVES the widget (2026-08-29, 2.13.3).
      if (has(cask, 'pluginkit')) ok('V5', 'cask re-registers the widget extension');
      else fail('V5', `cask does not re-register the widget extension — every Mac upgrading to ${tag} loses its placed widgets`);

      await publishedApp(ctx, zip, cask);
    } else {
      fail('V5', 'could not download the zip to verify sha256');
    }
    fs.rm(zipDir);
    // ── V7 ── The tap must actually be pushed. (As the shell: a tap with
    // unstaged changes is not asked about its commits.)
    const tapRepo = tap.slice(0, tap.lastIndexOf('/Casks/'));
    const clean = (await git(ctx, ['diff', '--quiet'], { cwd: tapRepo })).code === 0;
    const ahead = (await git(ctx, ['log', 'origin/main..main', '--oneline'], { cwd: tapRepo })).stdout.trim();
    if (clean && ahead) fail('V7', 'homebrew-tap has unpushed commits — git push it');
    else ok('V7', 'homebrew-tap is pushed');
  } else {
    fail('V5', `cask not found at ${tap}`);
  }

  // ── V8 ──
  const recipe = fs.readText(`${ctx.root}/contrib/fdroid/com.prayer_times.yml`);
  if (has(recipe, `CurrentVersion: ${version}`)) ok('V8', `F-Droid recipe CurrentVersion is ${version}`);
  else fail('V8', `F-Droid recipe CurrentVersion != ${version}`);

  // ── V9 ── Checked twice on purpose: in the repo (what we committed) and
  // live (what a visitor reads). The site advertised an old release for
  // three versions because nothing looked at either.
  const site = fs.readText(`${ctx.root}/docs/index.html`);
  if (has(site, `Version ${version} (`) && has(site, `Mihrab ${version} (`)) ok('V9', `docs/index.html names ${version}`);
  else fail('V9', `docs/index.html does not name ${version} — run: node scripts/sync-version.js`);
  const bust = `${SITE_URL}?bust=${Math.floor(ctx.io.clock.now() / 1000)}`;
  const liveRes = await ctx.io.http.request({ method: 'GET', url: bust, timeoutMs: 20_000 });
  const live = liveRes.status >= 200 && liveRes.status < 300 ? liveRes.text : '';
  if (!live) {
    fail('V9', 'could not fetch the live site to check its version');
  } else if (has(live, `Version ${version} (`)) {
    ok('V9', `live site serves ${version}`);
  } else {
    // Say WHICH of the two failures this is, or the next person re-reads
    // the stamping script for a bug that is not there: if the committed
    // file is right and the served copy old, the deploy is GitHub's side.
    fail('V9', `live site is NOT serving ${version}`);
    const served = /Version [0-9.]+ \([0-9]+\)/.exec(live)?.[0] ?? '';
    const head = await ctx.io.http.request({ method: 'HEAD', url: bust });
    const build = await gh(ctx, ['api', `repos/${REPO}/pages/builds/latest`, '--jq', '.status']);
    let pages = 'unknown';
    try {
      const st = await ctx.io.http.request({
        method: 'GET',
        url: 'https://www.githubstatus.com/api/v2/components.json',
        timeoutMs: 10_000,
      });
      pages = JSON.parse(st.text).components.find((c: { name: string }) => c.name === 'Pages')?.status ?? 'unknown';
    } catch {
      pages = 'unknown';
    }
    r.say(`    served: ${served || 'none'}   last-modified: ${head.headers['last-modified'] || 'unknown'}`);
    r.say(`    latest Pages build: ${build.code === 0 ? build.stdout.trim() : 'unknown'}   |   GitHub Pages status: ${pages}`);
    if (pages !== 'operational') {
      r.say('    → Pages is not operational. The repo is right; the deploy is stuck on GitHub.');
      r.say(`      Once it recovers: gh api -X POST repos/${REPO}/pages/builds`);
    } else {
      r.say(`    → Ask for a rebuild: gh api -X POST repos/${REPO}/pages/builds`);
    }
  }

  // ── V10 ── Store release notes exist for this versionCode.
  const codeLine = fs.readText(`${ctx.root}/android/app/build.gradle`).split('\n').find(l => l.includes('versionCode')) ?? '';
  const code = codeLine.replace(/[^0-9]/g, '');
  for (const loc of PLAY_LOCALES) {
    const note = `${ctx.root}/fastlane/metadata/android/${loc}/changelogs/${code}.txt`;
    if (!fs.isFile(note)) fail('V10', `missing Play release notes: ${loc}/changelogs/${code}.txt`);
    else if (charCount(fs.readText(note)) > PLAY_NOTE_LIMIT) {
      fail('V10', `${loc}/changelogs/${code}.txt is over Play's 500-character limit`);
    } else ok('V10', `Play release notes present for ${loc} (${code})`);
  }

  // ── V11 — THE iOS CHANNEL ACTUALLY SHIPPED ──
  //
  // 2.13.0: run #549 archived and ERRORED in the upload step, and this
  // passed the release anyway. Three outcomes, because "not there yet" and
  // "never going to be there" are different facts. The tagged commit is
  // handed over so "Xcode Cloud has not seen this push yet" (the first
  // minutes, exactly when release runs this) is not called "never" (2.13.1).
  //
  // THE QUESTION IS WHETHER iOS SHIPPED, NOT WHICH ROUTE IT TOOK. 2.24.0
  // and 2.24.1 ended on a red ✗ over an iOS channel that was fine: the
  // local fallback had uploaded, and this only knew how to ask Xcode
  // Cloud. IOS_LOCAL_UPLOAD=1 means "this run uploaded iOS from this Mac";
  // not listed yet is PENDING. It stays a hard fail when nothing uploaded.
  const tagSha = (await git(ctx, ['rev-parse', '-q', '--verify', `${tag}^{commit}`])).stdout.trim();
  const said: string[] = [];
  let rc: number;
  try {
    rc = await xc.shipped(
      { asc: new Asc(ctx.io, ctx.home), io: ctx.io, root: ctx.root, say: l => said.push(l) },
      version,
      tagSha || undefined,
    );
  } catch (e) {
    said.push(e instanceof Error ? e.message : String(e));
    rc = e instanceof AscExit ? e.code : 1;
  }
  const xcOut = said.join('\n');
  if (rc === 0) ok('V11', `iOS: ${xcOut}`);
  else if (rc === 3) pend('V11', `iOS: ${xcOut}`);
  else if (env(ctx, 'IOS_LOCAL_UPLOAD') === '1') {
    pend(
      'V11',
      `iOS: uploaded from this Mac (build ${code}) and not listed by App Store Connect yet — processing takes a few minutes, then: ${self} ${tag}`,
    );
  } else fail('V11', `iOS: ${xcOut}`);

  // ── V12 — CI IS GREEN ON THE COMMIT THAT WAS RELEASED ──
  //
  // Every release from 2.13.1 went red on GitHub and four failure mails
  // arrived unconnected to the release that sent them. The tag's own
  // commit, not main's newest: F-Droid builds from the tag. `-q --verify`:
  // a bare rev-parse prints an unknown ref back and the check would go
  // looking for the runs of "v9.9.9^{commit}".
  if (!tagSha) {
    fail('V12', `CI: cannot resolve ${tag} to a commit locally — 'git fetch --tags' first`);
  } else {
    const row = (
      await gh(ctx, [
        'run', 'list', '--workflow=ci.yml', '--commit', tagSha, '-R', REPO, '--limit', '1',
        '--json', 'status,conclusion,url',
        '--jq', '.[0] // empty | "\\(.status)|\\(.conclusion)|\\(.url)"',
      ])
    ).stdout.trim();
    const [kind, text] = ciVerdict(row, tagSha.slice(0, 7));
    if (kind === 'ok') ok('V12', text);
    else if (kind === 'fail') fail('V12', text);
    else pend('V12', text);
  }

  r.say('');
  if (!r.failed && r.pending) {
    // Not a failure, and not "live on every channel" either: saying the
    // second while iOS is mid-build is how 2.13.0 was called finished.
    r.say('── EVERY FINISHED CHECK PASSED — something above is still running (marked ⧗), re-run this when it lands ──');
    return 0;
  }
  if (!r.failed) {
    r.say(`── ALL CHECKS PASSED — release ${tag} is live on every channel ──`);
    return 0;
  }
  r.say('── RELEASE VERIFICATION FAILED — fix the ✗ items above ──');
  return 1;
}

/**
 * V6 — THE PUBLISHED APP IS ACTUALLY SIGNED WITH THE DEVELOPER ID, carries
 * the App Group, is notarised, and the cask asks for what it needs.
 *
 * Checked on what is SERVED, not on ios/build, because the two came apart
 * once: 2.11.0 went out ad hoc, `codesign --verify --strict` passed, and
 * codesign had silently dropped every entitlement. The ticket is checked
 * with `stapler validate`, deliberately NOT `spctl -a` — assessing a
 * bundle unpacked into a temp directory hands it to App Translocation,
 * and the registered translocated .appex takes the installed app's
 * widgets down with it (2026-08-29).
 */
async function publishedApp(ctx: Ctx, zip: string, cask: string): Promise<void> {
  const r = ctx.report;
  const verdicts = (vs: Array<['ok' | 'fail', string]>) => {
    for (const [kind, text] of vs) {
      if (kind === 'ok') r.ok('V6', text);
      else r.fail('V6', text);
    }
  };
  if (ctx.shadow) {
    // NOT UNPACKED BESIDE THE SHELL. Unpacking registers the app, and the
    // unregister after it takes the installed widget down lazily — the
    // shell has just done both, and shadow mode is not to do them again.
    // Its ✓ for the signature, the group, the ticket and the widget are
    // trusted; the cask is still compared, off the plist and executable
    // taken out of the zip alone, which puts no bundle on disk.
    const trusted = [
      `published app signed by team ${TEAM}`,
      'published app carries the App Group',
      'published app is notarized, ticket stapled',
      ...(ctx.io.fs.isDir(INSTALLED_EXT) ? ["this Mac's own Mihrab widget extension is still registered"] : []),
    ];
    for (const t of trusted) r.skip('V6', `${t} (not re-unpacked beside the shell)`, t);
    verdicts(await caskAgainstZip(ctx, cask, zip));
    return;
  }
  const dir = ctx.io.fs.mkdtemp('mihrab-verifyapp-');
  const app = `${dir}/Mihrab.app`;
  const unpacked = (await ctx.io.exec.run('ditto', ['-xk', zip, dir])).code === 0 && ctx.io.fs.isDir(app);
  if (unpacked) {
    const sig = await codesignDetails(ctx, app);
    const team = /^TeamIdentifier=(.*)$/m.exec(sig)?.[1] ?? '';
    if (has(sig, 'adhoc')) {
      r.fail('V6', 'the published app is AD-HOC SIGNED — no entitlements, no App Group, no widgets. Rebuild with a Developer ID and re-upload.');
    } else if (!team || team === 'not set') {
      r.fail('V6', 'the published app has no TeamIdentifier — every entitlement was dropped at signing. Rebuild and re-upload.');
    } else {
      r.ok('V6', `published app signed by team ${team}`);
    }
    if (has(await codesignEntitlements(ctx, app), APP_GROUP)) r.ok('V6', 'published app carries the App Group');
    else r.fail('V6', 'published app has NO App Group — its widgets will not render');
    if (await staplerValidates(ctx, app)) r.ok('V6', 'published app is notarized, ticket stapled');
    else r.fail('V6', 'published app carries NO notarization ticket — macOS blocks its first launch, as it has since 2.11.0');

    // AND THE CASK ASKS FOR WHAT THE APP NEEDS (see caskAgainstApp) — asked
    // before publishing too, since 2026-09-29, and again here of what is
    // served.
    verdicts(await caskAgainstApp(ctx, cask, `${app}/Contents/Info.plist`, `${app}/Contents/MacOS`));
  } else {
    r.fail('V6', 'could not unpack the published zip to check its signature');
  }
  // UNREGISTER BEFORE REMOVING — unpacking an .app is enough to register it.
  await unregisterAndRemove(ctx, app, dir);
  // AND PUT THE INSTALLED WIDGET BACK: that unregister drops records by
  // bundle identity, lazily, minutes after any check here would look.
  if (ctx.io.fs.isDir(INSTALLED_EXT)) {
    let seen = '';
    for (let i = 0; i < 8; i++) {
      await ctx.io.exec.run('pluginkit', ['-a', INSTALLED_EXT]);
      await ctx.io.clock.sleep(3000);
      seen = (await ctx.io.exec.run('pluginkit', ['-m', '-i', WIDGET_EXT_ID])).stdout.trim();
      if (seen) break;
    }
    if (seen) r.ok('V6', "this Mac's own Mihrab widget extension is still registered");
    else r.fail('V6', "this Mac's widget extension is NOT registered — its widgets will be blank. See docs/release/catalyst-widgets.md");
  }
}
