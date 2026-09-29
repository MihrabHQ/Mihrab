/**
 * SHADOW MODE: the TypeScript runs beside the shell, and the shell decides.
 *
 * Phase 3's rule (docs/rewrite-plan.md) is that for two releases the old
 * scripts cut the release and the new tool runs beside them, and any
 * disagreement is written down. So release.sh and verify-release.sh record
 * each verdict line they print — `kind<TAB>text`, one per line — and at the
 * end of a phase hand the record to `main.ts shadow <phase>`, which runs
 * the same phase here with every irreversible step in dry run, compares,
 * appends what it found to .release-shadow.log and prints ONE line.
 *
 * It writes nothing else, anywhere (docs/DISTRIBUTION.md says so, and
 * releaseToolShadowReadOnly.test.ts holds every command to a read-only
 * list): no fetch, git with GIT_OPTIONAL_LOCKS=0, no app unpacked — the
 * shell's ✓ for jest, Gradle, the Catalyst build and the unpacked app's
 * signature are trusted rather than repeated.
 *
 * It can never stop a release: every error is caught and logged, it has a
 * deadline, and its exit status is always 0. A shadow that could break the
 * thing it is shadowing would defeat the point of having one.
 */
import type { Ctx } from './common.ts';
import { REPO, apkName, gh, git, tapPath, zipName } from './common.ts';
import type { Io } from './io.ts';
import type { Kind, Outcome } from './report.ts';
import { ReleaseStop, Reporter } from './report.ts';
import type { Release } from './preflight.ts';
import { CYCLE_PATHS, JOURNAL, preflight } from './preflight.ts';
import { build } from './build.ts';
import {
  attemptsFor,
  bumpCask,
  commitMessage,
  inReleaseCommit,
  iosRoute,
  journalEntry,
  tagMessage,
  utcDate,
} from './publish.ts';
import { verify } from './verify.ts';

export const SHADOW_LOG = '.release-shadow.log';
export const SHADOW_MARK = '  ◦ shadow (TypeScript)';

export interface ShellLine {
  kind: Kind;
  text: string;
}

/** Newlines inside a message are recorded as spaces on the shell side. */
export const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/**
 * The shell's record. Kinds are the shell's own function names: release.sh
 * writes ok / warn / die, verify-release.sh pass / fail / pend.
 */
export function parseRecord(text: string): ShellLine[] {
  const kinds: Record<string, Kind> = {
    ok: 'ok',
    pass: 'ok',
    warn: 'warn',
    die: 'stop',
    fail: 'fail',
    pend: 'pend',
  };
  const out: ShellLine[] = [];
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const kind = kinds[line.slice(0, tab)];
    if (kind) out.push({ kind, text: flat(line.slice(tab + 1)) });
  }
  return out;
}

const MARK: Record<Kind, string> = { ok: '✓', warn: '⚠', fail: '✗', pend: '⧗', stop: '✗', skip: '·' };
/** Only verdicts are compared; a ⚠ is commentary, and logged, not held to. */
const VERDICTS = new Set<Kind>(['ok', 'fail', 'pend', 'stop']);

export interface Comparison {
  compared: number;
  onlyShell: ShellLine[];
  onlyTs: ShellLine[];
}

/**
 * The two sides as multisets of (verdict, text). A step the TS did not
 * repeat (`skip` with `trusts`) takes the shell's matching ✓ off the
 * table instead of being compared.
 */
export function compare(shell: ShellLine[], ts: Outcome[]): Comparison {
  const key = (l: ShellLine) => `${l.kind}\t${l.text}`;
  const left = shell.filter(l => VERDICTS.has(l.kind));
  for (const o of ts) {
    if (o.kind !== 'skip' || !o.trusts) continue;
    const i = left.findIndex(l => l.kind === 'ok' && l.text === o.trusts);
    if (i >= 0) left.splice(i, 1);
  }
  const right: ShellLine[] = ts
    .filter(o => VERDICTS.has(o.kind))
    .map(o => ({ kind: o.kind, text: flat(o.text) }));
  const pool = new Map<string, number>();
  for (const l of left) pool.set(key(l), (pool.get(key(l)) ?? 0) + 1);
  const onlyTs: ShellLine[] = [];
  for (const l of right) {
    const n = pool.get(key(l)) ?? 0;
    if (n > 0) pool.set(key(l), n - 1);
    else onlyTs.push(l);
  }
  const onlyShell: ShellLine[] = [];
  for (const l of left) {
    const n = pool.get(key(l)) ?? 0;
    if (n > 0) {
      onlyShell.push(l);
      pool.set(key(l), n - 1);
    }
  }
  return { compared: left.length, onlyShell, onlyTs };
}

/**
 * The checks whose answer is a matter of WHEN they are asked: the iOS
 * build and the release commit's CI. The shell asks, then the TypeScript
 * a minute later, and "#741 is still going" can by then be "in App Store
 * Connect" — or "(2 min after the commit)" be "(3 min …)". Neither is a
 * disagreement about the gate.
 */
