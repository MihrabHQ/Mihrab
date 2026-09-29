/**
 * What every part of the release shares: the fixed facts, the context a
 * gate runs in, and the few checks more than one script makes.
 */
import type { Io } from './io.ts';
import type { Reporter } from './report.ts';

export const REPO = 'MihrabHQ/Mihrab';
export const TEAM = 'GAW23HT439';
export const APP_GROUP = 'group.com.prayerapp';
export const WIDGET_EXT_ID = 'maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension';
export const INSTALLED_APP = '/Applications/Mihrab.app';
export const INSTALLED_EXT = `${INSTALLED_APP}/Contents/PlugIns/PrayerWidgetExtension.appex`;
export const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
export const JDK = '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home';
export const PLAY_LOCALES = ['en-US', 'sv-SE', 'ar'];
export const RELEASE_CERT = 'e66c0dabc898856bd0f6057a8fe0aaa440fa1d04f0da5a213104f41f89e6f997';
export const SITE_URL = 'https://mihrab.elghamri.se/';
/** Play's limit on a release note, in characters. */
export const PLAY_NOTE_LIMIT = 500;

export const apkName = (version: string) => `Mihrab-v${version}.apk`;
export const zipName = (version: string) => `Mihrab-macOS-${version}.zip`;
export const assetUrl = (tag: string, name: string) =>
  `https://github.com/${REPO}/releases/download/${tag}/${name}`;

export interface Ctx {
  io: Io;
  root: string;
  home: string;
  report: Reporter;
  /** Irreversible steps say what they would do, and do nothing. */
  dryRun: boolean;
  /**
   * Running beside the shell, which decides. The expensive steps it has
   * already run (jest, Gradle, the Catalyst build) are trusted from its
   * record rather than run a second time.
   */
  shadow: boolean;
  /** What the irreversible steps would have done, in order (dry run). */
  wouldDo: string[];
}

export function tapPath(home: string): string {
  return `${home}/git/homebrew-tap/Casks/mihrab.rb`;
}

export const env = (ctx: Ctx, name: string) => ctx.io.env[name] ?? '';
export const flag = (ctx: Ctx, name: string) => ctx.io.env[name] === '1';

/**
 * The one gate for everything that cannot be taken back: a push, a tag, a
 * GitHub release, an upload, a notarisation submission, the tap. Under a
 * dry run it records what it would have done and hands back `pretend`, so
 * the steps after it can still be exercised.
 */
export async function irreversible<T>(
  ctx: Ctx,
  what: string,
  run: () => Promise<T>,
  pretend: T,
): Promise<T> {
  if (ctx.dryRun) {
    ctx.wouldDo.push(what);
    ctx.report.say(`  (dry run) would ${what}`);
    return pretend;
  }
  return run();
}

/**
 * The shell's `has`, kept by name. `set -o pipefail` plus `cmd | grep -q`
 * is a trap the shell fell into on its first real run: grep exits on the
 * first match, the producer gets SIGPIPE, and the pipeline reports 141 —
 * a correctly signed app reported as unsigned, and a duplicate tag read
 * as "not found". In TypeScript there is no pipe to fall into, but the
 * rule stays the same shape: capture, then test.
 */
export const has = (haystack: string, needle: string) => haystack.includes(needle);

/** `versionName "X.Y.Z"` from build.gradle — the first one. */
export function gradleVersion(gradle: string): string {
  return /versionName "([^"]*)"/.exec(gradle)?.[1] ?? '';
}

/** `versionCode N` from build.gradle — the first one. */
export function gradleCode(gradle: string): number {
  const hit = /versionCode ([0-9]+)/.exec(gradle);
  return hit ? Number(hit[1]) : NaN;
}

export function pbxMarketingVersion(pbx: string): string {
  return /MARKETING_VERSION = ([0-9.]*);/.exec(pbx)?.[1] ?? '';
}

export function pbxBuild(pbx: string): string {
  return /CURRENT_PROJECT_VERSION = ([0-9]*);/.exec(pbx)?.[1] ?? '';
}

/** Characters, as `wc -m` counts them in a UTF-8 locale. */
export const charCount = (s: string) => [...s].length;

/**
 * The ABIs in an APK, from `unzip -Z1 <apk> 'lib/*'`, space-joined with
 * the trailing space the shell's `tr '\n' ' '` leaves.
 */
export function abisFrom(listing: string): string {
  const abis = [
    ...new Set(
      listing
        .split('\n')
        .filter(l => l.startsWith('lib/'))
        .map(l => l.split('/')[1])
        .filter(Boolean),
    ),
  ].sort();
  return abis.map(a => `${a} `).join('');
}
export const ARM_ONLY = 'arm64-v8a armeabi-v7a ';

/**
 * Google Play Services, Firebase or Play Core, found in dex bytes read as
 * latin1. The shell asked `unzip -p … | strings | grep -qE …` — and under
 * `pipefail` that pipeline can report 141 when grep leaves early, which
 * reads as "not found": the check could pass an APK it should have
 * stopped. Reading the bytes has no pipe to break.
 */
export const GOOGLE_CLASSES = /Lcom\/google\/(android\/gms|firebase|android\/play\/core)\//;

