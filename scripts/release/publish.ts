/**
 * PHASE 3 — PUBLISH, and what follows it (install, CI, cleanup, the
 * summary). From here nothing can be taken back, so the order is the
 * whole safety mechanism: each step is only reachable because the one
 * before it succeeded — main, then the tag, then the GitHub release, then
 * the tap. Ids U1–U8, I, C in the inventory.
 *
 * Every call that cannot be undone goes through `irreversible()`, which
 * under a dry run only says what it would do. The pure parts — the
 * journal entry, what the commit adds, the bumped cask, which iOS route —
 * are exported on their own, so shadow mode can hold them against what
 * the shell actually did.
 */
import type { Ctx } from './common.ts';
import {
  INSTALLED_APP,
  JDK,
  REPO,
  WIDGET_EXT_ID,
  WIDGET_UNREGISTERED,
  apkName,
  assetUrl,
  env,
  flag,
  gh,
  git,
  has,
  irreversible,
  keepInstalledWidgetRegistered,
  row3,
  shown,
  staplerValidates,
  tapPath,
  zipName,
} from './common.ts';
import { Asc } from './asc.ts';
import type { Built } from './build.ts';
import { REVERT } from './build.ts';
import type { Release } from './preflight.ts';
import { ATTEMPTS, GRADLE, JOURNAL, PBXPROJ } from './preflight.ts';
import { tsTool } from './self.ts';
import * as xc from './xcodeCloud.ts';

// ── U1 — THE JOURNAL ENTRY, WRITTEN INTO THE RELEASE COMMIT ───────────
//
// In the release commit deliberately, not pushed separately afterwards: a
// second push to main starts a second Xcode Cloud run, and a newer run
// CANCELS the one before it — which is how 2.13.0's iOS build was lost.
// It records what is known by now; the `Lesson` line is the human's, and
// the next release is gated on it.

/** This version's aborted attempts, as `.release-attempts.log` holds them. */
export function attemptsFor(log: string, version: string): string[] {
  return log
    .split('\n')
    .filter(l => l.includes(`\t${version}\t`))
    .map(l => l.split('\t')[2] ?? '');
}

/** `sort | uniq -c | sed 's/^ */  - /'`. */
export function countedReasons(reasons: string[]): string[] {
  const sorted = [...reasons].sort();
  const out: Array<[number, string]> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last[1] === r) last[0]++;
    else out.push([1, r]);
  }
  return out.map(([n, r]) => `  - ${n} ${r}`);
}

export function journalEntry(
  rel: Release,
  dateUtc: string,
  attempts: string[],
  cycleTouched: string,
): string {
  let s = `\n## ${rel.version} (${rel.code}) — ${dateUtc}\n\n`;
  if (attempts.length) {
    s += `Took ${attempts.length} aborted attempt(s) before it ran clean:\n\n`;
    s += countedReasons(attempts).map(l => `${l}\n`).join('');
    s += '\n';
  } else {
    s += 'Ran clean on the first attempt.\n\n';
  }
  if (cycleTouched) {
    s += 'Changed the release cycle itself:\n\n';
    s += cycleTouched.split('\n').map(f => `  - \`${f}\`\n`).join('');
    s += '\n**Lesson:** _(unfilled)_\n';
  } else if (attempts.length) {
    s += '**Lesson:** _(unfilled)_\n';
  } else {
    s += '**Lesson:** none needed — clean run, no change to the cycle.\n';
  }
  return s;
}

export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ── U2 ────────────────────────────────────────────────────────────────
// THE WHOLE OF `docs/`, not a list of pages: the version stamp reaches
// fourteen files, and naming them one by one is how 2.15.0 went out with a
// site that said 2.15.0 in English and 2.14.4 everywhere else. And the
// in-app changelog table: left out, the APK is right and the tag wrong,
// and an F-Droid build from the tag ships a changelog one release short.
export const RELEASE_COMMIT_PATHS = [
  GRADLE,
  PBXPROJ,
  'docs',
  'contrib/fdroid/com.prayer_times.yml',
  JOURNAL,
  'fastlane/metadata/android',
  'release-notes',
  'src/polish/releaseNotes.generated.ts',
];
export const commitMessage = (rel: Release) => `Release ${rel.version} (${rel.code})`;
export const tagMessage = (rel: Release) => `Mihrab ${rel.version} (${rel.code})`;

