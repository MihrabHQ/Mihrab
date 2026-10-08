/**
 * PHASE 1 — PREFLIGHT. Nothing is written. Everything that can say no says
 * it here, while stopping costs nothing but the time already spent.
 *
 * The port of release.sh from "Preflight" to "What this ships". Every gate
 * is its own function over a `Ctx`, in the shell's order, with the
 * shell's words: shadow mode compares these lines with the shell's own.
 * Ids are the inventory's (P1–P12) in docs/rewrite-plan.md.
 *
 * THE ONE RULE the whole release is built around: everything that can fail
 * happens BEFORE anything that cannot be undone.
 */
import { resolveCatalystToolchain } from './toolchain.ts';
import type { Ctx } from './common.ts';
import {
  PLAY_LOCALES,
  PLAY_NOTE_LIMIT,
  charCount,
  flag,
  gh,
  git,
  gradleCode,
  gradleVersion,
  has,
  row3,
  shown,
  tapPath,
} from './common.ts';
import { Asc } from './asc.ts';
import * as xc from './xcodeCloud.ts';

export interface Release {
  version: string;
  tag: string;
  oldVersion: string;
  oldCode: number;
  code: number;
}

export const GRADLE = 'android/app/build.gradle';
export const PBXPROJ = 'ios/PrayerApp.xcodeproj/project.pbxproj';
export const JOURNAL = 'docs/release-log.md';
export const ATTEMPTS = '.release-attempts.log';

// The files that ARE the release cycle. A release that changes one of
// these is a release that changed how releasing works, and the next person
// through deserves to know what it taught you. NOT fastlane/ — those are
// the release NOTES, which change every time by definition, and a signal
// that is always on is not a signal. The same list as release.sh's.
export const CYCLE_PATHS = [
  'scripts/release.sh',
  'scripts/verify-release.sh',
  'scripts/build-catalyst.sh',
  'scripts/build-ios-appstore.sh',
  'scripts/sync-version.js',
  'scripts/xcode-cloud.py',
  'scripts/release',
  '.github/workflows',
  'docs/DISTRIBUTION.md',
];

export function readRelease(ctx: Ctx, version: string): Release {
  const gradle = ctx.io.fs.readText(`${ctx.root}/${GRADLE}`);
  const oldCode = gradleCode(gradle);
  return {
    version,
    tag: `v${version}`,
    oldVersion: gradleVersion(gradle),
    oldCode,
    code: oldCode + 1,
  };
}

export const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

// ── --unreleased ──────────────────────────────────────────────────────
//
// The question that went unasked for days at a time. A fix that is merged
// and not shipped is, from the outside, a fix that was never made.
export async function showUnreleased(ctx: Ctx): Promise<void> {
  const r = ctx.report;
  // Not beside the shell: shadow mode writes nothing, remote-tracking refs
  // included, and the shell fetched origin at P4 seconds ago. (It prints
  // nothing there either; only the cycle files it returns are used.)
  if (!ctx.shadow) await git(ctx, ['fetch', '--quiet', '--tags', 'origin']);
  const last = (await git(ctx, ['describe', '--tags', '--abbrev=0', '--match', 'v*'])).stdout.trim();
  if (!last) {
    r.bold('No release tag found — everything on main is unreleased.');
    return;
  }
  const count = await git(ctx, ['rev-list', '--count', `${last}..main`]);
  const n = count.code === 0 ? count.stdout.trim() : '0';
  if (n === '0') {
    r.bold(`main is ${last}. Nothing unreleased.`);
    return;
  }
  r.bold(`${n} commit(s) on main since ${last} — released to nobody:`);
  const log = await git(ctx, ['log', '--oneline', '--no-decorate', `${last}..main`]);
  for (const line of log.stdout.split('\n').filter(Boolean)) r.say(`  ${line}`);
  // The version in the tree, NOT the shipped one — they differ exactly
  // when a bump is sitting uncommitted, which is worth seeing.
  const gradle = ctx.io.fs.readText(`${ctx.root}/${GRADLE}`);
  r.say(`\nLast tag ${last}.  Working tree says ${gradleVersion(gradle)} (${gradleCode(gradle)}).`);
}

