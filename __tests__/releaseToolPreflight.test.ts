/**
 * Preflight, ported (scripts/release/preflight.ts), run against a fake
 * machine. These are the behavioural tests that replace the shell's
 * grep-the-source ones at the switch-over: each gate is handed the answer
 * that should stop it, and the answer that should not, and says what the
 * shell said.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  CYCLE_PATHS,
  caskGate,
  catalystToolchain,
  ciOnMain,
  cycleTouched,
  lessonGate,
  notBehindOrigin,
  onMainAndClean,
  playNotes,
  appNotes,
  preflight,
  readRelease,
  tagFree,
  tests,
  toolsPresent,
  unfilledLesson,
  versionMoves,
  xcodeCloudIdle,
} from '../scripts/release/preflight.ts';
import { GOOD_CASK, GRADLE, ROOT, TAP, World, lines, stopOf } from './fixtures/releaseWorld';

const rel = { version: '2.28.0', tag: 'v2.28.0', oldVersion: '2.27.1', oldCode: 282, code: 283 };

function world() {
  const w = new World();
  w.file(`${ROOT}/android/app/build.gradle`, GRADLE);
  return w;
}

describe('the release being cut', () => {
  it('reads the old version and code from build.gradle and counts up by one', () => {
    const w = world();
    expect(readRelease(w.ctx(), '2.28.0')).toEqual(rel);
  });
});

describe('P1 tools', () => {
  it('stops on the first tool missing, by name', async () => {
    const w = world().on('/bin/sh -c command -v', c => ({ code: c.line.endsWith('python3') ? 1 : 0 }));
    expect(await stopOf(() => toolsPresent(w.ctx()))).toBe('python3 is not installed');
  });
});

describe('P2 the Catalyst toolchain is asked for in preflight (2.22.0)', () => {
  it('passes with the selected Xcode and says which', async () => {
    const w = world().on('xcodebuild -version', { stdout: 'Xcode 27.0\nBuild version 27A1\n' });
    const ctx = w.ctx();
    await catalystToolchain(ctx);
    expect(lines(ctx)).toEqual(['ok P2 Catalyst toolchain: Xcode 27.0']);
  });

  it('stops when no Xcode runs', async () => {
    const w = world().on('xcodebuild -version', { code: 1 });
    expect(await stopOf(() => catalystToolchain(w.ctx()))).toBe(
      'no working Xcode for the Catalyst build — see above',
    );
  });

  it('is not asked at all under SKIP_CATALYST=1', async () => {
    const w = world();
    w.env.SKIP_CATALYST = '1';
    await catalystToolchain(w.ctx());
    expect(w.calls).toEqual([]);
  });

  it('names a CATALYST_DEVELOPER_DIR that is not there', async () => {
    const w = world();
    w.env.CATALYST_DEVELOPER_DIR = '/Applications/Xcode-beta.app/Contents/Developer';
    const ctx = w.ctx();
    expect(await stopOf(() => catalystToolchain(ctx))).toBeDefined();
    expect(w.err.join('\n')).toContain('CATALYST_DEVELOPER_DIR is not a directory');
  });
});

describe('P3 on main, tracked files clean', () => {
  it('refuses another branch', async () => {
    const w = world().on('git rev-parse --abbrev-ref HEAD', { stdout: 'rewrite\n' });
    expect(await stopOf(() => onMainAndClean(w.ctx()))).toBe('not on main');
  });

  it('refuses tracked changes, and lists them, but not untracked files', async () => {
    const w = world()
      .on('git rev-parse --abbrev-ref HEAD', { stdout: 'main\n' })
      .on('git status --porcelain', { stdout: ' M android/app/build.gradle\n' })
      .on('git status --short', { stdout: ' M android/app/build.gradle\n' });
    expect(await stopOf(() => onMainAndClean(w.ctx()))).toBe(
      'working tree has tracked changes — commit or stash them first',
    );
    expect(w.out).toContain('     M android/app/build.gradle');
    expect(w.ran('git status --porcelain')[0].args).toContain('--untracked-files=no');
  });
});

describe('P4 not behind origin', () => {
  it('stops when origin/main has commits main does not (the dataset bot)', async () => {
    const w = world()
      .on('git fetch --quiet origin', {})
      .on('git rev-list main..origin/main', { stdout: 'abc123\n' });
    expect(await stopOf(() => notBehindOrigin(w.ctx()))).toBe(
      'origin/main has commits main does not — pull first',
    );
  });

  it('stops when origin cannot be reached', async () => {
    const w = world().on('git fetch', { code: 128 });
    expect(await stopOf(() => notBehindOrigin(w.ctx()))).toBe('cannot reach origin');
  });
});

describe('P5 the tag is free — a pushed tag is never moved', () => {
  it('stops on a local tag', async () => {
    const w = world().on('git rev-parse v2.28.0', { stdout: 'abc\n' });
    expect(await stopOf(() => tagFree(w.ctx(), rel))).toBe('tag v2.28.0 already exists locally');
  });

  it('stops on a remote tag, read from captured output', async () => {
    const w = world()
      .on('git rev-parse v2.28.0', { code: 128 })
      .on('git ls-remote', { stdout: 'abc\trefs/tags/v2.28.0\n' });
    expect(await stopOf(() => tagFree(w.ctx(), rel))).toBe(
      'tag v2.28.0 already exists on origin — pick the next version',
    );
  });

  it('passes when neither has it', async () => {
    const w = world().on('git rev-parse v2.28.0', { code: 128 }).on('git ls-remote', {});
    const ctx = w.ctx();
    await tagFree(ctx, rel);
    expect(lines(ctx)).toEqual(['ok P5 v2.28.0 is free']);
  });
});

describe('P6 the version moves', () => {
  it('refuses the version already in the tree', () => {
    const w = world();
    expect(() => versionMoves(w.ctx(), { ...rel, version: '2.27.1' })).toThrow('version is already 2.27.1');
  });
});

describe("P7 Play's 500-character limit, before the tag (2.13.0, 2.26.0)", () => {
  const notes = (w: World, texts: Record<string, string>) => {
    for (const [loc, t] of Object.entries(texts)) {
      w.file(`${ROOT}/fastlane/metadata/android/${loc}/changelogs/283.txt`, t);
    }
  };

  it('counts characters, not bytes: 500 Arabic letters fit', () => {
    const w = world();
    notes(w, { 'en-US': 'x'.repeat(500), 'sv-SE': 'å'.repeat(500), ar: 'ب'.repeat(500) });
    const ctx = w.ctx();
    playNotes(ctx, rel);
    expect(lines(ctx)).toEqual([
      'ok P7 release notes for en-US (500 chars)',
      'ok P7 release notes for sv-SE (500 chars)',
      'ok P7 release notes for ar (500 chars)',
    ]);
  });

  it('stops on the Swedish note at 503', () => {
    const w = world();
    notes(w, { 'en-US': 'x', 'sv-SE': 'å'.repeat(503), ar: 'x' });
    expect(() => playNotes(w.ctx(), rel)).toThrow(
      "sv-SE/changelogs/283.txt is 503 characters — Play's limit is 500",
    );
  });

  it('stops on a missing note for the NEW versionCode', () => {
    const w = world();
    notes(w, { 'en-US': 'x', 'sv-SE': 'x' });
    expect(() => playNotes(w.ctx(), rel)).toThrow('missing release notes: ar/changelogs/283.txt');
  });
});

describe('P7 the in-app note', () => {
  it('passes when the English in-app note exists', () => {
    const w = world();
    w.file(`${ROOT}/release-notes/en/283.txt`, '• A change\n');
    const ctx = w.ctx();
    appNotes(ctx, rel);
    expect(lines(ctx)).toEqual(['ok P7 in-app release notes for en']);
  });

  it('stops when it is missing, because Play\'s 500 characters leave most of a release out', () => {
    expect(() => appNotes(world().ctx(), rel)).toThrow('missing in-app release notes: release-notes/en/283.txt');
  });
});

describe('P8 the cask keeps the widgets through an upgrade', () => {
  it('passes the legacy postflight with chronod and pluginkit', () => {
    const w = world().file(TAP, GOOD_CASK);
    const ctx = w.ctx();
    caskGate(ctx, rel);
    expect(lines(ctx)).toEqual([
      'ok P8 cask restarts chronod after install (legacy, unsandboxed postflight)',
      'ok P8 cask re-registers the widget extension',
    ]);
  });

  it('rejects postflight_steps, whose sandboxed run step cannot register the extension (2026-09-14)', () => {
    const w = world().file(TAP, GOOD_CASK.replace('postflight do', 'postflight_steps do'));
    expect(() => caskGate(w.ctx(), rel)).toThrow(/cask uses postflight_steps/);
  });

  it('does not take a comment that mentions the words for the block', () => {
    const cask = GOOD_CASK.replace('  postflight do', '  # postflight do is required\n  preflight do');
    const w = world().file(TAP, cask);
    expect(() => caskGate(w.ctx(), rel)).toThrow('cask has no chronod postflight — Macs upgrading to v2.28.0 would freeze their widgets');
  });

  it('stops without pluginkit, after the chronod ✓', () => {
    const w = world().file(TAP, GOOD_CASK.replace(/.*pluginkit.*\n/, ''));
    const ctx = w.ctx();
    expect(() => caskGate(ctx, rel)).toThrow(/would LOSE their widgets/);
    expect(lines(ctx)[0]).toMatch(/^ok P8 cask restarts chronod/);
  });

  it('stops when there is no tap to bump', () => {
    const w = world();
    expect(() => caskGate(w.ctx(), rel)).toThrow(`cask not found at ${TAP} — clone the tap before releasing`);
  });

  it('warns, and checks nothing, under SKIP_CATALYST=1', () => {
    const w = world();
    w.env.SKIP_CATALYST = '1';
    const ctx = w.ctx();
    caskGate(ctx, rel);
    expect(lines(ctx)).toEqual([
      'warn P8 SKIP_CATALYST=1 — no Mac build, no Mac asset, no cask bump',
      'warn P8   Mac users stay on whatever the cask says today; only Android and iOS move',
    ]);
  });
});

describe('P9 the last lesson is written', () => {
  const journal = (tail: string) =>
    `# Release log\n\nA release leaves \`**Lesson:** _(unfilled)_\` when …\n\n## 2.27.0 (281)\n\n**Lesson:** none needed.\n${tail}`;

  it('matches only a whole line — the header quotes the marker', () => {
    expect(unfilledLesson(journal(''))).toBeNull();
  });

  it('shows the owing entry from its heading and stops', () => {
    const w = world().file(`${ROOT}/docs/release-log.md`, journal('\n## 2.27.1 (282)\n\nChanged…\n\n**Lesson:** _(unfilled)_\n'));
    expect(() => lessonGate(w.ctx())).toThrow(/left its lesson unwritten/);
    expect(w.out).toContain('    ## 2.27.1 (282)');
    expect(w.out).toContain('    **Lesson:** _(unfilled)_');
    expect(w.out).not.toContain('    ## 2.27.0 (281)');
  });
});

describe('P10 CI on main is not already red', () => {
  const gh = (w: World, row: string) => w.on('gh run list', { stdout: `${row}\n` });

  it('reads the last COMPLETED run, not the newest', async () => {
    const w = gh(world(), 'success|Release 2.27.1 (282)|https://x/1');
    const ctx = w.ctx();
    await ciOnMain(ctx);
    expect(w.ran('gh run list')[0].args).toEqual(
      expect.arrayContaining(['--workflow=ci.yml', '--branch', 'main', '--status', 'completed']),
    );
    expect(lines(ctx)).toEqual(['ok P10 CI on main is success']);
  });

  it('treats no completed runs as a fresh clone, not a failure', async () => {
    const w = gh(world(), '');
    const ctx = w.ctx();
    await ciOnMain(ctx);
    expect(lines(ctx)).toEqual(['ok P10 CI on main is not reporting (no completed runs)']);
  });

  it.each(['failure', 'cancelled', 'timed_out', 'action_required'])('stops on %s', async c => {
    const w = gh(world(), `${c}|Fix | the thing|https://x/2`);
    expect(await stopOf(() => ciOnMain(w.ctx()))).toBe(
      `CI on main last concluded '${c}' on "Fix " — fix it before releasing on top of it: https://x/2`,
    );
  });
});

describe('P11 tests', () => {
  it('runs jest with NODE_ENV=test, then tsc', async () => {
    const w = world().on('npx jest', {}).on('npx tsc', {});
    const ctx = w.ctx();
    await tests(ctx);
    expect(w.ran('npx jest')[0].opts.env).toEqual({ NODE_ENV: 'test' });
    expect(lines(ctx)).toEqual(['ok P11 jest', 'ok P11 tsc']);
  });

  it('stops on jest before running tsc', async () => {
    const w = world().on('npx jest', { code: 1 }).on('npx tsc', {});
    expect(await stopOf(() => tests(w.ctx()))).toBe("jest failed — run 'NODE_ENV=test npx jest'");
    expect(w.ran('npx tsc')).toHaveLength(0);
  });

  it('beside the shell, trusts its ✓ rather than running jest twice', async () => {
    const w = world();
    const ctx = w.ctx({ shadow: true });
    await tests(ctx);
    expect(w.calls).toEqual([]);
    expect(ctx.report.outcomes.map(o => [o.kind, o.trusts])).toEqual([
      ['skip', 'jest'],
      ['skip', 'tsc'],
    ]);
  });
});

describe('P12 no Xcode Cloud run in flight (2.12.0)', () => {
  const asc = (w: World, progress: string, message = 'Release 2.27.1 (282)') => {
    w.file(`/home/mac/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/k.p8', keyId: 'K', issuerId: 'I' }));
    w.file('/k.p8', require('crypto').generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
    w.url('https://api.appstoreconnect.apple.com/v1/ciProducts?limit=10', { text: JSON.stringify({ data: [{ id: 'P' }] }) });
    w.url('https://api.appstoreconnect.apple.com/v1/ciProducts/P/buildRuns?limit=1&sort=-number', {
      text: JSON.stringify({
        data: [{ id: 'r', attributes: { number: 740, executionProgress: progress, sourceCommit: { commitSha: 'feedbeef', message } } }],
      }),
    });
  };

  it('stops while a run is RUNNING', async () => {
    const w = world();
    asc(w, 'RUNNING');
    expect(await stopOf(() => xcodeCloudIdle(w.ctx()))).toMatch(/already in flight/);
  });

  it('passes on a finished run', async () => {
    const w = world();
    asc(w, 'COMPLETE');
    const ctx = w.ctx();
    await xcodeCloudIdle(ctx);
    expect(lines(ctx)).toEqual(['ok P12 no Xcode Cloud run in flight']);
  });

  it('reads the run’s state, not its commit message: "RUNNING" in a title is not a run in flight', async () => {
    const w = world();
    asc(w, 'COMPLETE', 'Show the RUNNING and PENDING states on the timer');
    const ctx = w.ctx();
    await xcodeCloudIdle(ctx);
    expect(lines(ctx)).toEqual(['ok P12 no Xcode Cloud run in flight']);
  });

  it('passes when App Store Connect cannot be asked at all, as the shell did', async () => {
    const w = world();
    const ctx = w.ctx();
    await xcodeCloudIdle(ctx);
    expect(lines(ctx)).toEqual(['ok P12 no Xcode Cloud run in flight']);
  });
});

describe('which files count as the release cycle', () => {
  it('diffs the cycle paths from the last tag', async () => {
    const w = world()
      .on('git describe', { stdout: 'v2.27.1\n' })
      .on('git diff --name-only v2.27.1..HEAD', { stdout: 'scripts/release.sh\n' });
    expect(await cycleTouched(w.ctx())).toBe('scripts/release.sh');
    const args = w.ran('git diff')[0].args;
    expect(args).toContain('docs/DISTRIBUTION.md');
    expect(args).not.toContain('fastlane');
  });
});

describe('the two sides agree on what the cycle is', () => {
  it('the TypeScript’s cycle paths are release.sh’s', () => {
    const sh = readFileSync(path.join(__dirname, '..', 'scripts', 'release.sh'), 'utf8');
    expect(/^CYCLE_PATHS="([^"]*)"/m.exec(sh)?.[1].split(' ')).toEqual(CYCLE_PATHS);
  });
});

describe('the whole preflight, in order', () => {
  it('stops at the first gate that says no and runs nothing after it', async () => {
    const w = world()
      .on('/bin/sh -c command -v', {})
      .on('xcodebuild -version', { stdout: 'Xcode 27.0' })
      .on('git rev-parse --abbrev-ref HEAD', { stdout: 'main' })
      .on('git status', {})
      .on('git fetch', {})
      .on('git rev-list main..origin/main', {})
      .on('git rev-parse v2.28.0', { code: 128 })
      .on('git ls-remote', {});
    // No notes: P7 stops.
    const ctx = w.ctx();
    expect(await stopOf(() => preflight(ctx, rel))).toBe('missing release notes: en-US/changelogs/283.txt');
    expect(w.ran('gh')).toHaveLength(0);
    expect(w.ran('npx')).toHaveLength(0);
    expect(ctx.report.outcomes.map(o => o.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
  });
});
