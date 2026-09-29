/**
 * PHASE 2 — BUILD. Writes to the working tree and to ios/build, and
 * nothing else. Everything here is `git checkout` away from undone (the
 * `REVERT` line). The port of release.sh from "Stamping" to the dry-run
 * exit; ids B1–B6 in the inventory.
 *
 * In shadow mode the shell has already stamped and built, so the TS does
 * not write or rebuild anything: it asks the same questions of what the
 * shell produced (the stamps, the generated files' `--check`, the APK's
 * badging and contents, the zip's signature and ticket) and trusts the
 * shell's ✓ for the builds themselves.
 */
import type { Ctx } from './common.ts';
import {
  ARM_ONLY,
  JDK,
  TEAM,
  APP_GROUP,
  WIDGET_UNREGISTERED,
  apkAbis,
  apkHasGoogleClasses,
  codesignDetails,
  codesignEntitlements,
  flag,
  gradleCode,
  has,
  keepInstalledWidgetRegistered,
  newestBuildTool,
  staplerValidates,
  unregisterAndRemove,
  zipName,
} from './common.ts';
import type { Release } from './preflight.ts';
import { GRADLE, PBXPROJ } from './preflight.ts';
import { tsTool } from './self.ts';

export const APK = 'android/app/build/outputs/apk/github/release/app-github-release.apk';
export const AAB = 'android/app/build/outputs/bundle/playRelease/app-play-release.aab';
export const CATALYST_LOG = '/tmp/release-catalyst.log';

// Everything phase 2 writes into the tree, so a run that stops partway can
// be undone in one line. The JOURNAL belongs here (it is appended before
// the release commit, so a rerun would add a second entry), and `docs`
// WHOLE: the site is fourteen files and a list goes stale the moment it
// grows (2.15.0).
export const REVERT =
  'git checkout -- android/app/build.gradle ios/PrayerApp.xcodeproj/project.pbxproj docs contrib/fdroid/com.prayer_times.yml src/polish/releaseNotes.generated.ts';

export interface Built {
  apk: string;
  aab: string;
  /** '' when SKIP_CATALYST=1. */
  zip: string;
}

/**
 * `sed -i '' "s/<from>/<to>/"`: the first occurrence on each line, taken
 * literally (the dots of a version are the only regex characters the
 * shell's patterns held, and they only ever met themselves).
 */
export function sedFirstPerLine(text: string, from: string, to: string): string {
  return text
    .split('\n')
    .map(l => (l.includes(from) ? l.replace(from, to) : l))
    .join('\n');
}

/** `sed -i '' "s/<from>/<to>/g"`. */
export const sedAll = (text: string, from: string, to: string) => text.split(from).join(to);

export function stampGradle(gradle: string, rel: Release): string {
  let out = sedFirstPerLine(gradle, `versionCode ${rel.oldCode}`, `versionCode ${rel.code}`);
  out = sedFirstPerLine(out, `versionName "${rel.oldVersion}"`, `versionName "${rel.version}"`);
  return out;
}

export function stampPbxproj(pbx: string, rel: Release): string {
  let out = sedAll(pbx, `CURRENT_PROJECT_VERSION = ${rel.oldCode};`, `CURRENT_PROJECT_VERSION = ${rel.code};`);
  out = sedAll(out, `MARKETING_VERSION = ${rel.oldVersion};`, `MARKETING_VERSION = ${rel.version};`);
  return out;
}

async function node(ctx: Ctx, script: string, args: string[] = []) {
  return ctx.io.exec.run('node', [`${ctx.root}/scripts/${script}`, ...args], { cwd: ctx.root });
}

// ── B1 ────────────────────────────────────────────────────────────────
export async function stamp(ctx: Ctx, rel: Release): Promise<void> {
  ctx.report.step(`Stamping ${rel.version} (${rel.code})`);
  const gradleFile = `${ctx.root}/${GRADLE}`;
  const pbxFile = `${ctx.root}/${PBXPROJ}`;
  if (!ctx.shadow) {
    ctx.io.fs.writeText(gradleFile, stampGradle(ctx.io.fs.readText(gradleFile), rel));
    ctx.io.fs.writeText(pbxFile, stampPbxproj(ctx.io.fs.readText(pbxFile), rel));
    // BOTH HALVES. `npm run sync-version` is `sync-version.js &&
    // build-site.js`, and the cut once ran only the first: the eleven
    // generated locale pages kept the previous version while
    // docs/index.html moved, and `build-site.js --check` failed after the tag.
    if ((await node(ctx, 'sync-version.js')).code !== 0) ctx.report.stop('B1', 'sync-version failed');
    if ((await node(ctx, 'build-site.js')).code !== 0) ctx.report.stop('B1', 'build-site failed');
  }
  if ((await node(ctx, 'build-site.js', ['--check'])).code !== 0) {
    ctx.report.stop('B1', 'the generated site is still out of date after rebuilding it');
  }
  if (gradleCode(ctx.io.fs.readText(gradleFile)) !== rel.code) ctx.report.stop('B1', 'gradle stamp did not take');
  if (!has(ctx.io.fs.readText(pbxFile), `MARKETING_VERSION = ${rel.version};`)) {
    ctx.report.stop('B1', 'pbxproj stamp did not take');
  }
  ctx.report.ok('B1', `build.gradle, pbxproj, site and F-Droid recipe all say ${rel.version} (${rel.code})`);
}

