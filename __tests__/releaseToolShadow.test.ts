/**
 * Shadow mode (scripts/release/shadow.ts): the TypeScript runs beside the
 * shell, compares, logs, prints one line — and can never stop a release.
 */
import {
  SHADOW_LOG,
  compare,
  parseRecord,
  report,
  shadowCtx,
  shadowPreflight,
  shadowPublish,
} from '../scripts/release/shadow.ts';
import { SHADOW_DEADLINE_MS, shadowMain } from '../scripts/release/main.ts';
import { GOOD_CASK, GRADLE, HOME, ROOT, TAP, World } from './fixtures/releaseWorld';

const rel = { version: '2.28.0', tag: 'v2.28.0', oldVersion: '2.27.1', oldCode: 282, code: 283 };

describe('the shell’s record', () => {
  it('maps the shell’s own function names onto verdicts, and flattens nothing else', () => {
    expect(parseRecord('ok\ttools present\npass\t✓ x\ndie\tnot on main\nfail\tbad\npend\tlater\nwarn\thm\nnoise\n')).toEqual([
      { kind: 'ok', text: 'tools present' },
      { kind: 'ok', text: '✓ x' },
      { kind: 'stop', text: 'not on main' },
      { kind: 'fail', text: 'bad' },
      { kind: 'pend', text: 'later' },
      { kind: 'warn', text: 'hm' },
    ]);
  });
});

describe('comparing', () => {
  it('agrees when both said the same verdicts, in any order', () => {
    const c = compare(
      [{ kind: 'ok', text: 'b' }, { kind: 'ok', text: 'a' }],
      [{ id: '1', kind: 'ok', text: 'a' }, { id: '2', kind: 'ok', text: 'b' }],
    );
    expect(c).toEqual({ compared: 2, onlyShell: [], onlyTs: [] });
  });

  it('reports each side’s extra verdicts, counting duplicates', () => {
    const c = compare(
      [{ kind: 'ok', text: 'a' }, { kind: 'ok', text: 'a' }, { kind: 'stop', text: 'x' }],
      [{ id: '1', kind: 'ok', text: 'a' }, { id: '2', kind: 'ok', text: 'y' }],
    );
    expect(c.onlyShell).toEqual([{ kind: 'ok', text: 'a' }, { kind: 'stop', text: 'x' }]);
    expect(c.onlyTs).toEqual([{ kind: 'ok', text: 'y' }]);
  });

  it('takes a trusted step’s ✓ off the table instead of calling it a disagreement', () => {
    const c = compare([{ kind: 'ok', text: 'jest' }], [{ id: 'P11', kind: 'skip', text: 'jest (not re-run)', trusts: 'jest' }]);
    expect(c).toEqual({ compared: 0, onlyShell: [], onlyTs: [] });
  });

  it('does not hold warnings to account', () => {
    expect(compare([{ kind: 'warn', text: 'a' }], [{ id: 'x', kind: 'warn', text: 'b' }]).onlyTs).toEqual([]);
  });

  it('matches a multi-line stop against the shell’s flattened one', () => {
    const c = compare([{ kind: 'stop', text: 'push failed. Undo it: git reset' }], [{ id: 'U4', kind: 'stop', text: 'push failed.\n    Undo it:\n      git reset' }]);
    expect(c.onlyShell.length + c.onlyTs.length).toBe(0);
  });
});

describe('the log and the one line', () => {
  it('appends what it found and says where', () => {
    const w = new World();
    const line = report(w.io(), ROOT, {
      phase: 'preflight',
      label: '2.28.0',
      comparison: { compared: 3, onlyShell: [{ kind: 'stop', text: 'x' }], onlyTs: [] },
      notes: ['would push main to origin'],
    });
    expect(line).toBe(`  ◦ shadow (TypeScript) preflight: 1 disagreement(s) with the shell — see ${SHADOW_LOG}`);
    expect(w.files.get(`${ROOT}/${SHADOW_LOG}`)).toBe(
      '== 2026-09-29T12:00:00Z 2.28.0 preflight: 1 disagreement(s) (3 shell verdicts)\n  shell only: ✗ x\n  note: would push main to origin\n',
    );
  });
});

/** The healthy preflight world, from the shell's point of view. */
function preflightWorld() {
  const w = new World()
    .file(`${ROOT}/android/app/build.gradle`, GRADLE)
    .file(TAP, GOOD_CASK)
    .file(`${ROOT}/docs/release-log.md`, '## 2.27.1\n\n**Lesson:** none needed.\n')
    .on(/./, {})
    .on('xcodebuild -version', { stdout: 'Xcode 27.0' })
    .on('git rev-parse --abbrev-ref HEAD', { stdout: 'main' })
    .on('git rev-parse v2.28.0', { code: 128 })
    .on('gh run list', { stdout: 'success|Release 2.27.1 (282)|u' })
    .on('git describe', { stdout: 'v2.27.1' })
    .on('git rev-list --count', { stdout: '3' });
  for (const loc of ['en-US', 'sv-SE', 'ar']) w.file(`${ROOT}/fastlane/metadata/android/${loc}/changelogs/283.txt`, 'notes');
  return w;
}
const SHELL_PREFLIGHT = [
  'ok\ttools present',
  'ok\tCatalyst toolchain: Xcode 27.0',
  'ok\ton main, tracked files clean',
  'ok\tmain is not behind origin',
  'ok\tv2.28.0 is free',
  'ok\tversion moves 2.27.1 → 2.28.0',
  'ok\trelease notes for en-US (5 chars)',
  'ok\trelease notes for sv-SE (5 chars)',
  'ok\trelease notes for ar (5 chars)',
  'ok\tcask restarts chronod after install (legacy, unsandboxed postflight)',
  'ok\tcask re-registers the widget extension',
  "ok\tthe last release's lesson is written down",
  'ok\tCI on main is success',
  'ok\tjest',
  'ok\ttsc',
  'ok\tno Xcode Cloud run in flight',
].join('\n');