/** A path the release commit may touch: one of the list, or under it. */
export const inReleaseCommit = (f: string) =>
  RELEASE_COMMIT_PATHS.some(p => f === p || f.startsWith(`${p}/`));

// ── U7 ────────────────────────────────────────────────────────────────
/**
 * The cask bumped to `version` and `sha`, as the shell's two seds did it:
 * `version "<old>"` → the new one, and the old sha anywhere → the new.
 * `null` fields say what the seds could not find.
 */
export function bumpCask(
  cask: string,
  oldVersion: string,
  version: string,
  sha: string,
): { text: string; oldSha: string } {
  const oldSha = /sha256 "([a-f0-9]*)"/.exec(cask)?.[1] ?? '';
  let text = cask
    .split('\n')
    .map(l => l.replace(`version "${oldVersion}"`, `version "${version}"`))
    .join('\n');
  if (oldSha) text = text.split('\n').map(l => l.replace(oldSha, sha)).join('\n');
  return { text, oldSha };
}

// ── U8 ────────────────────────────────────────────────────────────────
export type IosRoute = 'skip' | 'local' | 'cloud';
export function iosRoute(ctx: Ctx): IosRoute {
  if (flag(ctx, 'SKIP_APP_STORE')) return 'skip';
  if (flag(ctx, 'IOS_LOCAL')) return 'local';
  return 'cloud';
}

/** What happened to iOS: the shell's XC_STARTED. */
export type IosState = 'skipped' | 'local' | 'cloud' | 'none';

export interface Published {
  releaseSha: string;
  ios: IosState;
}