// ── B2 ────────────────────────────────────────────────────────────────
// The in-app changelog, AFTER the stamp and BEFORE the build. The
// generator takes build.gradle's versionCode as "the release being cut";
// run before the stamp it would treat this release's notes as a future
// one, and the APK would carry a changelog that stops one release short.
export async function releaseNotesTable(ctx: Ctx, rel: Release): Promise<void> {
  if (!ctx.shadow && (await node(ctx, 'build-release-notes.js')).code !== 0) {
    ctx.report.stop('B2', 'could not rebuild src/polish/releaseNotes.generated.ts');
  }
  if ((await node(ctx, 'build-release-notes.js', ['--check'])).code !== 0) {
    ctx.report.stop('B2', 'the in-app changelog is still out of date after rebuilding it');
  }
  const table = ctx.io.fs.readText(`${ctx.root}/src/polish/releaseNotes.generated.ts`);
  if (!has(table, `version: '${rel.version}',`)) {
    ctx.report.stop('B2', `the in-app changelog does not carry ${rel.version} — is ${rel.code}.txt in place?`);
  }
  ctx.report.ok('B2', `in-app changelog carries ${rel.version} (${rel.code})`);
}

// ── B3 ────────────────────────────────────────────────────────────────
// SEPARATE INVOCATIONS, deliberately. The flavours have different signing
// config and manifest merges, and one Gradle run has produced an APK
// carrying the other flavour's settings.
export async function android(ctx: Ctx): Promise<void> {
  ctx.report.step('Android');
  const gradle = async (args: string[]) =>
    ctx.io.exec.run('./gradlew', ['-q', ...args], {
      cwd: `${ctx.root}/android`,
      env: { JAVA_HOME: JDK },
      stream: true,
    });
  const builds: Array<[string[], string, string]> = [
    [['assemblePlayRelease', 'bundlePlayRelease'], 'play build failed', 'play APK + AAB'],
    // The GitHub/Obtainium APK: its own flavour, R8 on, ARM only. Compiling
    // only the ABIs it packages keeps this run from building x86 twice for
    // nothing; the flavour's abiFilters is what guarantees the contents.
    [['assembleGithubRelease', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'], 'github build failed', 'github APK'],
    // Still built, though nothing here publishes it: F-Droid builds its own
    // from the recipe, and this proves the recipe's flavour compiles at the
    // tag before F-Droid's CI finds out.
    [['assembleFdroidRelease'], 'fdroid build failed', 'fdroid APK'],
  ];
  for (const [args, failed, done] of builds) {
    if (ctx.shadow) {
      ctx.report.skip('B3', `${done} (not rebuilt beside the shell)`, done);
      continue;
    }
    if ((await gradle(args)).code !== 0) ctx.report.stop('B3', failed);
    ctx.report.ok('B3', done);
  }
}

// ── B4 ────────────────────────────────────────────────────────────────
// Ask the artifact what it thinks it is, rather than trusting the stamp.
// ARM only and nothing Google, checked on the artifact because a stray
// dependency or a dropped abiFilters line changes neither the build log
// nor the version — only the thing Obtainium users install.
export async function apkChecks(ctx: Ctx, rel: Release): Promise<void> {
  const aapt = newestBuildTool(ctx, 'aapt2');
  if (!aapt) return;
  const apk = `${ctx.root}/${APK}`;
  const badge = (await ctx.io.exec.run(aapt, ['dump', 'badging', apk])).stdout.split('\n')[0] ?? '';
  if (!has(badge, `versionCode='${rel.code}'`)) ctx.report.stop('B4', `APK reports the wrong versionCode: ${badge}`);
  if (!has(badge, `versionName='${rel.version}'`)) ctx.report.stop('B4', `APK reports the wrong versionName: ${badge}`);
  ctx.report.ok('B4', `APK badging confirms ${rel.version} (${rel.code})`);
  const abis = await apkAbis(ctx, apk);
  if (abis !== ARM_ONLY) {
    ctx.report.stop('B4', `github APK carries ABIs '${abis}', expected arm64-v8a armeabi-v7a`);
  }
  ctx.report.ok('B4', 'github APK is ARM only');
  if (await apkHasGoogleClasses(ctx, apk)) {
    ctx.report.stop('B4', 'github APK contains Google Play Services / Firebase / Play Core classes');
  }
  ctx.report.ok('B4', 'github APK carries no Google Play Services');
}

// ── B5 / B6 ───────────────────────────────────────────────────────────
export async function mac(ctx: Ctx, rel: Release): Promise<string> {
  ctx.report.step('macOS (Catalyst)');
  if (flag(ctx, 'SKIP_CATALYST')) {
    ctx.report.warn('B5', 'skipped: SKIP_CATALYST=1 — nothing built, nothing to sign, nothing to notarize');
    return '';
  }
  if (!ctx.shadow) {
    const [cmd, args] = tsTool(ctx, ['catalyst']);
    const built = await ctx.io.exec.run(cmd, args, { cwd: ctx.root, logFile: CATALYST_LOG });
    if (built.code !== 0) {
      const log = ctx.io.fs.exists(CATALYST_LOG) ? ctx.io.fs.readText(CATALYST_LOG) : '';
      for (const l of log.split('\n').slice(-21)) ctx.report.say(l);
      ctx.report.stop('B5', `catalyst build failed — ${CATALYST_LOG}`);
    }
  }
  const zip = `${ctx.root}/ios/build/catalyst-dist/${zipName(rel.version)}`;
  if (!ctx.io.fs.exists(zip)) ctx.report.stop('B5', `catalyst build produced no ${zip}`);
  ctx.report.ok('B5', zipName(rel.version));
  await inspectZip(ctx, zip);
  return zip;
}

/**
 * B6 — the 2.11.0 check, run on what is about to be PUBLISHED rather than
 * on what happens to be in ios/build. An ad-hoc signature has no team
 * identifier, and without one codesign drops every entitlement — which is
 * invisible to `codesign --verify` and fatal to the widgets.
 */
export async function inspectZip(ctx: Ctx, zip: string): Promise<void> {
  const dir = ctx.io.fs.mkdtemp('mihrab-zip-');
  const app = `${dir}/Mihrab.app`;
  if ((await ctx.io.exec.run('ditto', ['-x', '-k', zip, dir])).code !== 0) {
    ctx.report.stop('B6', `cannot unpack ${zip}`);
  }
  try {
    if (!has(await codesignDetails(ctx, app), `TeamIdentifier=${TEAM}`)) {
      ctx.report.stop(
        'B6',
        'the app about to be published is not signed by the Developer ID — this is the 2.11.0 failure',
      );
    }
    ctx.report.ok('B6', `signed by team ${TEAM}`);
    if (!has(await codesignEntitlements(ctx, app), APP_GROUP)) {
      ctx.report.stop('B6', 'no App Group entitlement — widgets would have no data');
    }
    ctx.report.ok('B6', 'App Group sealed in');
    // NOTARIZED, AND THE TICKET IS IN THE BUNDLE. 2.11.0 through 2.13.3
    // shipped unnotarized. `stapler validate` AND NOT `spctl` on this
    // unpacked copy: assessing a bundle in a temp directory hands it to App
    // Translocation and REGISTERS the translocated path, and the .appex
    // record takes the installed app's widgets with it (2026-08-29).
    if (!(await staplerValidates(ctx, app))) {
      ctx.report.stop(
        'B6',
        'the app about to be published carries no notarization ticket — Gatekeeper would block its first launch, as it has since 2.11.0',
      );
    }
    ctx.report.ok('B6', 'notarized, ticket stapled into the bundle');
  } finally {
    // The shell's `die` exited before this cleanup; the TS always does it,
    // which is what the comment on unregisterAndRemove asks for anyway.
    await unregisterAndRemove(ctx, app, dir);
    // That unregister is by bundle identity and lands late. Without this
    // the release blanks the widgets on the machine cutting it.
    if (!(await keepInstalledWidgetRegistered(ctx))) ctx.report.warn('B6', WIDGET_UNREGISTERED);
  }
}

export async function build(ctx: Ctx, rel: Release): Promise<Built> {
  await stamp(ctx, rel);
  await releaseNotesTable(ctx, rel);
  await android(ctx);
  await apkChecks(ctx, rel);
  const zip = await mac(ctx, rel);
  return { apk: `${ctx.root}/${APK}`, aab: `${ctx.root}/${AAB}`, zip };
}
