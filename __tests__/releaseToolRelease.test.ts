/**
 * The whole cut (scripts/release/release.ts): the order of the phases, the
 * exit status, and the attempts log — with each phase replaced by a stub,
 * since every phase has its own suite. What is held here is what only the
 * cut decides: a dry run stops before publishing, a stop AND a crash are
 * both written down, a failed verification is a stop, and a release whose
 * own commit fails CI exits 1.
 */
import type { Ctx } from '../scripts/release/common.ts';
import { release } from '../scripts/release/release.ts';
import { preflight } from '../scripts/release/preflight.ts';
import { build } from '../scripts/release/build.ts';
import { ciOnRelease, cleanup, installAsUser, publish } from '../scripts/release/publish.ts';
import { verify } from '../scripts/release/verify.ts';
import { GRADLE, HOME, ROOT, World } from './fixtures/releaseWorld';

jest.mock('../scripts/release/preflight.ts', () => ({
  ...jest.requireActual('../scripts/release/preflight.ts'),
  preflight: jest.fn(),
}));
jest.mock('../scripts/release/build.ts', () => ({
  ...jest.requireActual('../scripts/release/build.ts'),
  build: jest.fn(),
}));
jest.mock('../scripts/release/publish.ts', () => ({
  ...jest.requireActual('../scripts/release/publish.ts'),
  publish: jest.fn(),
  installAsUser: jest.fn(),
  ciOnRelease: jest.fn(),
  cleanup: jest.fn(),
}));
jest.mock('../scripts/release/verify.ts', () => ({
  ...jest.requireActual('../scripts/release/verify.ts'),
  verify: jest.fn(),
}));

const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const ATTEMPTS = `${ROOT}/.release-attempts.log`;
const BUILT = { apk: '/b/app.apk', aab: '/b/app.aab', zip: '/b/Mihrab-macOS-2.28.0.zip' };

beforeEach(() => {
  jest.clearAllMocks();
  mocked(preflight).mockResolvedValue('');
  mocked(build).mockResolvedValue(BUILT);
  mocked(publish).mockResolvedValue({ releaseSha: 'feedbeef00', ios: 'cloud' });
  mocked(verify).mockResolvedValue(0);
  mocked(installAsUser).mockResolvedValue(undefined);
  mocked(ciOnRelease).mockResolvedValue({ state: 'green', url: 'https://ci/1' });
  mocked(cleanup).mockResolvedValue(undefined);
});

const world = () => new World().file(`${ROOT}/android/app/build.gradle`, GRADLE);

describe('the cut', () => {
  it('a whole release that goes green exits 0, having run every phase in order', async () => {
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0'])).toBe(0);
    const order = [preflight, build, publish, verify, installAsUser, ciOnRelease, cleanup].map(
      f => mocked(f).mock.invocationCallOrder[0],
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(w.out.join('\n')).toContain('2.28.0 (283) is live on GitHub, Homebrew and the F-Droid recipe.');
    expect(w.files.has(ATTEMPTS)).toBe(false);
  });

  it('a dry run builds, cleans up, and publishes nothing', async () => {
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0', '--dry-run'])).toBe(0);
    expect(build).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    const out = w.out.join('\n');
    expect(out).toContain('Dry run. Everything that can fail has passed.');
    expect(out).toContain('/b/Mihrab-macOS-2.28.0.zip');
    // The context the phases were handed is not a dry run: the shell's dry
    // run stops before publishing rather than pretending through it.
    expect((mocked(build).mock.calls[0][0] as Ctx).dryRun).toBe(false);
  });

  it('a stop is written to the attempts log and exits 1', async () => {
    mocked(preflight).mockImplementation(async (ctx: Ctx) => ctx.report.stop('P3', 'not on main'));
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0'])).toBe(1);
    expect(w.files.get(ATTEMPTS)).toBe('2026-09-29T12:00:00Z\t2.28.0\tnot on main\n');
    expect(build).not.toHaveBeenCalled();
  });

  it('a crash is an abort too: logged, its stack printed, exit 1', async () => {
    mocked(build).mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'zip')\nsecond line"));
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0'])).toBe(1);
    expect(w.files.get(ATTEMPTS)).toBe(
      "2026-09-29T12:00:00Z\t2.28.0\tthe release tool crashed: Cannot read properties of undefined (reading 'zip')\n",
    );
    expect(w.err.join('\n')).toMatch(/TypeError: Cannot read properties[\s\S]*at /);
    expect(publish).not.toHaveBeenCalled();
  });

  it('a failed verification is a stop (V), and nothing after it runs', async () => {
    mocked(verify).mockResolvedValue(1);
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0'])).toBe(1);
    expect(w.files.get(ATTEMPTS)).toBe('2026-09-29T12:00:00Z\t2.28.0\tverification failed — see the ✗ lines above\n');
    expect(installAsUser).not.toHaveBeenCalled();
    expect(ciOnRelease).not.toHaveBeenCalled();
  });

  it('a release whose own commit fails CI exits 1 — after the summary, and without a stop', async () => {
    mocked(ciOnRelease).mockResolvedValue({ state: 'red', url: 'https://ci/9' });
    const w = world();
    expect(await release(w.io(), ROOT, HOME, ['2.28.0'])).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(w.out.join('\n')).toContain('is live — and its own commit fails CI');
    expect(w.files.has(ATTEMPTS)).toBe(false);
  });

  it('no version, or not X.Y.Z, is a stop logged against "?" or the bad version', async () => {
    const w = world();
    expect(await release(w.io(), ROOT, HOME, [])).toBe(1);
    expect(await release(w.io(), ROOT, HOME, ['2.28'])).toBe(1);
    expect(w.files.get(ATTEMPTS)).toBe(
      '2026-09-29T12:00:00Z\t?\tusage: release.sh X.Y.Z [--dry-run] | release.sh --unreleased\n' +
        "2026-09-29T12:00:00Z\t2.28\tversion must be X.Y.Z, got '2.28'\n",
    );
    expect(preflight).not.toHaveBeenCalled();
  });
});