export async function publish(
  ctx: Ctx,
  rel: Release,
  built: Built,
  cycleTouched: string,
): Promise<Published> {
  const r = ctx.report;
  const fs = ctx.io.fs;

  // ── U1 ── Through `irreversible` like everything below, though a
  // journal line can be taken back: the shell's dry run never gets this
  // far, so a dry run here must not write the entry or make the commit
  // either — a second entry for the same version is what the next run
  // would find.
  r.step('Journal');
  const attemptsFile = `${ctx.root}/${ATTEMPTS}`;
  const attempts = fs.isFile(attemptsFile) ? attemptsFor(fs.readText(attemptsFile), rel.version) : [];
  const entry = journalEntry(rel, utcDate(ctx.io.clock.now()), attempts, cycleTouched);
  await irreversible(
    ctx,
    `append the ${rel.version} entry to ${JOURNAL}`,
    async () => {
      fs.appendText(`${ctx.root}/${JOURNAL}`, entry);
      return true;
    },
    true,
  );
  r.ok('U1', 'docs/release-log.md updated');

  // ── U2 ──
  r.step('Publishing');
  await irreversible(
    ctx,
    `commit "${commitMessage(rel)}"`,
    async () => {
      if ((await shown(ctx, git(ctx, ['add', ...RELEASE_COMMIT_PATHS]))).code !== 0) r.stop('U2', 'git add failed');
      if ((await shown(ctx, git(ctx, ['commit', '-q', '-m', commitMessage(rel)]))).code !== 0) {
        r.stop('U2', 'commit failed');
      }
      return true;
    },
    true,
  );
  r.ok('U2', 'committed');
  // THE COMMIT iOS IS CUT FROM, named here and nowhere else. The shell once
  // read `$RELEASE_SHA` without anything setting it, and under `set -u`
  // every release since that line took the local iOS route (2.19.0).
  const releaseSha = (await git(ctx, ['rev-parse', 'HEAD'])).stdout.trim();

  const x: xc.XcCtx = {
    asc: new Asc(ctx.io, ctx.home),
    io: ctx.io,
    root: ctx.root,
    say: l => r.say(l),
  };

  // ── U3 ── A SKIP HAS TO BE ACTED ON BEFORE THE PUSH, because the push is
  // what starts the run. Decided at the App Store step, it would skip this
  // tool's own upload while Xcode Cloud built and uploaded anyway — the
  // opposite of what someone sets it for (2.20.0).
  if (flag(ctx, 'SKIP_APP_STORE')) {
    const paused = await irreversible(
      ctx,
      'pause the Xcode Cloud workflow',
      async () => {
        try {
          return (await xc.pause({ ...x, say: () => undefined })) === 0;
        } catch {
          return false;
        }
      },
      true,
    );
    if (!paused) r.warn('U3', 'could not pause Xcode Cloud — this push may start a run anyway');
    r.ok('U3', 'Xcode Cloud paused — this push starts nothing');
  }

  // ── U4 ── MAIN BEFORE THE TAG, always. A tag pushed while main is still
  // local names a commit nobody else can see, and a pushed tag is never
  // moved here. A MIXED reset in the recovery, not --soft: --soft left the
  // stamps staged, REVERT restores from the index and put them straight
  // back, and the rerun died on "tracked changes" (2.25.1).
  const pushedMain = await irreversible(
    ctx,
    'push main to origin',
    async () => (await shown(ctx, git(ctx, ['push', '-q', 'origin', 'main']))).code === 0,
    true,
  );
  if (!pushedMain) {
    r.stop(
      'U4',
      `push to main failed — nothing tagged, nothing published.
    Undo the local release commit and the stamps, rebase, then rerun:
      git reset -q HEAD~1 && ${REVERT} && git pull --rebase -q origin main`,
    );
  }
  r.ok('U4', 'main pushed');

  // ── U5 ──
  const tagged = await irreversible(
    ctx,
    `tag ${rel.tag} "${tagMessage(rel)}"`,
    async () => (await shown(ctx, git(ctx, ['tag', '-a', rel.tag, '-m', tagMessage(rel)]))).code === 0,
    true,
  );
  if (!tagged) r.stop('U5', 'tag failed');
  const pushedTag = await irreversible(
    ctx,
    `push ${rel.tag} to origin`,
    async () => (await shown(ctx, git(ctx, ['push', '-q', 'origin', rel.tag]))).code === 0,
    true,
  );
  if (!pushedTag) r.stop('U5', 'tag push failed — main is pushed, so rerunning after a fix is safe');
  r.ok('U5', `${rel.tag} pushed`);

  // ── U6 ── THE ASSET IS NAMED BY ITS FILENAME. `gh release create
  // file#Label` sets a display LABEL, not the asset name; uploading
  // Gradle's output directly would publish `app-github-release.apk` and
  // every download URL anyone has ever been given would 404.
  const stage = fs.mkdtemp('mihrab-stage-');
  fs.copy(built.apk, `${stage}/${apkName(rel.version)}`);
  const assets = [`${stage}/${apkName(rel.version)}`];
  if (built.zip) {
    fs.copy(built.zip, `${stage}/${zipName(rel.version)}`);
    assets.push(`${stage}/${zipName(rel.version)}`);
  }
  const notes = env(ctx, 'RELEASE_NOTES');
  const notesArgs = notes && fs.isFile(notes) ? ['--notes-file', notes] : ['--generate-notes'];
  const created = await irreversible(
    ctx,
    `create the GitHub release ${rel.tag} with ${assets.map(a => a.slice(a.lastIndexOf('/') + 1)).join(', ')}`,
    async () =>
      (await shown(ctx, gh(ctx, ['release', 'create', rel.tag, '-R', REPO, '--title', `Mihrab ${rel.version}`, ...notesArgs, '--latest', ...assets]))).code === 0,
    true,
  );
  if (!created) {
    // 2.23.0's lesson: `gh` creates, then uploads, then publishes, so a
    // stalled upload leaves a DRAFT with a partial asset — and "gh release
    // failed" alone invited starting over against it. Say what it left.
    r.stop(
      'U6',
      `gh release failed — it creates, then uploads, then publishes, so ${rel.tag} may now be a DRAFT with a partial asset.
    Look before retrying: gh release view ${rel.tag} -R ${REPO}
    Upload what is missing with gh release upload ${rel.tag} <file> -R ${REPO} --clobber, then
    gh release edit ${rel.tag} -R ${REPO} --draft=false --latest — do not create it again.`,
    );
  }
  if (notesArgs[0] === '--generate-notes') {
    r.say('  (generated notes — set RELEASE_NOTES=/path/to/notes.md to write your own)');
  }
  fs.rm(stage);
  // Ask GitHub what it actually published, rather than assuming the upload
  // meant what we meant.
  const published = ctx.dryRun
    ? assets.map(a => a.slice(a.lastIndexOf('/') + 1)).join('\n')
    : (await gh(ctx, ['release', 'view', rel.tag, '-R', REPO, '--json', 'assets', '--jq', '.assets[].name'])).stdout;
  if (!has(published, apkName(rel.version))) r.stop('U6', `the APK published under the wrong name: ${published}`);
  if (built.zip) {
    if (!has(published, zipName(rel.version))) {
      r.stop('U6', `the macOS zip published under the wrong name: ${published}`);
    }
    r.ok('U6', 'GitHub release published, both assets named correctly');
  } else {
    r.ok('U6', 'GitHub release published (APK only — SKIP_CATALYST=1)');
  }

  // ── U7 ── The cask is bumped against the sha of the zip AS PUBLISHED,
  // downloaded back from the release. They came apart once and `brew
  // install` served a zip whose checksum the cask rejected.
  r.step('Homebrew tap');
  if (!built.zip) {
    // NOT bumped, deliberately: a cask naming a version whose release has
    // no zip would 404 on every `brew install` — worse than a Mac one
    // version behind, which is merely out of date and still installs.
    r.warn('U7', 'skipped: SKIP_CATALYST=1 — cask left at its current version, which still has a zip');
    r.warn('U7', '  bump it by hand once a Mac build exists, or cut a Mac-only release then');
  } else {
    await bumpTap(ctx, rel);
  }

  // ── U8 ──
  const ios = await appStore(ctx, x, releaseSha);
  return { releaseSha, ios };
}

