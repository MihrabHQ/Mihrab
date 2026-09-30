/**
 * The shell side of the port, run rather than read.
 *
 * release.sh and verify-release.sh are run for real here — copied into a
 * scratch tree whose scripts/release/main.ts is a stub that writes down
 * what it was handed — to hold the three things the port promises the
 * shell: RELEASE_TS=1 hands over the same arguments and keeps the exit
 * status; shadow mode hands the TypeScript every verdict the shell printed,
 * `pend` included; and nothing the TypeScript does can change the shell's
 * verdict or exit status.
 *
 * They need Node's type stripping (22.6 or later), as the tool itself
 * does. CI and the Mac both run Node 22, so both run them; an older Node
 * skips them.
 */
import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.join(__dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);
const canStrip = major > 22 || (major === 22 && minor >= 6);
const d = canStrip ? describe : describe.skip;

const STUB = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const i = argv.indexOf('--record');
const record = i >= 0 && existsSync(argv[i + 1]) ? readFileSync(argv[i + 1], 'utf8') : '';
appendFileSync(process.env.STUB_OUT as string, JSON.stringify({ argv, record }) + '\\n');
if (argv[0] === 'shadow') {
  if (process.env.STUB_BROKEN) {
    console.log('SyntaxError: the stub is broken on purpose');
    process.exit(1);
  }
  console.log('  ◦ shadow (TypeScript) ' + argv[1] + ': agrees (stub)');
} else {
  console.log('stub ' + argv[0]);
  process.exit(Number(process.env.STUB_EXIT ?? 0));
}
`;

/** A scratch repo holding copies of the two scripts and the stub. */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mihrab-shell-'));
  const scripts = path.join(dir, 'scripts');
  mkdirSync(path.join(scripts, 'release'), { recursive: true });
  for (const f of ['release.sh', 'verify-release.sh']) {
    copyFileSync(path.join(REPO, 'scripts', f), path.join(scripts, f));
    chmodSync(path.join(scripts, f), 0o755);
  }
  writeFileSync(path.join(scripts, 'release', 'package.json'), '{"type":"module"}\n');
  writeFileSync(path.join(scripts, 'release', 'main.ts'), STUB);
  writeFileSync(path.join(scripts, 'xcode-cloud.py'), '');
  mkdirSync(path.join(dir, 'android', 'app'), { recursive: true });
  writeFileSync(path.join(dir, 'android', 'app', 'build.gradle'), 'versionCode 282\nversionName "2.27.1"\n');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const home = path.join(dir, 'home');
  mkdirSync(home);
  const out = path.join(dir, 'stub.jsonl');
  return {
    dir,
    bin,
    /** A fake command on PATH, ahead of the real one. */
    fake(name: string, body: string) {
      writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`);
      chmodSync(path.join(bin, name), 0o755);
    },
    run(script: string, args: string[], env: Record<string, string> = {}) {
      // The shell paths are what most tests here exercise, so they run with
      // RELEASE_TS=0 unless a test says otherwise ('' is unset: the default).
      const { RELEASE_TS: _inherited, ...inherited } = process.env;
      const r = spawnSync('bash', [path.join(scripts, script), ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...inherited, PATH: `${bin}:${process.env.PATH}`, HOME: home, STUB_OUT: out, NODE_ENV: 'test', RELEASE_TS: '0', ...env },
        timeout: 60_000,
      });
      return { status: r.status, text: `${r.stdout}${r.stderr}` };
    },
    stubCalls(): Array<{ argv: string[]; record: string }> {
      return existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    },
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}

