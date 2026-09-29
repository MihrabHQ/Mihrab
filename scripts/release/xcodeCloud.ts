/**
 * Talk to Xcode Cloud from the terminal, because the web UI is the only
 * other way to know whether a release is actually building. The port of
 * scripts/xcode-cloud.py, command for command and exit code for exit code:
 *
 *   runs [n]                recent build runs, newest first
 *   start [--force]         start the Default workflow (refuses if one is live)
 *   why <run-id>            non-warning issues of a failed run
 *   shipped X.Y.Z [sha]     did that version reach App Store Connect
 *                           0 yes · 2 no, and nothing is building it · 3 not yet
 *   ensure <sha> [minutes]  make sure a run exists for the release commit
 *                           0 there is one · 2 there is none and none could start
 *   pause / resume          stop / let pushes to main start runs
 *
 * WHY IT EXISTS. A release cut assumed that pushing a tag started an App
 * Store build. It does not — there is one workflow and it starts on
 * `main` — and on 2026-08-07 the push trigger did not fire either: `main`
 * moved and no run appeared for half an hour. A run started by hand picked
 * up the same commit and succeeded. Nothing in the repo could see any of
 * that, so the release was reported finished while the iOS channel had
 * quietly not started.
 *
 * THE WORKFLOW IS ENABLED (2026-09-11) and nothing is pushed to `main`
 * except a release, so the release's own push starts the run; `ensure`
 * waits for it and starts one only when the trigger did not fire.
 */
import type { Asc, Json } from './asc.ts';
import { AscExit } from './asc.ts';
import type { Io } from './io.ts';

export interface XcCtx {
  asc: Asc;
  io: Io;
  root: string;
  say(line: string): void;
}

// How long Xcode Cloud is allowed to take to notice a push before "no run
// exists for this commit" stops meaning "not yet" and starts meaning "the
// trigger never fired". Measured: runs appear one to three minutes after
// the push; the 2026-08-07 incident had nothing after thirty.
export const TRIGGER_GRACE_MINUTES = 15;

export const BUNDLE_ID = 'com.hassan.prayerapp';

/**
 * Minutes since `sha` was committed locally, or null if git cannot say.
 * The release commit is made seconds before the push, so this is a fair
 * stand-in for "how long ago did Xcode Cloud get the chance to see it".
 */
export async function commitAgeMinutes(x: XcCtx, sha: string): Promise<number | null> {
  const r = await x.io.exec.run('git', ['-C', x.root, 'log', '-1', '--format=%ct', sha], {
    timeoutMs: 10_000,
  });
  if (r.code !== 0 || !r.stdout.trim()) return null;
  return Math.floor((x.io.clock.now() / 1000 - Number(r.stdout.trim())) / 60);
}

export async function product(x: XcCtx): Promise<string> {
  const products: Json[] = (await x.asc.call('/v1/ciProducts?limit=10')).data;
  if (products.length !== 1) {
    const names = products.map(p => p.attributes?.name ?? '?').join(', ');
    throw new AscExit(`expected exactly one Xcode Cloud product, found ${products.length}: ${names}`);
  }
  return products[0].id;
}

export async function defaultWorkflow(x: XcCtx, prod: string): Promise<string> {
  for (const wf of (await x.asc.call(`/v1/ciProducts/${prod}/workflows?limit=20`)).data) {
    if (wf.attributes?.name === 'Default') return wf.id;
  }
  throw new AscExit('no workflow named Default');
}

// EVERY buildRuns query sorts newest first. Not stylistic: without
// `sort=-number` the API hands back the OLDEST runs — #436 and friends,
// all long COMPLETE — which is what failed 2.13.1 while run #550 was
// RUNNING on the release commit.
const buildRuns = (prod: string, limit: number | string) =>
  `/v1/ciProducts/${prod}/buildRuns?limit=${limit}&sort=-number`;

/** One line per run, as `runs` prints it. */
export function runLine(run: Json): string {
  const a = run.attributes ?? {};
  const commit = a.sourceCommit ?? {};
  const message = String(commit.message ?? '').split(/\r?\n/);
  const first = message[0] ?? '';
  return (
    `#${a.number ?? 'None'} ${a.executionProgress ?? 'None'}/${a.completionStatus ?? 'None'}` +
    `  ${a.startedDate ?? 'None'}  ${a.startReason ?? 'None'}` +
    `  ${String(commit.commitSha ?? '').slice(0, 8)}` +
    `  ${first.slice(0, 58)}` +
    `  id=${run.id}`
  );
}