async function bumpTap(ctx: Ctx, rel: Release): Promise<void> {
  const r = ctx.report;
  const fs = ctx.io.fs;
  const tap = tapPath(ctx.home);
  let sha = '';
  if (ctx.dryRun) {
    sha = '0'.repeat(64);
  } else {
    const tmp = `${fs.mkdtemp('mihrab-tapzip-')}/zip`;
    const got = await ctx.io.http.download(assetUrl(rel.tag, zipName(rel.version)), tmp);
    if (got.status < 200 || got.status >= 300) r.stop('U7', 'cannot download the published zip');
    sha = fs.sha256(tmp);
    fs.rm(tmp.slice(0, tmp.lastIndexOf('/')));
  }
  const { text, oldSha } = bumpCask(fs.readText(tap), rel.oldVersion, rel.version, sha);
  if (!oldSha) r.stop('U7', "cannot read the cask's current sha256");
  // The cask's version is whatever SHIPPED last, which is not necessarily
  // this repo's previous version — a release abandoned between the tag and
  // the tap leaves them apart, and then the sed matches nothing and pushes
  // a stale cask that says the old version with the new sha.
  if (!has(text, `version "${rel.version}"`)) {
    r.stop('U7', `the cask still does not say ${rel.version} — it was on ${rel.oldVersion}? edit ${tap} by hand`);
  }
  if (!has(text, `sha256 "${sha}"`)) r.stop('U7', `the cask sha did not update — edit ${tap} by hand`);
  const tapRepo = tap.slice(0, tap.lastIndexOf('/Casks/'));
  const pushed = await irreversible(
    ctx,
    `commit "mihrab ${rel.version}" in the tap and push it`,
    async () => {
      fs.writeText(tap, text);
      for (const a of [['add', 'Casks/mihrab.rb'], ['commit', '-q', '-m', `mihrab ${rel.version}`], ['push', '-q', 'origin', 'HEAD']]) {
        if ((await shown(ctx, git(ctx, a, { cwd: tapRepo }))).code !== 0) return false;
      }
      return true;
    },
    true,
  );
  if (!pushed) r.stop('U7', 'tap push failed — run verify-release.sh and fix the cask by hand');
  r.ok('U7', 'cask at ' + rel.version + ', sha matches the published zip');
}