// ── P1 ────────────────────────────────────────────────────────────────
export async function toolsPresent(ctx: Ctx): Promise<void> {
  for (const tool of ['gh', 'git', 'node', 'python3']) {
    const r = await ctx.io.exec.run('/bin/sh', ['-c', `command -v ${tool}`]);
    if (r.code !== 0) ctx.report.stop('P1', `${tool} is not installed`);
  }
  ctx.report.ok('P1', 'tools present');
}

// ── P2 — A WORKING XCODE FOR THE MAC, ASKED FOR IN PREFLIGHT ──────────
//
// 2.22.0 found out it had none at the Catalyst step, after the whole
// Android build — five minutes spent to learn something knowable in one
// second, and a stamped tree to revert. Any Xcode that runs will do since
// the Mac left its Xcode 26 pin (2026-09-29), or the one
// CATALYST_DEVELOPER_DIR names.
export async function catalystToolchain(ctx: Ctx): Promise<void> {
  if (flag(ctx, 'SKIP_CATALYST')) return;
  const t = await resolveCatalystToolchain(ctx);
  if (!t.ok) {
    for (const l of t.lines) ctx.report.sayErr(`    ${l}`);
    ctx.report.stop('P2', 'no working Xcode for the Catalyst build — see above');
  }
  ctx.report.ok('P2', t.lines[0].replace(/^▸ /, ''));
}

