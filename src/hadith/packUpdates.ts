/**
 * A correction we publish reaches the packs already on a device.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────
 *
 * A pack was fetched once and then it was the pack for good. On
 * 2026-11-25 the 14th of an-Nawawi's Forty was found to show another
 * narration's translation; our copy was corrected the same day, and the
 * phone that already held the starter set went on showing the wrong one —
 * nothing ever asked whether what it held was still what we publish. The
 * only way to the correction was to delete the pack and download it again,
 * which nobody has a reason to do.
 *
 * ── THE CHECK ──────────────────────────────────────────────────────────
 *
 * Our copy's `manifest.json` names each pack's SHA-256
 * (`scripts/hadith/build-packs.js`). The check reads it, hashes each pack
 * on the device, and a pack that is not the file the manifest names is
 * fetched again from our copy, over the one here (`replacePack`).
 *
 * It runs when the Hadith tab is opened, and then:
 *
 *   • only where there is a pack to check — a device that has downloaded
 *     nothing makes no request;
 *   • at most once a day (`NEXT_KEY`), sooner — an hour — only when the
 *     last check was left unfinished: the manifest could not be read, a
 *     transfer broke off, or a large pack is waiting for Wi-Fi;
 *   • never in a browser, which has no file store and cannot read a
 *     release.
 *
 * ── WHAT IT FETCHES, AND OVER WHICH CONNECTION ─────────────────────────
 *
 * A corrected hadith is the reason this exists, so a pack up to
 * `QUIET_UPDATE_BYTES` is fetched over whatever connection there is: the
 * sets and most topics, a megabyte or so. Anything larger — the books, 4
 * to 23 MB — waits for a connection that is known not to be metered
 * (`isFreeConnection`); nobody chose to spend their data plan on a file
 * they already have.
 *
 * Nothing shows while it happens. The pack is readable throughout, a
 * transfer that fails leaves the old file in place, and what is on screen
 * is read again when the new one lands (`usePacksReadyKey`).
 *
 * A pack this device rebuilt from the original sources, because our copy
 * could not be reached that day, is not the manifest's file either. It is
 * replaced by our copy the same way — which is also what brings it the
 * corrections our copy has had since.
 *
 * What is sent: the requests themselves, to the same GitHub release the
 * packs came from. Nothing about the reader, and nothing new to a host
 * that was not already asked (PRIVACY_POLICY.md, "Hadith").
 */
import NetInfo from '@react-native-community/netinfo';
import { IS_WEB_APP } from '../config/webApp';
import AsyncStorage from '../storage/appStorage';
import { isFreeConnection } from '../utils/freeConnection';
import { quiet } from '../utils/quiet';
import { fetchManifest, manifestEntry, packSha256, readyPackKeys, replacePack, scanPacks } from './packs';
import type { PackKey } from './packTypes';

/** When the next check is due, as a time. Describes this device; not synced. */
export const NEXT_CHECK_KEY = 'hadith.packs.v1.nextCheck';

const HOUR = 60 * 60 * 1000;
export const PACK_CHECK_EVERY_MS = 24 * HOUR;
/** After a check that could not finish. */
export const PACK_CHECK_RETRY_MS = HOUR;
/** A pack larger than this waits for a connection that is not metered. */
export const QUIET_UPDATE_BYTES = 2 * 1024 * 1024;

export type PackUpdateReport = {
  /** False when it was not yet due, or there was nothing to check. */
  checked: boolean;
  replaced: PackKey[];
  /** Out of date, and left for Wi-Fi. */
  waiting: PackKey[];
  /** Out of date, and the transfer did not finish. */
  failed: PackKey[];
};

const NOTHING: PackUpdateReport = { checked: false, replaced: [], waiting: [], failed: [] };

let inFlight: Promise<PackUpdateReport> | null = null;

async function isDue(now: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NEXT_CHECK_KEY);
    if (raw == null) return true;
    const next = Number(raw);
    // A time further off than a check is ever set: a clock that was wrong
    // when it was written. Not a reason to wait a year.
    return !Number.isFinite(next) || now >= next || next - now > PACK_CHECK_EVERY_MS;
  } catch {
    return true;
  }
}

async function run(force: boolean, now: () => number): Promise<PackUpdateReport> {
  if (IS_WEB_APP) return NOTHING;
  await scanPacks();
  const held = readyPackKeys();
  // Nothing downloaded: nothing to ask about, and no request is made.
  if (!held.length) return NOTHING;
  if (!force && !(await isDue(now()))) return NOTHING;

  const report: PackUpdateReport = { checked: true, replaced: [], waiting: [], failed: [] };
  const manifest = await fetchManifest(true);
  let unfinished = !manifest;
  if (manifest) {
    const stale: Array<{ key: PackKey; sha256: string; bytes: number }> = [];
    for (const key of held) {
      const entry = manifestEntry(manifest, key);
      // Not a pack we publish, or a manifest from before it named them.
      if (!entry?.sha256) continue;
      const here = await packSha256(key);
      if (here && here !== entry.sha256.toLowerCase()) {
        stale.push({ key, sha256: entry.sha256.toLowerCase(), bytes: Number(entry.bytes) || 0 });
      }
    }
    if (stale.length) {
      const free = isFreeConnection(await NetInfo.fetch().catch(() => null));
      for (const pack of stale) {
        if (pack.bytes > QUIET_UPDATE_BYTES && !free) {
          report.waiting.push(pack.key);
          continue;
        }
        const outcome = await replacePack(pack.key, pack.sha256);
        if (outcome === 'replaced') report.replaced.push(pack.key);
        // 'refused' is our copy sending something other than its manifest
        // names: a release being uploaded. Tomorrow's check finds it done.
        else if (outcome === 'failed') report.failed.push(pack.key);
      }
    }
    unfinished = report.waiting.length > 0 || report.failed.length > 0;
  }
  const wait = unfinished ? PACK_CHECK_RETRY_MS : PACK_CHECK_EVERY_MS;
  await AsyncStorage.setItem(NEXT_CHECK_KEY, String(now() + wait)).catch(e => quiet('hadith/packUpdates', e));
  return report;
}

/**
 * Bring the packs on this device up to our copy, when a check is due.
 * Never throws; one runs at a time. `force` skips the once-a-day rule
 * (tests, and a "check now" should one be wanted).
 */
export function checkPackUpdates(opts: { force?: boolean; now?: () => number } = {}): Promise<PackUpdateReport> {
  if (!inFlight) {
    inFlight = run(!!opts.force, opts.now ?? Date.now)
      .catch(e => {
        quiet('hadith/packUpdates', e);
        return NOTHING;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