// ── U8 — THE APP STORE BUILD ──────────────────────────────────────────
//
// Nothing in this step stops the release: everything before it is public,
// and Apple refusing to start a run is a thing to retry rather than a
// release to unwind. The exact retry is printed at the end.
//
// SKIP_APP_STORE=1 — sometimes the date is the problem, not Apple: a
// submission window, a review in flight. Nothing is sent, the workflow
// was paused before the push, and the summary prints how to build THE TAG.
//
// Otherwise the push's own run is waited for (`ensure`), and one is
// started only if the trigger did not fire (2026-08-07) — never beside a
// live one, which kills both (2026-08-26). When Xcode Cloud will not
// (2026-09-11: HTTP 500 for an hour), the local route builds here, unless
// NO_IOS_LOCAL=1; IOS_LOCAL=1 asks for it outright. It costs fifteen to
// twenty-five minutes and, the first time a new certificate is used, a
// keychain prompt that blocks until someone clicks Always Allow. Green
// there means the build shipped, not that the cloud is well.
async function appStore(ctx: Ctx, x: xc.XcCtx, releaseSha: string): Promise<IosState> {
  const r = ctx.report;
  r.step('App Store build');
  const local = async (): Promise<IosState> => {
    r.step('App Store build — locally, on this Mac');
    const [cmd, args] = tsTool(ctx, ['ios-appstore']);
    const ok = await irreversible(
      ctx,
      'archive iOS here and upload it to App Store Connect',
      async () => (await ctx.io.exec.run(cmd, args, { cwd: ctx.root, stream: true })).code === 0,
      true,
    );
    if (ok) {
      r.ok('U8', 'iOS uploaded from this Mac — App Store Connect has the build');
      // The verifier asks Xcode Cloud whether iOS shipped, and Xcode Cloud
      // has never heard of this upload. Tell it, or it fails a release
      // that is fine (2.24.0, 2.24.1).
      ctx.io.env.IOS_LOCAL_UPLOAD = '1';
      return 'local';
    }
    r.warn('U8', 'the local iOS build failed too — iOS has not shipped');
    return 'none';
  };
  switch (iosRoute(ctx)) {
    case 'skip':
      r.ok('U8', 'skipped: SKIP_APP_STORE=1 — nothing sent to App Store Connect');
      return 'skipped';
    case 'local':
      r.ok('U8', 'IOS_LOCAL=1 — building iOS here rather than in the cloud');
      return local();
    case 'cloud': {
      const said: string[] = [];
      let code = 2;
      try {
        code = ctx.dryRun ? 0 : await xc.ensure({ ...x, say: l => said.push(l) }, releaseSha);
      } catch (e) {
        said.push(e instanceof Error ? e.message : String(e));
        code = 2;
      }
      if (ctx.dryRun) ctx.wouldDo.push(`wait for the Xcode Cloud run on ${releaseSha.slice(0, 8)}`);
      if (code === 0) {
        r.ok('U8', said.join('\n') || `run for ${releaseSha.slice(0, 8)}`);
        return 'cloud';
      }
      for (const l of said) r.sayErr(`      ${l}`);
      r.warn('U8', 'Xcode Cloud has no run for this release');
      if (flag(ctx, 'NO_IOS_LOCAL')) {
        r.warn('U8', 'NO_IOS_LOCAL=1 — not falling back to the local build');
        return 'none';
      }
      r.warn('U8', 'falling back to the local route (NO_IOS_LOCAL=1 disables this)');
      return local();
    }
  }
}