export const TIME_DEPENDENT = ['iOS: ', 'CI: '];

/**
 * Takes each time-dependent pair where at least one side is ⧗ out of the
 * disagreements and into the notes. ✗ against ✓ stays a disagreement: a
 * minute does not turn a failure into a pass.
 */
export function setAsideTiming(c: Comparison): { comparison: Comparison; notes: string[] } {
  const onlyShell = [...c.onlyShell];
  const onlyTs = [...c.onlyTs];
  const notes: string[] = [];
  for (const prefix of TIME_DEPENDENT) {
    for (;;) {
      const i = onlyShell.findIndex(l => l.text.startsWith(prefix));
      const j = onlyTs.findIndex(l => l.text.startsWith(prefix));
      if (i < 0 || j < 0) break;
      const [s, t] = [onlyShell[i], onlyTs[j]];
      if (s.kind !== 'pend' && t.kind !== 'pend') break;
      notes.push(`asked at different moments — shell ${MARK[s.kind]} ${s.text} | TS ${MARK[t.kind]} ${t.text}`);
      onlyShell.splice(i, 1);
      onlyTs.splice(j, 1);
    }
  }
  return { comparison: { ...c, onlyShell, onlyTs }, notes };
}

export interface ShadowResult {
  phase: string;
  label: string;
  comparison: Comparison;
  /** Things worth logging that are not verdicts: warnings, dry-run intentions, errors. */
  notes: string[];
}

/** Appends the result to the log and returns the one line to print. */
export function report(io: Io, root: string, res: ShadowResult): string {
  const { comparison: c } = res;
  const n = c.onlyShell.length + c.onlyTs.length;
  const stamp = new Date(io.clock.now()).toISOString().replace(/\.\d+Z$/, 'Z');
  const lines = [
    `== ${stamp} ${res.label} ${res.phase}: ${n ? `${n} disagreement(s)` : 'agrees'} (${c.compared} shell verdicts)`,
    ...c.onlyShell.map(l => `  shell only: ${MARK[l.kind]} ${l.text}`),
    ...c.onlyTs.map(l => `  TS only:    ${MARK[l.kind]} ${l.text}`),
    ...res.notes.map(l => `  note: ${l}`),
  ];
  try {
    io.fs.appendText(`${root}/${SHADOW_LOG}`, `${lines.join('\n')}\n`);
  } catch {
    // A log that cannot be written is a shadow that says so below, not a stop.
  }
  return n
    ? `${SHADOW_MARK} ${res.phase}: ${n} disagreement(s) with the shell — see ${SHADOW_LOG}`
    : `${SHADOW_MARK} ${res.phase}: agrees with the shell (${c.compared} verdicts)`;
}

export function shadowCtx(io: Io, root: string, home: string, style: 'release' | 'verify'): Ctx {
  return {
    io,
    root,
    home,
    report: new Reporter(io, style, true),
    dryRun: true,
    shadow: true,
    wouldDo: [],
  };
}

