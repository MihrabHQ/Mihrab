/**
 * The two questions about this Mac that more than one step asks: which
 * Xcode builds the Mac app, and which signing identity is in the keychain.
 * Preflight asks the first (P2), the Catalyst build both (C1, C2), the
 * local iOS build the second (A1).
 */
import type { Ctx } from './common.ts';
import { env } from './common.ts';

// ── C1 — WHICH XCODE BUILDS THE MAC: the selected one ─────────────────
//
// From 2.22.0 to 2.27 it could not be: Xcode 27 made a macOS deployment
// target below 12.0 an error and this build reported 10.15. The cause
// (rewrite plan 5.1, 2026-09-29): a Catalyst build has no macOS target of
// its own — Xcode reads IPHONEOS_DEPLOYMENT_TARGET through the SDK's
// iOS-to-Catalyst map, which has no entry for 15.1, so it fell back to
// iOS 13.1 = macOS 10.15. Catalyst builds say 15.2 through
// `[sdk=macosx*]` now. If this ever reports 10.15 again, look for a
// target whose iOS minimum is not in that map before anything else.
// CATALYST_DEVELOPER_DIR still names a toolchain outright.
export async function resolveCatalystToolchain(
  ctx: Ctx,
): Promise<{ ok: boolean; lines: string[]; developerDir?: string }> {
  const named = env(ctx, 'CATALYST_DEVELOPER_DIR');
  if (named && !ctx.io.fs.isDir(named)) {
    return { ok: false, lines: [`✗ CATALYST_DEVELOPER_DIR is not a directory: ${named}`] };
  }
  const r = await ctx.io.exec.run('xcodebuild', ['-version'], {
    env: named ? { DEVELOPER_DIR: named } : undefined,
  });
  const v = r.code === 0 ? /^Xcode ([0-9][0-9.]*)/m.exec(r.stdout)?.[1] : undefined;
  if (!v) {
    return {
      ok: false,
      lines: [
        '✗ No working Xcode: xcodebuild -version failed.',
        '  Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app',
      ],
    };
  }
  return {
    ok: true,
    lines: [`▸ Catalyst toolchain: Xcode ${v}${named ? ' (CATALYST_DEVELOPER_DIR)' : ''}`],
    developerDir: named || undefined,
  };
}

/** The first identity of this kind in `security find-identity` output. */
export function identityFrom(listing: string, kind: string): string {
  const re = new RegExp(`"(${kind}: [^"]*)"`);
  for (const line of listing.split('\n')) {
    const hit = re.exec(line);
    if (hit) return hit[1];
  }
  return '';
}

export async function findIdentity(ctx: Ctx, kind: string): Promise<string> {
  const r = await ctx.io.exec.run('security', ['find-identity', '-v', '-p', 'codesigning']);
  return identityFrom(r.stdout, kind);
}