// ── I — BE A USER. Install what was just published, the way they do. ──
//
// Every macOS failure this project has shipped was invisible from the
// release machine because it never installs the release; the thing that
// breaks only happens on a Mac that UPGRADES (read 2.13.4's lesson). It
// would have caught the widgets removed on every upgrade, eight releases
// unnotarised (Homebrew quarantines what it installs), a bad sha, a
// postflight that no longer runs. `brew update` first because Homebrew
// reads its own clone of the tap, not ours.
export async function installAsUser(ctx: Ctx, rel: Release): Promise<void> {
  const r = ctx.report;
  r.step('Installing it the way a user does');
  if ((await ctx.io.exec.run('/bin/sh', ['-c', 'command -v brew'])).code !== 0) {
    r.warn('I', 'no brew on this machine — the published cask was not installed, so nothing here has been through a real user install');
    return;
  }
  const log = '/tmp/release-brew.log';
  await ctx.io.exec.run('brew', ['update', '--quiet']);
  const tail = () => {
    for (const l of ctx.io.fs.readText(log).split('\n').slice(-21)) r.say(l);
  };
  // `brew upgrade` EXITS 0 AND DOES NOTHING when the version is already
  // installed — and then every assertion below passes on a machine that
  // installed nothing and ran no postflight. It happens the moment anyone
  // re-runs this, which is when a green tick is most misleading.
  const up = await ctx.io.exec.run('brew', ['upgrade', '--cask', 'mihrab'], { logFile: log });
  if (up.code !== 0) {
    tail();
    r.stop('I', `the published cask does not install — see ${log}`);
  }
  if (has(ctx.io.fs.readText(log), 'Not upgrading')) {
    const re = await ctx.io.exec.run('brew', ['reinstall', '--cask', 'mihrab'], { logFile: log, appendLog: true });
    if (re.code !== 0) {
      tail();
      r.stop('I', `the published cask does not install — see ${log}`);
    }
  }
  const installed = (
    await ctx.io.exec.run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', `${INSTALLED_APP}/Contents/Info.plist`])
  ).stdout.trim();
  if (installed !== rel.version) {
    r.stop('I', `brew installed ${installed}, not ${rel.version} — the cask or the tap is stale`);
  }
  r.ok('I', `installed ${rel.version} from the published cask`);
  if (!(await staplerValidates(ctx, INSTALLED_APP))) {
    r.stop('I', 'the installed copy has no notarization ticket — Gatekeeper will block it');
  }
  r.ok('I', 'Gatekeeper: notarized, ticket stapled');
  // No launch anywhere above. If this is registered, the cask's postflight
  // did it — the whole widget fix, proven on a real install.
  if (!(await ctx.io.exec.run('pluginkit', ['-m', '-i', WIDGET_EXT_ID])).stdout.trim()) {
    r.stop(
      'I',
      `the widget extension is NOT registered after a real install — the cask postflight did not do its job, and every Mac upgrading to ${rel.version} loses its widgets`,
    );
  }
  r.ok('I', 'widget extension registered by the cask, with no launch');
}

// ── C — THE RELEASE COMMIT'S OWN CI. Waited for, not left to a mail. ──
//
// Verification asks too, but seconds after the tag push, when the run does
// not exist yet — which is how five consecutive releases went red with
// only a mail to say so. 40 × 15 s: longer than ci.yml has ever taken,
// short enough that a stuck queue does not hold the console hostage. Red
// is a warning, never a rollback: the tag is public and never moved, and
// the preflight gate is what makes the recovery happen (forward).
export type CiState = 'green' | 'red' | 'unknown';
export async function ciOnRelease(ctx: Ctx, sha: string): Promise<{ state: CiState; url: string }> {
  const r = ctx.report;
  r.step('CI on the release commit');
  let row = '';
  for (let i = 0; i < 40; i++) {
    const tryRow = (
      await gh(ctx, [
        'run', 'list', '--workflow=ci.yml', '--commit', sha, '-R', REPO, '--limit', '1',
        '--json', 'status,conclusion,url',
        '--jq', '.[0] // empty | "\\(.status)|\\(.conclusion)|\\(.url)"',
      ])
    ).stdout.trim();
    if (tryRow && row3(tryRow)[0] === 'completed') {
      row = tryRow;
      break;
    }
    await ctx.io.clock.sleep(15_000);
  }
  let url = `https://github.com/${REPO}/actions?query=branch%3Amain`;
  if (!row) {
    r.warn('C', 'CI has not finished within ten minutes — read it before cutting anything else:');
    r.warn('C', `  gh run list --workflow=ci.yml --commit ${sha}`);
    return { state: 'unknown', url };
  }
  const [, conclusion, runUrl] = row3(row);
  url = runUrl;
  if (conclusion === 'success') {
    r.ok('C', 'CI is green on the release commit');
    return { state: 'green', url };
  }
  r.warn('C', `CI concluded '${conclusion}' on the release commit ${sha}`);
  return { state: 'red', url };
}