// ── P3 ────────────────────────────────────────────────────────────────
export async function onMainAndClean(ctx: Ctx): Promise<void> {
  const branch = (await git(ctx, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  if (branch !== 'main') ctx.report.stop('P3', 'not on main');
  // Untracked files are the author's business; STAGED or MODIFIED tracked
  // files are not, because the release commit would sweep them up.
  const status = (await git(ctx, ['status', '--porcelain', '--untracked-files=no'])).stdout;
  if (status.trim()) {
    const short = (await git(ctx, ['status', '--short', '--untracked-files=no'])).stdout;
    for (const l of short.split('\n').filter(Boolean)) ctx.report.say(`    ${l}`);
    ctx.report.stop('P3', 'working tree has tracked changes — commit or stash them first');
  }
  ctx.report.ok('P3', 'on main, tracked files clean');
}

// ── P4 ────────────────────────────────────────────────────────────────
// The dataset bot pushes on its own schedule; 2.19.0, 2.21.0, 2.24.0 and
// 2.27.0 each stopped here once, correctly. Fetch and pull BEFORE starting.
//
// Beside the shell, which has just fetched, the TS does not fetch again:
// shadow mode writes nothing, remote-tracking refs included. It asks
// whether origin answers with `ls-remote`, which writes nothing, and
// reads origin/main as the shell's fetch left it.
export async function notBehindOrigin(ctx: Ctx): Promise<void> {
  const reached = ctx.shadow
    ? await git(ctx, ['ls-remote', '--quiet', 'origin', 'refs/heads/main'])
    : await shown(ctx, git(ctx, ['fetch', '--quiet', 'origin']));
  if (reached.code !== 0) ctx.report.stop('P4', 'cannot reach origin');
  const behind = await git(ctx, ['rev-list', 'main..origin/main']);
  if (behind.code === 0 && behind.stdout.trim()) {
    ctx.report.stop('P4', 'origin/main has commits main does not — pull first');
  }
  ctx.report.ok('P4', 'main is not behind origin');
}

// ── P5 ────────────────────────────────────────────────────────────────
// A pushed tag is never moved in this project, so a tag that already
// exists is a hard stop rather than something to force past. Captured,
// then tested: the shell's pipe into `grep -q` once read "found" as "not
// found" (see `has`).
export async function tagFree(ctx: Ctx, rel: Release): Promise<void> {
  if ((await git(ctx, ['rev-parse', rel.tag])).code === 0) {
    ctx.report.stop('P5', `tag ${rel.tag} already exists locally`);
  }
  const remote = (await git(ctx, ['ls-remote', '--tags', 'origin', `refs/tags/${rel.tag}`])).stdout;
  if (has(remote, rel.tag)) {
    ctx.report.stop('P5', `tag ${rel.tag} already exists on origin — pick the next version`);
  }
  ctx.report.ok('P5', `${rel.tag} is free`);
}

// ── P6 ────────────────────────────────────────────────────────────────
export function versionMoves(ctx: Ctx, rel: Release): void {
  if (rel.version === rel.oldVersion) ctx.report.stop('P6', `version is already ${rel.version}`);
  ctx.report.ok('P6', `version moves ${rel.oldVersion} → ${rel.version}`);
}

// ── P7 ────────────────────────────────────────────────────────────────
// Play's limit, checked BEFORE the tag rather than after. 2.13.0 went out
// with all three locales over it and the gate caught it only once the
// release was already public; 2.26.0 stopped here on a Swedish note of 503
// characters where the English fitted — count the longest language.
export function playNotes(ctx: Ctx, rel: Release): void {
  for (const loc of PLAY_LOCALES) {
    const note = `${ctx.root}/fastlane/metadata/android/${loc}/changelogs/${rel.code}.txt`;
    if (!ctx.io.fs.isFile(note)) {
      ctx.report.stop('P7', `missing release notes: ${loc}/changelogs/${rel.code}.txt`);
    }
    const chars = charCount(ctx.io.fs.readText(note));
    if (chars > PLAY_NOTE_LIMIT) {
      ctx.report.stop(
        'P7',
        `${loc}/changelogs/${rel.code}.txt is ${chars} characters — Play's limit is ${PLAY_NOTE_LIMIT}`,
      );
    }
    ctx.report.ok('P7', `release notes for ${loc} (${chars} chars)`);
  }
}

// ── P7b — THE IN-APP NOTE ─────────────────────────────────────────────
// Play's 500 characters name the headline changes and leave the rest out,
// and the app's "What's new" was built from them alone — so for 77 releases
// a reader could not find most of what had changed. The app now reads
// release-notes/<locale>/<code>.txt first, with no length limit; English is
// the one a release cannot go without, because every language falls back
// to it. Swedish and Arabic fall back to their Play notes when missing.
export function appNotes(ctx: Ctx, rel: Release): void {
  const note = `${ctx.root}/release-notes/en/${rel.code}.txt`;
  if (!ctx.io.fs.isFile(note) || ctx.io.fs.readText(note).trim() === '') {
    ctx.report.stop('P7', `missing in-app release notes: release-notes/en/${rel.code}.txt`);
  }
  ctx.report.ok('P7', `in-app release notes for en`);
}

// ── P8 — THE CASK ─────────────────────────────────────────────────────
//
// The cask is the only code that runs when a Mac replaces the app: it is
// what stops the widgets freezing on upgrade (chronod) and, since
// 2026-08-29, what stops them being removed outright (pluginkit).
//
// The widget re-registration MUST run UNSANDBOXED. Homebrew 7's
// `postflight_steps` DSL runs its `run` step inside the install sandbox,
// where `pluginkit -a` fails and the extension is never registered —
// measured live 2026-09-14: every upgrading Mac lost its widgets. A bare
// "postflight" check passed `postflight_steps`, so the legacy `postflight
// do` block is REQUIRED by name and the steps form is rejected. Anchored
// at the line start, so a comment that merely mentions the words cannot
// trip either check.
export const POSTFLIGHT_STEPS = /^[ \t]*postflight_steps/m;
export const POSTFLIGHT_DO = /^[ \t]*postflight do/m;

export const caskRestartsChronod = (cask: string) =>
  POSTFLIGHT_DO.test(cask) && has(cask, 'chronod');

export function caskGate(ctx: Ctx, rel: Release): void {
  const tap = tapPath(ctx.home);
  if (flag(ctx, 'SKIP_CATALYST')) {
    ctx.report.warn('P8', 'SKIP_CATALYST=1 — no Mac build, no Mac asset, no cask bump');
    ctx.report.warn('P8', '  Mac users stay on whatever the cask says today; only Android and iOS move');
    return;
  }
  if (!ctx.io.fs.isFile(tap)) ctx.report.stop('P8', `cask not found at ${tap} — clone the tap before releasing`);
  const cask = ctx.io.fs.readText(tap);
  if (POSTFLIGHT_STEPS.test(cask)) {
    ctx.report.stop(
      'P8',
      `cask uses postflight_steps — its sandboxed run step cannot register the widget extension (pluginkit -a fails), so every Mac upgrading to ${rel.tag} LOSES its widgets. Keep the legacy 'postflight do' block. See docs/release/catalyst-widgets.md.`,
    );
  }
  if (!caskRestartsChronod(cask)) {
    ctx.report.stop('P8', `cask has no chronod postflight — Macs upgrading to ${rel.tag} would freeze their widgets`);
  }
  ctx.report.ok('P8', 'cask restarts chronod after install (legacy, unsandboxed postflight)');
  if (!has(cask, 'pluginkit')) {
    ctx.report.stop(
      'P8',
      `cask does not re-register the widget extension — Macs upgrading to ${rel.tag} would LOSE their widgets`,
    );
  }
  ctx.report.ok('P8', 'cask re-registers the widget extension');
}

// ── P9 — THE LAST RELEASE'S LESSON MUST BE WRITTEN ────────────────────
//
// The self-improvement step, and a gate rather than a reminder because
// reminders about process are the first thing a hurried release skips. A
// release that changed the cycle, or had to be restarted, leaves a
// `**Lesson:**` line unfilled, and the NEXT release will not start until
// it says something. ANCHORED: the journal quotes the marker in its own
// header, so a substring test matched the documentation and would have
// blocked every release for ever. Only a whole line counts.
export const UNFILLED = '**Lesson:** _(unfilled)_';

/** The unfilled entry's lines (heading to marker), or null. */
export function unfilledLesson(journal: string): string[] | null {
  const lines = journal.split('\n');
  let marker = -1;
  lines.forEach((l, i) => {
    if (l === UNFILLED) marker = i;
  });
  if (marker < 0) return null;
  let head = 0;
  for (let i = 0; i <= marker; i++) if (lines[i].startsWith('## ')) head = i;
  return lines.slice(head, marker + 1);
}

export function lessonGate(ctx: Ctx): void {
  const file = `${ctx.root}/${JOURNAL}`;
  if (ctx.io.fs.isFile(file)) {
    const entry = unfilledLesson(ctx.io.fs.readText(file));
    if (entry) {
      ctx.report.say('');
      for (const l of entry) ctx.report.say(`    ${l}`);
      ctx.report.stop(
        'P9',
        "the last release left its lesson unwritten — fill in that '**Lesson:**' line in docs/release-log.md, commit it, and rerun",
      );
    }
  }
  ctx.report.ok('P9', "the last release's lesson is written down");
}

// ── P10 — CI ON MAIN IS NOT ALREADY RED ───────────────────────────────
//
// Local jest and tsc are not CI: CI runs on a clean Linux checkout with a
// fresh install, and it is the copy everyone else reads. It went unasked
// long enough to hide four consecutive red builds (2.13.1 on). The LAST
// COMPLETED run, not the newest — the newest is usually in flight on the
// commit being released from, and "in progress" is not a verdict. No runs
// at all is a fresh clone, not a broken build.
export async function ciOnMain(ctx: Ctx): Promise<void> {
  const r = await gh(ctx, [
    'run', 'list', '--workflow=ci.yml', '--branch', 'main', '--status', 'completed', '--limit', '1',
    '--json', 'conclusion,displayTitle,url',
    '--jq', '.[0] // empty | "\\(.conclusion)|\\(.displayTitle)|\\(.url)"',
  ]);
  const row = r.code === 0 ? r.stdout.trim() : '';
  const [conclusion, title, url] = row3(row);
  if (conclusion === '' || conclusion === 'success') {
    ctx.report.ok('P10', `CI on main is ${conclusion || 'not reporting (no completed runs)'}`);
    return;
  }
  ctx.report.stop(
    'P10',
    `CI on main last concluded '${conclusion}' on "${title}" — fix it before releasing on top of it: ${url}`,
  );
}

// ── P11 ───────────────────────────────────────────────────────────────
export const JEST_FAILED = "jest failed — run 'NODE_ENV=test npx jest'";
export const TSC_FAILED = "tsc failed — run 'npx tsc --noEmit'";

export async function tests(ctx: Ctx): Promise<void> {
  ctx.report.step('Tests');
  if (ctx.shadow) {
    // Minutes of work the shell has just done: its ✓ is trusted — and so
    // is its ✗. Where the shell stopped on jest or tsc, the TS stops too,
    // or every gate after it would be called a disagreement.
    const shellStopped = (text: string) => ctx.shellRecord?.some(l => l.kind === 'stop' && l.text === text);
    if (shellStopped(JEST_FAILED)) ctx.report.stop('P11', JEST_FAILED);
    ctx.report.skip('P11', 'jest (not re-run beside the shell)', 'jest');
    if (shellStopped(TSC_FAILED)) ctx.report.stop('P11', TSC_FAILED);
    ctx.report.skip('P11', 'tsc (not re-run beside the shell)', 'tsc');
    return;
  }
  const jest = await ctx.io.exec.run('npx', ['jest', '--silent'], {
    cwd: ctx.root,
    env: { NODE_ENV: 'test' },
  });
  if (jest.code !== 0) ctx.report.stop('P11', JEST_FAILED);
  ctx.report.ok('P11', 'jest');
  const tsc = await ctx.io.exec.run('npx', ['tsc', '--noEmit'], { cwd: ctx.root });
  if (tsc.code !== 0) ctx.report.stop('P11', TSC_FAILED);
  ctx.report.ok('P11', 'tsc');
}

// ── P12 ───────────────────────────────────────────────────────────────
// One workflow, started by a push to main. A second run started while one
// is live kills both ("An update has been initiated by another request"),
// which is how 2.12.0's iOS build was lost. Like the shell, a tool that
// cannot answer at all lets this pass: the question is "is one in flight",
// and no answer is not a yes.
//
// DECIDED FROM THE RUN'S STATE, not by searching the `runs` line for the
// words: that line ends with the commit message, so a commit titled
// "Show RUNNING state" read as a run in flight. The shell reads the
// state field of the line (`#N STATE/STATUS …`) for the same reason.
export async function xcodeCloudIdle(ctx: Ctx): Promise<void> {
  let live = false;
  try {
    const x: xc.XcCtx = {
      asc: new Asc(ctx.io, ctx.home),
      io: ctx.io,
      root: ctx.root,
      say: () => undefined,
    };
    const data = await x.asc.call(
      `/v1/ciProducts/${await xc.product(x)}/buildRuns?limit=1&sort=-number`,
    );
    live = data.data.some(xc.isLive);
  } catch {
    // no answer; see above
  }
  if (live) {
    ctx.report.stop(
      'P12',
      'an Xcode Cloud run is already in flight — let it finish, or it and the release build will kill each other',
    );
  }
  ctx.report.ok('P12', 'no Xcode Cloud run in flight');
}

/** Which of the shipping commits touched the cycle itself, since `base`. */
export async function cycleTouched(
  ctx: Ctx,
  paths: string[] = CYCLE_PATHS,
  head = 'HEAD',
): Promise<string> {
  const last = (
    await git(ctx, ['describe', '--tags', '--abbrev=0', '--match', 'v*', head])
  ).stdout.trim();
  if (!last) return '';
  const r = await git(ctx, ['diff', '--name-only', `${last}..${head}`, '--', ...paths]);
  return r.code === 0 ? r.stdout.trim() : '';
}

/** The whole of phase 1, in the shell's order. Returns the cycle files. */
export async function preflight(ctx: Ctx, rel: Release): Promise<string> {
  ctx.report.bold(`Releasing ${rel.oldVersion} (${rel.oldCode}) → ${rel.version} (${rel.code})`);
  ctx.report.step('Preflight');
  await toolsPresent(ctx);
  await catalystToolchain(ctx);
  await onMainAndClean(ctx);
  await notBehindOrigin(ctx);
  await tagFree(ctx, rel);
  versionMoves(ctx, rel);
  playNotes(ctx, rel);
  appNotes(ctx, rel);
  caskGate(ctx, rel);
  lessonGate(ctx);
  await ciOnMain(ctx);
  await tests(ctx);
  await xcodeCloudIdle(ctx);

  ctx.report.step('What this ships');
  await showUnreleased(ctx);
  const touched = await cycleTouched(ctx);
  if (touched) {
    ctx.report.say('');
    ctx.report.bold('  This release CHANGES THE RELEASE CYCLE:');
    for (const f of touched.split('\n')) ctx.report.say(`    ${f}`);
    ctx.report.say('    → its journal entry will ask what that changed, and the next');
    ctx.report.say('      release will not start until you have answered.');
  }
  return touched;
}