/** Whether an APK carries Google classes: extracts its dex files and looks. */
export async function apkHasGoogleClasses(ctx: Ctx, apk: string): Promise<boolean> {
  const dir = ctx.io.fs.mkdtemp('mihrab-dex-');
  try {
    await ctx.io.exec.run('unzip', ['-q', '-o', apk, 'classes*.dex', '-d', dir]);
    return ctx.io.fs
      .list(dir)
      .filter(f => f.endsWith('.dex'))
      .some(f => GOOGLE_CLASSES.test(ctx.io.fs.readBinary(`${dir}/${f}`)));
  } finally {
    ctx.io.fs.rm(dir);
  }
}

export async function apkAbis(ctx: Ctx, apk: string): Promise<string> {
  const r = await ctx.io.exec.run('unzip', ['-Z1', apk, 'lib/*']);
  return abisFrom(r.stdout);
}

/** The newest file of the Android SDK's build-tools matching `name`. */
export function newestBuildTool(ctx: Ctx, name: string): string {
  const base = `${ctx.home}/Library/Android/sdk/build-tools`;
  const versions = ctx.io.fs
    .list(base)
    .filter(v => ctx.io.fs.exists(`${base}/${v}/${name}`))
    .sort(compareVersions);
  return versions.length ? `${base}/${versions[versions.length - 1]}/${name}` : '';
}

/** `sort -V` for dotted versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return nx - ny;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ── AND PUT THE INSTALLED WIDGET BACK ─────────────────────────────────
//
// `lsregister -u <path>` takes a PATH and drops records by BUNDLE
// IDENTITY, and it does it LAZILY. Unregistering a temp copy called
// `Mihrab.app` therefore takes the plugin registration of the copy in
// /Applications with it — minutes later, so a check run straight
// afterwards reports everything fine and means nothing. Measured the hard
// way on 2026-08-29: the user's widgets went blank, then left the
// gallery. `lsregister -u` is used in three places in this cycle, and
// each is a chance to take the widgets down on the machine cutting the
// release. So after any unregister, assert the installed extension back,
// and verify it STAYED rather than that the command returned 0.
//
// Captured, not piped: `pluginkit -m … | grep -q .` makes pluginkit take
// SIGPIPE and `pipefail` report 141 — a registered extension read as
// missing, and a loop that can never break.

/** true: registered (or nothing installed to register); false: it would not stay. */
export async function keepInstalledWidgetRegistered(ctx: Ctx): Promise<boolean> {
  if (!ctx.io.fs.isDir(INSTALLED_EXT)) return true;
  for (let i = 0; i < 8; i++) {
    await ctx.io.exec.run('pluginkit', ['-a', INSTALLED_EXT]);
    await ctx.io.clock.sleep(3000);
    const seen = await ctx.io.exec.run('pluginkit', ['-m', '-i', WIDGET_EXT_ID]);
    if (seen.stdout.trim()) return true;
  }
  return false;
}

export const WIDGET_UNREGISTERED =
  "/Applications/Mihrab.app's widget extension is not registered — its widgets will be blank. See docs/release/catalyst-widgets.md.";

/**
 * UNREGISTER BEFORE REMOVING. Unpacking an .app into a temp directory is by
 * itself enough to put it in the LaunchServices database — measured
 * 2026-08-29, two `ditto -x` calls into mktemp directories left two
 * registered Mihrab.app records behind, and a record pointing at a path
 * that no longer exists is what blanks every widget on the release
 * machine. `.app` only: `.appex` paths are never unregistered by hand
 * (build-catalyst.sh says why).
 */
export async function unregisterAndRemove(ctx: Ctx, app: string, dir: string): Promise<void> {
  if (ctx.io.fs.isExecutable(LSREGISTER)) await ctx.io.exec.run(LSREGISTER, ['-u', app]);
  ctx.io.fs.rm(dir);
}

/** `codesign -dv`, whose report goes to stderr. */
export async function codesignDetails(ctx: Ctx, app: string): Promise<string> {
  const r = await ctx.io.exec.run('codesign', ['-dv', app]);
  return r.stdout + r.stderr;
}

export async function codesignEntitlements(ctx: Ctx, app: string): Promise<string> {
  return (await ctx.io.exec.run('codesign', ['-d', '--entitlements', '-', '--xml', app])).stdout;
}

export async function staplerValidates(ctx: Ctx, app: string): Promise<boolean> {
  return (await ctx.io.exec.run('xcrun', ['stapler', 'validate', app])).code === 0;
}

/** `git` in the repo, captured. */
export async function git(ctx: Ctx, args: string[], opts: { cwd?: string } = {}) {
  return ctx.io.exec.run('git', args, { cwd: opts.cwd ?? ctx.root });
}

export async function gh(ctx: Ctx, args: string[]) {
  return ctx.io.exec.run('gh', args, { cwd: ctx.root });
}

/**
 * A `gh --jq` row "a|b|c", split the way the shell split it:
 * `${ROW%%|*}`, then `${REST%%|*}` and `${REST##*|}` of `${ROW#*|}` — so a
 * `|` inside the middle field (a commit title) cannot shift the URL.
 * An empty row is three empty fields.
 */
export function row3(row: string): [string, string, string] {
  if (!row.includes('|')) return [row, row, row];
  const first = row.slice(0, row.indexOf('|'));
  const rest = row.slice(row.indexOf('|') + 1);
  const middle = rest.includes('|') ? rest.slice(0, rest.indexOf('|')) : rest;
  const last = rest.includes('|') ? rest.slice(rest.lastIndexOf('|') + 1) : rest;
  return [first, middle, last];
}