// ── PUT THE MACHINE BACK THE WAY IT WAS FOUND ─────────────────────────
//
// A release starts long-lived things and used to stop none of them: hours
// after 2.13.4, a Gradle daemon holding 2 GB, seven orphaned jest workers,
// Metro — and a widget extension running out of a bundle build-catalyst
// had already deleted, a live widget provider answering from a path
// nothing else agrees with. EVERYTHING NAMED HERE BELONGS TO THIS REPO:
// scoped to the root — no `killall java`, no `pkill node`.
export async function cleanup(ctx: Ctx): Promise<void> {
  const r = ctx.report;
  r.step('Cleanup');
  const reap = async (what: string, pattern: string) => {
    // `pgrep` exits 1 when it matches nothing — the ordinary case. The
    // shell had to write `|| true` inside the substitution, or `pipefail`
    // ended the release at the first pattern that found nothing (caught
    // against a decoy). Here an empty answer is simply an empty answer.
    const pids = (await ctx.io.exec.run('pgrep', ['-f', pattern])).stdout.split('\n').filter(Boolean);
    if (!pids.length) return;
    await ctx.io.exec.run('kill', pids);
    await ctx.io.clock.sleep(1000);
    await ctx.io.exec.run('kill', ['-9', ...pids]);
    r.ok('cleanup', `stopped ${what} (${pids.join(' ')})`);
  };
  await reap('the app and widget extension left running from ios/build', `${ctx.root}/ios/build/.*Mihrab\\.app/Contents`);
  await reap('orphaned jest workers', `${ctx.root}/node_modules/jest-worker`);
  await reap('the Metro dev server for this repo', `${ctx.root}/node_modules/.bin/react-native start`);
  if (ctx.io.fs.isExecutable(`${ctx.root}/android/gradlew`)) {
    const stopped = await ctx.io.exec.run(`${ctx.root}/android/gradlew`, ['--stop'], { env: { JAVA_HOME: JDK } });
    if (has(stopped.stdout, 'Daemon')) r.ok('cleanup', 'stopped the Gradle daemon');
  }
  // Last word on the way out: whatever else this run did to
  // LaunchServices, the widgets on this Mac work when it finishes.
  if (!(await keepInstalledWidgetRegistered(ctx))) r.warn('cleanup', WIDGET_UNREGISTERED);
  r.ok('cleanup', "nothing of this release's is still running");
}

/** The closing lines: what is live, and what is still a person's to do. */
export function summary(rel: Release, built: Built, ios: IosState, ci: { state: CiState; url: string }): string[] {
  const out: string[] = [''];
  if (ci.state === 'red') {
    out.push(`\u001b[1m${rel.version} (${rel.code}) is live — and its own commit fails CI.\u001b[0m`);
    out.push(`
  ${ci.url}

  Nothing to undo: the tag is public and a pushed tag is never moved here,
  so ${rel.tag} stays red for ever. Fix it forward on main. The next release
  will refuse to start until you do — that is the preflight gate, and it
  is the reason this is a ⚠ and not a rollback.
`);
  } else {
    out.push(`\u001b[1m${rel.version} (${rel.code}) is live on GitHub, Homebrew and the F-Droid recipe.\u001b[0m`);
  }
  let note: string;
  if (ios === 'skipped') {
    note = `NOT BUILT, on purpose (SKIP_APP_STORE=1). Nothing was
              sent to App Store Connect, and the workflow was paused before
              the push so it started nothing either. When the hold lifts,
              build this tag — not main, which will have moved:
                git checkout ${rel.tag}
                ./scripts/xcode-cloud.py resume && ./scripts/xcode-cloud.py start; ./scripts/xcode-cloud.py pause`;
  } else if (ios === 'cloud') {
    note = `building now — submit it in App Store Connect when it
              lands.  ./scripts/xcode-cloud.py runs 3`;
  } else if (ios === 'local') {
    note = `UPLOADED FROM THIS MAC, not Xcode Cloud. The build is
              already in App Store Connect — submit it there when
              processing finishes. The push to main will have started a
              cloud run too, and its build lands beside this one under a
              different number — check which you are submitting:
                ./scripts/xcode-cloud.py runs 3
              Note that a local export signs against profiles already on
              this Mac, so this says the build shipped, not that a clean
              cloud build is green.`;
  } else {
    note = `NOT BUILDING. Apple refused to start the run and the
              local fallback did not ship it either (see above). Retry
              either route:
                ./scripts/xcode-cloud.py start
                ./scripts/build-ios-appstore.sh`;
  }
  out.push(`
  Still yours to do — both need a human at a console:

    Play      upload ${built.aab}
              (release notes for this build are already in the repo)

    App Store ${note}
              Leave main alone until that run finishes — the next push
              cancels it, and iOS then ships the newer commit, not the
              tag. Every push to main starts one, which is the reason
              nothing but a release is pushed there: each run posts a
              PUBLIC commit status, and a cancelled one is a red X on a
              commit that deserves none. See docs/DISTRIBUTION.md.
`);
  return out;
}