export async function runs(x: XcCtx, limit = '5'): Promise<number> {
  const data = await x.asc.call(buildRuns(await product(x), limit));
  for (const run of data.data) x.say(runLine(run));
  return 0;
}

/**
 * A run App Store Connect still considers live, read from its state — not
 * from a `runs` line, which carries the commit message: a commit titled
 * "Fix RUNNING timer" once looked in flight to a text search (P12).
 */
export const isLive = (run: Json) =>
  ['PENDING', 'RUNNING'].includes(run.attributes?.executionProgress);

/**
 * `ensure`'s minutes, as the Python reads them: digits, with an optional
 * fraction. "abc" used to become NaN, a deadline never reached, and a
 * poll that never ended; the Python raised a ValueError. Both refuse it
 * now, in the same words, with exit 1.
 */
export function ensureMinutes(wait: string): number {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(wait)) {
    throw new AscExit(`usage: ensure <sha> [minutes] — minutes must be a number, got '${wait}'`);
  }
  return Number(wait);
}

/** Runs App Store Connect still considers live. */
export async function inFlight(x: XcCtx): Promise<Json[]> {
  const data = await x.asc.call(buildRuns(await product(x), 5));
  return data.data.filter(isLive);
}

export async function workflowEnabled(x: XcCtx, wf: string): Promise<boolean> {
  return !!(await x.asc.call(`/v1/ciWorkflows/${wf}`)).data.attributes?.isEnabled;
}

/**
 * Start the Default workflow — unless one is already running.
 *
 * TWO CONCURRENT RUNS DO NOT RACE, THEY BOTH DIE. On 2026-08-26 a release
 * cut started a run by hand while the push trigger's run was still going,
 * and App Store Connect failed BOTH with "An update has been initiated by
 * another request and is currently being processed" — which reads like a
 * transient hiccup and is not: it is the archive step refusing to run
 * twice for one product. So this stops you starting a SECOND one, which
 * never helps and reliably kills the first.
 */
export async function start(x: XcCtx, force?: string): Promise<number> {
  if (!(await workflowEnabled(x, await defaultWorkflow(x, await product(x))))) {
    throw new AscExit(
      'the Default workflow is paused, so nothing can start it — including this.\n' +
        '  ./scripts/xcode-cloud.py resume   (then start; pause again when it lands)',
    );
  }
  const live = await inFlight(x);
  if (live.length && force !== '--force') {
    for (const run of live) {
      const a = run.attributes ?? {};
      const commit = String(a.sourceCommit?.commitSha ?? '');
      x.say(
        `already in flight: #${a.number} ${a.executionProgress}  ${a.startReason}  ${commit.slice(0, 8)}`,
      );
    }
    x.say('not starting another — a second run fails both. Watch it with:');
    x.say('  ./scripts/xcode-cloud.py runs 3');
    x.say('Really want one anyway? ./scripts/xcode-cloud.py start --force');
    return 1;
  }
  const out = await x.asc.call('/v1/ciBuildRuns', {
    data: {
      type: 'ciBuildRuns',
      relationships: {
        workflow: { data: { type: 'ciWorkflows', id: await defaultWorkflow(x, await product(x)) } },
      },
    },
  });
  const a = out.data.attributes ?? {};
  x.say(`started run ${a.number} (${a.executionProgress}) id=${out.data.id}`);
  return 0;
}

/**
 * Make sure a run exists for `commit` — waiting for the push to do it.
 *
 * The push trigger has silently not fired before (2026-08-07), so
 * "pushed, therefore building" cannot be assumed; and starting one blindly
 * is worse than not starting one, because two concurrent runs both die
 * (2026-08-26). So: wait for the trigger, and only start a run if it
 * never came. 0 when a run exists for the commit, 2 when there is none
 * and one could not be started.
 */
