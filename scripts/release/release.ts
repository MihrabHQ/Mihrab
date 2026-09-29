/**
 * Cut a release, in an order that cannot strand one — the whole of
 * release.sh, for `RELEASE_TS=1 ./scripts/release.sh X.Y.Z` (the prepared
 * switch-over; see docs/rewrite-plan.md, Phase 3).
 *
 *   release X.Y.Z             the whole thing
 *   release X.Y.Z --dry-run   everything up to the first irreversible step
 *   release --unreleased      what is on main and has never shipped
 *
 * Same environment as the shell: SKIP_CATALYST, SKIP_APP_STORE, IOS_LOCAL,
 * NO_IOS_LOCAL, RELEASE_NOTES. Same files: every stop is appended to
 * .release-attempts.log, the journal entry to docs/release-log.md. Same
 * exit status: 0, or 1 for a stop, a failed verification, or a release
 * whose own commit fails CI — the status whatever wraps the release
 * prints as its `RELEASE_EXIT=` line.
 *
 * ── SKIP_CATALYST, AND WHY IT IS AN ENV VAR AND NOT A FLAG ──
 * Xcode 27 stopped the Mac alone on 2026-09-16 with Android and iOS gated
 * green. Holding everything for the Mac, or shipping the two that work:
 * this is the second, made explicit — typed deliberately every time, never
 * a default, and it prints what it gives up. It skips the Catalyst build,
 * the gates that read the zip, the zip as an asset and the tap bump; the
 * cask keeps pointing at the last version that has a zip, and the
 * verifier WILL report the Mac as behind, which is correct.
 *
 * ── THE ONE RULE ──
 * Everything that can fail happens BEFORE anything that cannot be undone.
 * It replaced a thirteen-step checklist, and every incident this project
 * had came from that list: 2.11.0 ad hoc signed; a tag pushed before main
 * landed; Play notes over 500 characters found after the tag; fixes on main
 * for days, released to nobody; widgets frozen on every Mac upgrade.
 */
import type { Ctx } from './common.ts';
import type { Io } from './io.ts';
import { ReleaseStop, Reporter } from './report.ts';
import { ATTEMPTS, VERSION_RE, preflight, readRelease, showUnreleased } from './preflight.ts';
import { REVERT, build } from './build.ts';
import { ciOnRelease, cleanup, installAsUser, publish, summary } from './publish.ts';
import { verify } from './verify.ts';

/**
 * `dryRun` stays false even under --dry-run: the shell's dry run stops
 * before the first irreversible step rather than pretending through it,
 * and `cut` does the same. (The Catalyst build it runs still notarises,
 * as build-catalyst.sh does in a shell dry run.)
 */
export function makeCtx(io: Io, root: string, home: string): Ctx {
  return { io, root, home, report: new Reporter(io, 'release'), dryRun: false, shadow: false, wouldDo: [] };
}

/** `date -u +%FT%TZ`. */
const isoSeconds = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

export async function release(io: Io, root: string, home: string, argv: string[]): Promise<number> {
  const ctx = makeCtx(io, root, home);
  if (argv[0] === '--unreleased') {
    await showUnreleased(ctx);
    return 0;
  }
  const version = argv[0] ?? '';
  const dryRun = argv[1] === '--dry-run';
  try {
    if (!version) ctx.report.stop('usage', 'usage: release.sh X.Y.Z [--dry-run] | release.sh --unreleased');
    if (!VERSION_RE.test(version)) ctx.report.stop('usage', `version must be X.Y.Z, got '${version}'`);
    return await cut(ctx, version, dryRun);
  } catch (e) {
    // Every abort is recorded. A release cycle only improves from evidence
    // about where it actually stops people, and nobody remembers the third
    // failed attempt from two weeks ago. A CRASH IS AN ABORT TOO: the
    // shell could not crash past its `die`, and a TypeScript that threw
    // left no line at all — the one attempt most worth reading later.
    let reason: string;
    if (e instanceof ReleaseStop) {
      reason = e.message;
    } else {
      const err = e instanceof Error ? e : new Error(String(e));
      io.err(err.stack ?? err.message);
      reason = `the release tool crashed: ${err.message.split('\n')[0]}`;
    }
    io.fs.appendText(`${root}/${ATTEMPTS}`, `${isoSeconds(io.clock.now())}\t${version || '?'}\t${reason}\n`);
    return 1;
  }
}

async function cut(ctx: Ctx, version: string, dryRun: boolean): Promise<number> {
  const rel = readRelease(ctx, version);
  // PHASE 1 — PREFLIGHT. Nothing is written.
  const touched = await preflight(ctx, rel);
  // PHASE 2 — BUILD. The working tree and ios/build only.
  const built = await build(ctx, rel);
  if (dryRun) {
    await cleanup(ctx);
    const r = ctx.report;
    r.say('');
    r.bold('Dry run. Everything that can fail has passed.');
    r.say('  Artifacts:');
    r.say(`    ${built.apk}`);
    r.say(`    ${built.aab}`);
    if (built.zip) r.say(`    ${built.zip}`);
    r.say('');
    r.say('  The version bump is in your working tree. Undo it with:');
    r.say(`    ${REVERT}`);
    return 0;
  }
  // PHASE 3 — PUBLISH. From here nothing can be taken back.
  const pub = await publish(ctx, rel, built, touched);
  // PHASE 4 — VERIFY, against what is now live.
  ctx.report.step('Verifying');
  const v: Ctx = { ...ctx, report: new Reporter(ctx.io, 'verify') };
  if ((await verify(v, rel.tag)) !== 0) ctx.report.stop('V', 'verification failed — see the ✗ lines above');
  // PHASE 5 — BE A USER.
  await installAsUser(ctx, rel);
  // PHASE 6 — THE RELEASE COMMIT'S OWN CI.
  const ci = await ciOnRelease(ctx, pub.releaseSha);
  // Last: verification and the install both touch bundles.
  await cleanup(ctx);
  for (const line of summary(rel, built, pub.ios, ci)) ctx.report.say(line);
  // A cycle that published a commit failing CI did not finish clean, and
  // the exit status says so — a 0 here let five of them pass unremarked.
  return ci.state === 'red' ? 1 : 0;
}