d('the release is handed to the TypeScript (the default; RELEASE_TS=0 keeps the shell)', () => {
  it('release.sh passes its arguments through and exits with the TypeScript’s status', () => {
    const s = scratch();
    try {
      const r = s.run('release.sh', ['2.28.0', '--dry-run'], { RELEASE_TS: '1', STUB_EXIT: '7' });
      expect(r.status).toBe(7);
      expect(r.text).toContain('stub release');
      expect(s.stubCalls()).toEqual([{ argv: ['release', '2.28.0', '--dry-run'], record: '' }]);
    } finally {
      s.clean();
    }
  });

  it('verify-release.sh passes the tag and how it was called', () => {
    const s = scratch();
    try {
      const r = s.run('verify-release.sh', ['v2.28.0'], { RELEASE_TS: '1', STUB_EXIT: '1' });
      expect(r.status).toBe(1);
      const call = s.stubCalls()[0];
      expect(call.argv.slice(0, 3)).toEqual(['verify', 'v2.28.0', '--self']);
      expect(call.argv[3]).toMatch(/scripts\/verify-release\.sh$/);
    } finally {
      s.clean();
    }
  });

  it('on a Node too old to strip types, says so and lets the shell run — not "bad option"', () => {
    const OLD_NODE = 'case "$1" in -e) exit 1 ;; --version) echo v20.11.0 ;; *) echo "node: bad option: $1" >&2; exit 9 ;; esac';
    const WARNING = '  ⚠ the TypeScript release tool needs Node 22.6 or later and this is v20.11.0 — the shell script runs instead';
    const s = scratch();
    try {
      s.fake('node', OLD_NODE);
      const r = s.run('release.sh', ['not-a-version'], { RELEASE_TS: '1', RELEASE_SHADOW: '0' });
      expect(r.status).toBe(1);
      expect(r.text).toContain(WARNING);
      expect(r.text).toContain("version must be X.Y.Z, got 'not-a-version'");
      expect(r.text).not.toContain('bad option');
      s.fake('git', 'exit 0');
      s.fake('gh', 'exit 0');
      s.fake('curl', 'case "$*" in *"%{http_code}"*) printf 404 ;; esac; exit 22');
      s.fake('python3', 'echo -1');
      const v = s.run('verify-release.sh', ['v2.28.0'], { RELEASE_TS: '1', RELEASE_SHADOW: '0' });
      expect(v.text).toContain(WARNING);
      expect(v.text).toContain('── RELEASE VERIFICATION FAILED');
      expect(s.stubCalls()).toEqual([]);
    } finally {
      s.clean();
    }
  });

  it('is on unless RELEASE_TS=0', () => {
    const s = scratch();
    try {
      const r = s.run('release.sh', ['2.28.0', '--dry-run'], { RELEASE_TS: '', STUB_EXIT: '7' });
      expect(r.status).toBe(7);
      expect(s.stubCalls()).toEqual([{ argv: ['release', '2.28.0', '--dry-run'], record: '' }]);
      s.run('release.sh', ['not-a-version'], { RELEASE_TS: '0', RELEASE_SHADOW: '0' });
      expect(s.stubCalls().length).toBe(1);
    } finally {
      s.clean();
    }
  });
});

d('release.sh shadows its preflight', () => {
  const setup = () => {
    const s = scratch();
    // P1 passes (gh and python3 faked); P2 then stops: the scratch tree has
    // no build-catalyst.sh, so there is no working Xcode to ask.
    s.fake('gh', 'exit 0');
    s.fake('python3', 'exit 0');
    return s;
  };

  it('a stop in preflight hands the TypeScript every verdict so far, and keeps exit 1', () => {
    const s = setup();
    try {
      const r = s.run('release.sh', ['2.28.0']);
      expect(r.status).toBe(1);
      expect(r.text).toContain('  ◦ shadow (TypeScript) preflight: agrees (stub)');
      const [call] = s.stubCalls();
      expect(call.argv.slice(0, 7)).toEqual(['shadow', 'preflight', '2.28.0', '--old-version', '2.27.1', '--old-code', '282']);
      expect(call.record).toBe('ok\ttools present\ndie\tno working Xcode for the Catalyst build — see above\n');
      // The attempts log still gets its line.
      expect(readFileSync(path.join(s.dir, '.release-attempts.log'), 'utf8')).toMatch(/\t2\.28\.0\tno working Xcode/);
    } finally {
      s.clean();
    }
  });

  it('a broken TypeScript is one line saying so, and changes nothing else', () => {
    const s = setup();
    try {
      const r = s.run('release.sh', ['2.28.0'], { STUB_BROKEN: '1' });
      expect(r.status).toBe(1);
      expect(r.text).toContain('  ◦ shadow (TypeScript) preflight did not run: SyntaxError: the stub is broken on purpose');
    } finally {
      s.clean();
    }
  });

  it('RELEASE_SHADOW=0 turns it off', () => {
    const s = setup();
    try {
      const r = s.run('release.sh', ['2.28.0'], { RELEASE_SHADOW: '0' });
      expect(r.status).toBe(1);
      expect(s.stubCalls()).toEqual([]);
      expect(r.text).not.toContain('◦ shadow');
    } finally {
      s.clean();
    }
  });
});

