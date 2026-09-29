/**
 * How the release tool runs a part of itself as its own process — the
 * Catalyst build into its log file, the local iOS build — the way
 * release.sh ran build-catalyst.sh and build-ios-appstore.sh.
 *
 * Node's own type stripping, so there is nothing to compile and nothing
 * to install: `--experimental-strip-types` exists from Node 22.6 (it is
 * on by default from 22.18 and 23.6, where the flag is still accepted),
 * and `--no-warnings` keeps its "experimental" notice out of the logs.
 */
import type { Ctx } from './common.ts';

export const NODE_FLAGS = ['--experimental-strip-types', '--no-warnings'];

export function mainScript(root: string): string {
  return `${root}/scripts/release/main.ts`;
}

/** [command, args] that run `main.ts <args>` under this same Node. */
export function tsTool(ctx: Ctx, args: string[]): [string, string[]] {
  return [process.execPath, [...NODE_FLAGS, mainScript(ctx.root), ...args]];
}