export async function ensure(x: XcCtx, commit: string, wait = '6'): Promise<number> {
  const minutes = ensureMinutes(wait);
  const deadline = x.io.clock.now() + minutes * 60_000;
  const short = commit.slice(0, 8);
  for (;;) {
    const data = await x.asc.call(buildRuns(await product(x), 10));
    for (const run of data.data) {
      const a = run.attributes ?? {};
      const sha = String(a.sourceCommit?.commitSha ?? '');
      if (sha && sha.slice(0, 8) === short) {
        x.say(`run ${a.number} is building ${short} (${a.executionProgress})`);
        return 0;
      }
    }
    if (x.io.clock.now() >= deadline) break;
    await x.io.clock.sleep(20_000);
  }
  x.say(`no run for ${short} after ${minutes} min — the push trigger did not fire. Starting one by hand.`);
  const live = await inFlight(x);
  if (live.length) {
    const a = live[0].attributes ?? {};
    const other = String(a.sourceCommit?.commitSha ?? '?');
    x.say(
      `  refusing: run ${a.number} is already live on ${other.slice(0, 8)}. Starting a second would kill both.`,
    );
    return 2;
  }
  try {
    return (await start(x)) === 0 ? 0 : 2;
  } catch (e) {
    // Exit 2 whatever `start` said, but say it. The Python once dropped
    // the message — 2.25.0's log said "Starting one by hand" and then
    // nothing at all about why it failed; both say it now.
    if (e instanceof AscExit) {
      x.say(`  could not start one: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

/**
 * Stop Xcode Cloud starting a run on every push to `main`.
 *
 * NOT THE NORMAL STATE ANY MORE: nothing is pushed to `main` except a
 * release. This is for the day that stops being true, and for
 * SKIP_APP_STORE=1, which pauses before the release's push. Every run
 * posts a PUBLIC commit status (`PrayerApp | Default`), and a cancelled
 * one is a red X on a commit that earned none. It is `isEnabled`, not the
 * start condition — see `Asc.patch`.
 */
export async function pause(x: XcCtx): Promise<number> {
  const wf = await defaultWorkflow(x, await product(x));
  if (!(await workflowEnabled(x, wf))) {
    x.say('already paused — pushes to main start nothing.');
    return 0;
  }
  await x.asc.patch(`/v1/ciWorkflows/${wf}`, {
    data: { type: 'ciWorkflows', id: wf, attributes: { isEnabled: false } },
  });
  x.say('paused: pushes to main no longer start a run, and no status is');
  x.say('posted to GitHub. Start a release build by hand with:');
  x.say('  ./scripts/xcode-cloud.py resume && ./scripts/xcode-cloud.py start');
  return 0;
}

/** Let pushes to `main` start runs again. */
export async function resume(x: XcCtx): Promise<number> {
  const wf = await defaultWorkflow(x, await product(x));
  if (await workflowEnabled(x, wf)) {
    x.say('already running: every push to main starts a build.');
    return 0;
  }
  await x.asc.patch(`/v1/ciWorkflows/${wf}`, {
    data: { type: 'ciWorkflows', id: wf, attributes: { isEnabled: true } },
  });
  x.say('resumed: every push to main starts a build, and every run posts');
  x.say('its result to GitHub as a public commit status. ./scripts/xcode-cloud.py pause');
  return 0;
}

export async function why(x: XcCtx, runId: string): Promise<number> {
  for (const act of (await x.asc.call(`/v1/ciBuildRuns/${runId}/actions`)).data) {
    const a = act.attributes ?? {};
    x.say(`== ${a.name}: ${a.executionProgress}/${a.completionStatus}`);
    if ([undefined, null, 'SUCCEEDED', 'SKIPPED'].includes(a.completionStatus)) continue;
    let url: string | undefined = `/v1/ciBuildActions/${act.id}/issues?limit=200`;
    while (url) {
      const page: Json = await x.asc.call(url);
      for (const issue of page.data) {
        const ia = issue.attributes ?? {};
        if (ia.issueType === 'WARNING') continue;
        x.say(`   [${ia.issueType}] ${String(ia.message ?? '').slice(0, 600)}`);
      }
      url = page.links?.next;
    }
  }
  return 0;
}

/**
 * Did this marketing version actually reach App Store Connect?
 *
 * 2.13.0 is why this exists: run #549 archived (** ARCHIVE SUCCEEDED **)
 * and ERRORED eleven minutes later in the step that uploads, and the
 * release was passed anyway. Build NUMBERS are Xcode Cloud run numbers,
 * not CFBundleVersion, so the only honest question is through the build's
 * preReleaseVersion, which carries the marketing version.
 *
 * With the release commit, "no build and nothing running" splits into
 * "not picked up yet" (fine, seconds after a release) and "never" (a real
 * fault). 0 = a build exists, 2 = none and nothing working on one,
 * 3 = still building, ask again later.
 */
export async function shipped(x: XcCtx, version: string, commit?: string): Promise<number> {
  const apps: Json[] = (await x.asc.call('/v1/apps?limit=10')).data;
  const appId = apps.find(a => a.attributes?.bundleId === BUNDLE_ID)?.id;
  if (appId === undefined) {
    x.say('could not find the app in App Store Connect');
    return 2;
  }
  // SORTED BY WHEN IT ARRIVED, not by its build number. A version sort
  // compares the build number as a STRING, and the two upload routes
  // number builds differently: Xcode Cloud rewrites it to its run number
  // (700-odd) while a local build-ios-appstore.sh upload carries the real
  // CFBundleVersion (269 for 2.18.5). Lexically "718" beats "269", so
  // thirty of Xcode Cloud's filled the window and this reported "2.18.5
  // NEVER REACHED App Store Connect" on 2026-09-13 while build 269 sat
  // there VALID. Arrival order is the one ordering both routes agree on.
  const res = await x.asc.call(
    `/v1/builds?filter[app]=${appId}&limit=30&sort=-uploadedDate` +
      '&include=preReleaseVersion' +
      '&fields[builds]=version,processingState,uploadedDate,preReleaseVersion' +
      '&fields[preReleaseVersions]=version',
  );
  const pre = new Map<string, Json>();
  for (const i of res.included ?? []) pre.set(i.id, i.attributes);
  for (const b of res.data) {
    const rel = b.relationships?.preReleaseVersion?.data;
    const mv = rel ? pre.get(rel.id)?.version : undefined;
    if (mv === version) {
      const ba = b.attributes ?? {};
      x.say(
        `${version} is in App Store Connect: build ${ba.version}, ${ba.processingState}, uploaded ${ba.uploadedDate}`,
      );
      return 0;
    }
  }

  // Not there. Is something still working on it, has the push simply not
  // been picked up yet, or did it fail?
  const running: string[] = [];
  const seen = new Set<string>();
  for (const r of (await x.asc.call(buildRuns(await product(x), 10))).data) {
    const a = r.attributes ?? {};
    const sha = String(a.sourceCommit?.commitSha ?? '').slice(0, 8);
    seen.add(sha);
    if (isLive(r)) running.push(`#${a.number} ${sha}`.trim());
  }
  if (running.length) {
    x.say(
      `${version} is not in App Store Connect yet — ${running.join(', ')} is still going. Ask again in a few minutes.`,
    );
    return 3;
  }

  // Nothing running. Xcode Cloud creates the run a minute or two AFTER the
  // push and this runs seconds after it — which is how 2.13.1 was told
  // "nothing is building it" while run #550 was about to start on exactly
  // that commit. A gate that cries wolf on every release is worse than no
  // gate.
  if (commit && !seen.has(commit.slice(0, 8))) {
    const age = await commitAgeMinutes(x, commit);
    if (age === null || age < TRIGGER_GRACE_MINUTES) {
      x.say(
        `${version}: Xcode Cloud has not created a run for ${commit.slice(0, 8)} yet` +
          (age !== null ? ` (${age} min after the commit)` : '') +
          ' — it normally starts within a few minutes. Re-run this check.',
      );
      return 3;
    }
    x.say(
      `${version}: ${commit.slice(0, 8)} is ${age} min old and Xcode Cloud never started ` +
        'a run for it. The release cut starts one; if it could not, retry:\n' +
        '  ./scripts/xcode-cloud.py resume && ./scripts/xcode-cloud.py start' +
        '; ./scripts/xcode-cloud.py pause',
    );
    return 2;
  }
  x.say(
    `${version} NEVER REACHED App Store Connect, and nothing is building it. Check ./scripts/xcode-cloud.py runs 3`,
  );
  return 2;
}

export const USAGE = `usage: xcode-cloud runs [n] | start [--force] | why <run-id> | shipped X.Y.Z [sha] | ensure <sha> [minutes] | pause | resume`;

/** The command line, as the Python's `__main__`. Returns the exit status. */
export async function xcodeCloudMain(x: XcCtx, argv: string[]): Promise<number> {
  const cmd = argv[0] ?? 'runs';
  try {
    switch (cmd) {
      case 'runs':
        return await runs(x, argv[1]);
      case 'start':
        return await start(x, argv[1]);
      case 'why':
        return await why(x, argv[1]);
      case 'shipped':
        return await shipped(x, argv[1], argv[2]);
      case 'ensure':
        return await ensure(x, argv[1], argv[2]);
      case 'pause':
        return await pause(x);
      case 'resume':
        return await resume(x);
      default:
        x.io.err(USAGE);
        return 1;
    }
  } catch (e) {
    if (e instanceof AscExit) {
      x.io.err(e.message);
      return e.code;
    }
    throw e;
  }
}