d('verify-release.sh shadows every check, pend included', () => {
  it('records ✓ ✗ and ⧗ alike, and its own verdict and exit status stand', () => {
    const s = scratch();
    try {
      s.fake('git', 'exit 0');
      s.fake('gh', 'exit 0');
      s.fake('curl', 'case "$*" in *"%{http_code}"*) printf 404 ;; esac; exit 22');
      s.fake('python3', 'case "$*" in *shipped*) echo "2.28.0: #741 is still going"; exit 3 ;; *) echo -1 ;; esac');
      const r = s.run('verify-release.sh', ['v2.28.0']);
      expect(r.status).toBe(1);
      expect(r.text).toContain('⧗ iOS: 2.28.0: #741 is still going');
      expect(r.text).toContain('  ◦ shadow (TypeScript) verify: agrees (stub)');
      expect(r.text).toContain('── RELEASE VERIFICATION FAILED');
      const [call] = s.stubCalls();
      expect(call.argv.slice(0, 3)).toEqual(['shadow', 'verify', 'v2.28.0']);
      const record = call.record.split('\n');
      expect(record).toContain('fail\ttag v2.28.0 missing on origin');
      expect(record).toContain('fail\tGitHub release v2.28.0 not found');
      expect(record).toContain('pend\tiOS: 2.28.0: #741 is still going');
      // One line per verdict printed, no more and no fewer.
      const printed = r.text.split('\n').filter(l => /^[✓✗⧗] /.test(l));
      expect(record.filter(Boolean)).toHaveLength(printed.length);
    } finally {
      s.clean();
    }
  });
});

d('verify-release.sh cannot pass a check it could not make', () => {
  it('an APK with no readable dex fails the Google check, in the TypeScript’s words', () => {
    const s = scratch();
    try {
      s.fake('git', 'exit 0');
      s.fake('gh', 'exit 0');
      // The APK downloads; every other request fails.
      s.fake('curl', 'case "$*" in *"%{http_code}"*) printf 404 ;; *"-sfL -o "*) exit 0 ;; esac; exit 22');
      s.fake('unzip', 'exit 9');
      s.fake('python3', 'echo -1');
      s.run('verify-release.sh', ['v2.28.0']);
      const record = s.stubCalls()[0].record.split('\n');
      expect(record).toContain('fail\tpublished APK has no readable classes*.dex — cannot check it for Google Play Services');
      expect(record).not.toContain('pass\tpublished APK carries no Google Play Services');
    } finally {
      s.clean();
    }
  });
});

d('the TypeScript itself runs under Node', () => {
  const node = (args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', path.join(REPO, 'scripts/release/main.ts'), ...args], {
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('loads every module and answers --help', () => {
    const r = node(['--help']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('usage: main.ts release X.Y.Z');
  });

  it('a shadow with nothing to go on is still exit 0 and one line', () => {
    const r = node(['shadow', 'nonsense']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
  });
});

describe('the release tool typechecks as Node will run it', () => {
  it('passes tsc with erasableSyntaxOnly and verbatimModuleSyntax', () => {
    const r = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(REPO, 'scripts/release')], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  }, 130_000);
});