describe('the preflight shadow', () => {
  it('agrees with a shell that passed the same gates, without re-running jest', async () => {
    const w = preflightWorld();
    const res = await shadowPreflight(shadowCtx(w.io(), ROOT, HOME, 'release'), rel, SHELL_PREFLIGHT);
    expect(res.comparison).toEqual({ compared: 14, onlyShell: [], onlyTs: [] });
    expect(w.ran('npx')).toEqual([]);
    expect(w.out).toEqual([]);
  });

  it('writes down a gate the two decide differently', async () => {
    const w = preflightWorld();
    const shell = `${SHELL_PREFLIGHT.split('\n').slice(0, 6).join('\n')}\ndie\tsv-SE/changelogs/283.txt is 503 characters — Play's limit is 500`;
    const res = await shadowPreflight(shadowCtx(w.io(), ROOT, HOME, 'release'), rel, shell);
    expect(res.comparison.onlyShell).toEqual([
      { kind: 'stop', text: "sv-SE/changelogs/283.txt is 503 characters — Play's limit is 500" },
    ]);
    expect(res.comparison.onlyTs[0]).toEqual({ kind: 'ok', text: 'release notes for en-US (5 chars)' });
  });
});

describe('the publish shadow', () => {
  it('holds what the shell published against what the TypeScript would have', async () => {
    const entry = '\n## 2.28.0 (283) — 2026-09-29\n\nRan clean on the first attempt.\n\n**Lesson:** none needed — clean run, no change to the cycle.\n';
    const bumped = GOOD_CASK.replace('version "2.27.1"', 'version "2.28.0"').replace('a'.repeat(64), 'b'.repeat(64));
    const w = new World()
      .file(TAP, bumped)
      .on(/./, {})
      .on('git show feedbeef^:docs/release-log.md', { stdout: '# log\n' })
      .on('git show feedbeef:docs/release-log.md', { stdout: `# log\n${entry}` })
      .on('git describe', { stdout: 'v2.27.1' })
      .on('git log -1 --format=%cI', { stdout: '2026-09-29T11:00:00+02:00' })
      .on('git log -1 --format=%s', { stdout: 'Release 2.28.0 (283)' })
      .on('git diff-tree', { stdout: 'android/app/build.gradle\ndocs/index.html\ndocs/release-log.md\n' })
      .on('git rev-parse -q --verify', { stdout: 'feedbeef' })
      .on('git tag -l', { stdout: 'Mihrab 2.28.0 (283)\n' })
      .on('gh release view', { stdout: 'Mihrab-v2.28.0.apk\nMihrab-macOS-2.28.0.zip\n' })
      .on('git show HEAD^:Casks/mihrab.rb', { stdout: GOOD_CASK });
    const res = await shadowPublish(shadowCtx(w.io(), ROOT, HOME, 'release'), rel, { releaseSha: 'feedbeef', ios: '1', zip: true });
    expect(res.comparison).toEqual({ compared: 8, onlyShell: [], onlyTs: [] });
  });
});

describe('it cannot stop a release', () => {
  it('an unknown phase is a line, and exit 0', async () => {
    const w = new World();
    expect(await shadowMain(w.io(), ROOT, HOME, ['sideways'])).toBe(0);
    expect(w.out).toEqual(["  ◦ shadow (TypeScript): unknown phase 'sideways'"]);
  });

  it('a TypeScript that throws is logged, not raised, and still exit 0', async () => {
    const w = new World(); // no build.gradle: reading the release throws
    expect(await shadowMain(w.io(), ROOT, HOME, ['build', '2.28.0', '--old-version', '2.27.1', '--old-code', '282'])).toBe(0);
    expect(w.out).toHaveLength(1);
    expect(w.out[0]).toMatch(/^ {2}◦ shadow \(TypeScript\) build: /);
  });

  it('gives up at its deadline', async () => {
    const w = new World();
    const io = w.io();
    io.exec.run = () => new Promise(() => undefined); // hangs for ever
    const saved = SHADOW_DEADLINE_MS.preflight;
    SHADOW_DEADLINE_MS.preflight = 20;
    try {
      w.file(`${ROOT}/android/app/build.gradle`, GRADLE);
      expect(await shadowMain(io, ROOT, HOME, ['preflight', '2.28.0', '--old-version', '2.27.1', '--old-code', '282'])).toBe(0);
    } finally {
      SHADOW_DEADLINE_MS.preflight = saved;
    }
    expect(w.out[0]).toMatch(/preflight: gave up after .* min — nothing compared/);
  });
});
