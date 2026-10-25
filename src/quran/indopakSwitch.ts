/**
 * The off switch for the IndoPak download.
 *
 * ── WHY A SWITCH, AND WHY IT IS READ FIRST ────────────────────────────
 *
 * The files are mirrored by this repository and pinned by hash, so the
 * one way they stop being offered is a decision: a rights objection, a
 * text error found after release. Taking the mirror release down is NOT
 * that decision — the app falls back to DigitalKhatt and the download
 * goes on. So the app asks a small file in this repository before it
 * offers the button at all; readers who already have the muṣḥaf keep it.
 *
 * ── AND WHY IT FAILS OPEN ─────────────────────────────────────────────
 *
 * Unreachable means "offer it": the switch exists for a decision that
 * will be taken deliberately and rarely, and a reader on a poor
 * connection should not lose a feature because a 400-byte file timed
 * out. Only an answer that says `false` turns the button off.
 */
import { fetchContentOnce } from './contentNetwork';

export const INDOPAK_SWITCH_URL =
  'https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/data/app-config/v1.json';

const DEADLINE_MS = 8_000;
/** How long an answer is trusted before it is asked for again. */
const TTL_MS = 6 * 60 * 60 * 1000;

let answer: { offered: boolean; at: number } | null = null;
let asking: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

/** Is the IndoPak download offered, as last heard? Open until told otherwise. */
export function indopakOffered(): boolean {
  return answer?.offered ?? true;
}

/**
 * Ask the switch, once per `TTL_MS`; callers re-render through
 * `subscribeIndopakSwitch` when the answer lands.
 */
export function refreshIndopakSwitch(): Promise<boolean> {
  if (answer && Date.now() - answer.at < TTL_MS) return Promise.resolve(answer.offered);
  if (asking) return asking;
  asking = (async () => {
    let offered = true;
    try {
      const res = await fetchContentOnce(INDOPAK_SWITCH_URL, undefined, DEADLINE_MS);
      if (res.ok) {
        const body = (await res.json()) as { indopak?: { download?: unknown } };
        if (body?.indopak?.download === false) offered = false;
      }
    } catch {
      // Unreachable: open, as above.
    }
    answer = { offered, at: Date.now() };
    for (const l of listeners) l();
    return offered;
  })();
  asking.finally(() => {
    asking = null;
  });
  return asking;
}

export function subscribeIndopakSwitch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function _resetIndopakSwitchForTests(): void {
  answer = null;
  asking = null;
}