async function runQuietly(ctx: Ctx, f: () => Promise<unknown>): Promise<string[]> {
  const notes: string[] = [];
  try {
    await f();
  } catch (e) {
    if (!(e instanceof ReleaseStop)) notes.push(`the TypeScript threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  }
  for (const o of ctx.report.outcomes) if (o.kind === 'warn') notes.push(`⚠ ${o.text}`);
  for (const w of ctx.wouldDo) notes.push(`would ${w}`);
  return notes;
}

export async function shadowPreflight(ctx: Ctx, rel: Release, record: string): Promise<ShadowResult> {
  const shell = parseRecord(record);
  // Where the shell stopped on a step the TS does not repeat (jest, tsc),
  // the TS has to stop there too, or every gate after it is a false
  // "TS only".
  ctx.shellRecord = shell;
  const notes = await runQuietly(ctx, () => preflight(ctx, rel));
  return { phase: 'preflight', label: rel.version, comparison: compare(shell, ctx.report.outcomes), notes };
}

export async function shadowBuild(ctx: Ctx, rel: Release, record: string): Promise<ShadowResult> {
  const notes = await runQuietly(ctx, () => build(ctx, rel));
  return { phase: 'build', label: rel.version, comparison: compare(parseRecord(record), ctx.report.outcomes), notes };
}

export async function shadowVerify(ctx: Ctx, tag: string, record: string, self?: string): Promise<ShadowResult> {
  const notes = await runQuietly(ctx, () => verify(ctx, tag, { self }));
  const { comparison, notes: timing } = setAsideTiming(compare(parseRecord(record), ctx.report.outcomes));
  return { phase: 'verify', label: tag, comparison, notes: [...timing, ...notes] };
}

/**
 * After the shell has published, hold what the TS WOULD have done against
 * what the shell DID: the journal entry, the release commit, the tag, the
 * asset names, the bumped cask, the iOS route. Each is recorded as a
 * verdict on both sides — the shell's side read back from git, GitHub and
 * the tap, the TS side computed — so a difference is a disagreement like
 * any other.
 */
export async function shadowPublish(
  ctx: Ctx,
  rel: Release,
  opts: { releaseSha: string; ios: string; zip: boolean },
): Promise<ShadowResult> {
  const shell: ShellLine[] = [];
  const ts: Outcome[] = [];
  const notes: string[] = [];
  const both = (id: string, what: string, shellSays: string, tsSays: string) => {
    shell.push({ kind: 'ok', text: `${what}: ${flat(shellSays)}` });
    ts.push({ id, kind: 'ok', text: `${what}: ${flat(tsSays)}` });
  };
  try {
    const sha = opts.releaseSha;
    // U1: the entry the release commit appended, against the one the TS
    // would write from the same attempts log, cycle files and day.
    const before = (await git(ctx, ['show', `${sha}^:${JOURNAL}`])).stdout;
    const after = (await git(ctx, ['show', `${sha}:${JOURNAL}`])).stdout;
    const added = after.startsWith(before) ? after.slice(before.length) : '(not an append)';
    const attemptsFile = `${ctx.root}/.release-attempts.log`;
    const attempts = ctx.io.fs.isFile(attemptsFile)
      ? attemptsFor(ctx.io.fs.readText(attemptsFile), rel.version)
      : [];
    const last = (await git(ctx, ['describe', '--tags', '--abbrev=0', '--match', 'v*', `${sha}^`])).stdout.trim();
    const touched = last
      ? (await git(ctx, ['diff', '--name-only', `${last}..${sha}^`, '--', ...CYCLE_PATHS])).stdout.trim()
      : '';
    const day = (await git(ctx, ['log', '-1', '--format=%cI', sha])).stdout.trim();
    const dayUtc = day ? utcDate(Date.parse(day)) : utcDate(ctx.io.clock.now());
    both('U1', 'journal entry', added, journalEntry(rel, dayUtc, attempts, touched));

    // U2: the commit's subject, and that it touched nothing outside the list.
    const subject = (await git(ctx, ['log', '-1', '--format=%s', sha])).stdout.trim();
    both('U2', 'release commit', subject, commitMessage(rel));
    const files = (await git(ctx, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha])).stdout
      .split('\n')
      .filter(Boolean);
    const stray = files.filter(f => !inReleaseCommit(f));
    both('U2', 'files outside the release list', stray.join(' ') || 'none', 'none');

    // U5: the annotated tag names the release commit, with the message.
    const tagSha = (await git(ctx, ['rev-parse', '-q', '--verify', `${rel.tag}^{commit}`])).stdout.trim();
    both('U5', 'tag commit', tagSha, sha);
    const tagText = (await git(ctx, ['tag', '-l', '--format=%(contents)', rel.tag])).stdout.trim();
    both('U5', 'tag message', tagText, tagMessage(rel));

    // U6: the asset names GitHub reports.
    const names = (await gh(ctx, ['release', 'view', rel.tag, '-R', REPO, '--json', 'assets', '--jq', '.assets[].name']))
      .stdout.split('\n')
      .filter(Boolean)
      .sort()
      .join(' ');
    both('U6', 'release assets', names, [apkName(rel.version), ...(opts.zip ? [zipName(rel.version)] : [])].sort().join(' '));

    // U7: the cask as the shell left it, against the TS's bump of the
    // cask before it (the tap's previous commit) with the served zip's sha.
    if (opts.zip) {
      const tap = tapPath(ctx.home);
      const tapRepo = tap.slice(0, tap.lastIndexOf('/Casks/'));
      const now = ctx.io.fs.readText(tap);
      const prev = (await git(ctx, ['show', 'HEAD^:Casks/mihrab.rb'], { cwd: tapRepo })).stdout;
      const shaNow = /sha256 "([a-f0-9]*)"/.exec(now)?.[1] ?? '';
      const oldVersion = /version "([^"]*)"/.exec(prev)?.[1] ?? rel.oldVersion;
      both('U7', 'cask', now, bumpCask(prev, oldVersion, rel.version, shaNow).text);
    }

    // U8: the route, against what the shell's XC_STARTED says ran. It
    // was compared with a route the shell side worked out from the same
    // IOS_LOCAL the TS reads, so it could only agree. XC_STARTED pins the
    // route down when it is `skipped` or `1` (the cloud's run); `local`
    // and `0` are how the local route ends and ALSO how the cloud route
    // ends after its fallback, so they say only "not skipped".
    const route = iosRoute(ctx);
    const ran: Record<string, string> = { skipped: 'skip', 1: 'cloud' };
    const shellRoute = ran[opts.ios] ?? (route === 'skip' ? `not skipped (XC_STARTED=${opts.ios})` : route);
    both('U8', 'iOS route', shellRoute, route);
    notes.push(`iOS ended as XC_STARTED=${opts.ios}`);
  } catch (e) {
    notes.push(`the TypeScript threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { phase: 'publish', label: rel.version, comparison: compare(shell, ts), notes };
}
