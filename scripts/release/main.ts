/**
 * The release tool's command line.
 *
 *   node --experimental-strip-types --no-warnings scripts/release/main.ts <command>
 *
 *   release X.Y.Z [--dry-run] | release --unreleased
 *   verify vX.Y.Z
 *   catalyst [--check-toolchain]
 *   ios-appstore [--no-upload]
 *   xcode-cloud runs|start|why|shipped|ensure|pause|resume …
 *   appstore-metadata [--dry-run] [--create X.Y.Z]
 *   shadow preflight|build|publish X.Y.Z --old-version A.B.C --old-code N --record FILE [--release-sha SHA --ios STATE]
 *   shadow verify vX.Y.Z --record FILE [--self PATH]
 *
 * Nobody is expected to type these: release.sh and verify-release.sh call
 * them (shadow mode by default, the whole cut with RELEASE_TS=1). They are
 * here so each part can also be run, and read, on its own.
 */
import * as path from 'node:path';
import * as os from 'node:os';
import { Asc } from './asc.ts';
import { appstoreMetadataMain } from './appstoreMetadata.ts';
import { buildCatalyst } from './catalyst.ts';
import type { Ctx } from './common.ts';
import { buildIosAppStore } from './iosAppStore.ts';
import type { Io } from './io.ts';
import { realIo } from './io.ts';
import { ReleaseStop, Reporter } from './report.ts';
import type { Release } from './preflight.ts';
import { release } from './release.ts';
import {
  SHADOW_MARK,
  report as shadowReport,
  shadowBuild,
  shadowCtx,
  shadowPreflight,
  shadowPublish,
  shadowVerify,
} from './shadow.ts';
import type { ShadowResult } from './shadow.ts';
import { verify } from './verify.ts';
import { xcodeCloudMain } from './xcodeCloud.ts';

export const USAGE = `usage: main.ts release X.Y.Z [--dry-run] | release --unreleased | verify vX.Y.Z
       | catalyst [--check-toolchain] | ios-appstore [--no-upload]
       | xcode-cloud <command> | appstore-metadata [--dry-run] [--create X.Y.Z]
       | shadow <preflight|build|publish|verify> …`;

/** `--name value` from an argument list. */
export function option(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function toolCtx(io: Io, root: string, home: string, style: 'release' | 'verify' = 'release'): Ctx {
  return { io, root, home, report: new Reporter(io, style), dryRun: false, shadow: false, wouldDo: [] };
}

async function halted(f: () => Promise<number>): Promise<number> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ReleaseStop) return 1;
    throw e;
  }
}

/**
 * How long a shadow may take before it gives up and says so. Beside
 * verification it downloads the APK and the zip a second time; everywhere
 * else it is git and a few API calls.
 */
export const SHADOW_DEADLINE_MS: Record<string, number> = {
  preflight: 3 * 60_000,
  build: 5 * 60_000,
  publish: 3 * 60_000,
  verify: 15 * 60_000,
};

export async function shadowMain(io: Io, root: string, home: string, argv: string[]): Promise<number> {
  const phase = argv[0] ?? '';
  const say = (l: string) => io.out(l);
  try {
    const recordFile = option(argv, '--record');
    const record = recordFile && io.fs.exists(recordFile) ? io.fs.readText(recordFile) : '';
    const deadline = SHADOW_DEADLINE_MS[phase];
    if (!deadline) {
      say(`${SHADOW_MARK}: unknown phase '${phase}'`);
      return 0;
    }
    const work = async (): Promise<ShadowResult> => {
      if (phase === 'verify') {
        const ctx = shadowCtx(io, root, home, 'verify');
        return shadowVerify(ctx, argv[1] ?? '', record, option(argv, '--self'));
      }
      const version = argv[1] ?? '';
      const oldCode = Number(option(argv, '--old-code'));
      const rel: Release = {
        version,
        tag: `v${version}`,
        oldVersion: option(argv, '--old-version') ?? '',
        oldCode,
        code: oldCode + 1,
      };
      const ctx = shadowCtx(io, root, home, 'release');
      if (phase === 'preflight') return shadowPreflight(ctx, rel, record);
      if (phase === 'build') return shadowBuild(ctx, rel, record);
      return shadowPublish(ctx, rel, {
        releaseSha: option(argv, '--release-sha') ?? '',
        ios: option(argv, '--ios') ?? '',
        zip: io.env.SKIP_CATALYST !== '1',
      });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), deadline);
    });
    const res = await Promise.race([work(), timeout]);
    if (timer) clearTimeout(timer);
    if (res === 'timeout') {
      const line = `${SHADOW_MARK} ${phase}: gave up after ${deadline / 60_000} min — nothing compared`;
      try {
        io.fs.appendText(`${root}/.release-shadow.log`, `== ${new Date(io.clock.now()).toISOString()} ${phase}: timed out\n`);
      } catch {
        // see report()
      }
      say(line);
      return 0;
    }
    say(shadowReport(io, root, res));
  } catch (e) {
    say(`${SHADOW_MARK} ${phase}: could not run — ${e instanceof Error ? e.message : String(e)}`);
  }
  return 0;
}

export async function main(io: Io, root: string, home: string, argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const ascCtx = () => ({ asc: new Asc(io, home), io, root, say: (l: string) => io.out(l) });
  switch (cmd) {
    case 'release':
      return release(io, root, home, rest);
    case 'verify':
      if (!rest[0]) {
        io.err('usage: verify-release.sh vX.Y.Z');
        return 1;
      }
      return halted(() => verify(toolCtx(io, root, home, 'verify'), rest[0], { self: option(rest, '--self') }));
    case 'catalyst':
      return halted(() => buildCatalyst(toolCtx(io, root, home), rest));
    case 'ios-appstore':
      return halted(() => buildIosAppStore(toolCtx(io, root, home), rest));
    case 'xcode-cloud':
      return xcodeCloudMain(ascCtx(), rest);
    case 'appstore-metadata':
      return appstoreMetadataMain(ascCtx(), rest);
    case 'shadow':
      return shadowMain(io, root, home, rest);
    default:
      io.err(USAGE);
      return cmd === '--help' || cmd === '-h' ? 0 : 1;
  }
}

// Run only as a program, never when a test imports this file.
const invokedAs = process.argv[1] ?? '';
if (/scripts[\\/]release[\\/]main\.ts$/.test(invokedAs)) {
  const root = path.resolve(path.dirname(invokedAs), '..', '..');
  // Exit once the output is flushed, rather than when the event loop is
  // empty: a shadow that gave up at its deadline may still hold a request
  // open, and it must not hold the release with it. (A pipe on macOS is
  // written asynchronously, hence the callback rather than a bare exit.)
  const finish = (code: number) => process.stdout.write('', () => process.exit(code));
  main(realIo(), root, os.homedir(), process.argv.slice(2)).then(finish, e => {
    process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    finish(1);
  });
}
