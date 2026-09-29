/**
 * What a gate says, printed the way the shell prints it and kept for
 * shadow mode to compare.
 *
 * The shell scripts speak in four marks, and the marks are the contract
 * people read at 1am, so they are kept exactly:
 *
 *   ✓  passed                       ⚠  not a pass, not a stop — past the
 *   ✗  stopped (release.sh's die),      point where anything can be undone
 *      or failed (verify's fail)    ⧗  not finished — "still building" is
 *                                      not a verdict (2.13.0)
 *
 * Every line also lands in `outcomes`, with the gate's id from the
 * inventory in docs/rewrite-plan.md, which is what shadow mode compares
 * against the shell's own record of the same run.
 */
import type { Io } from './io.ts';

export type Kind = 'ok' | 'warn' | 'fail' | 'pend' | 'stop' | 'skip';

export interface Outcome {
  id: string;
  kind: Kind;
  text: string;
  /**
   * For `skip` in shadow mode: the shell's own line this step is trusted
   * from (the TS did not re-run jest or Gradle beside the shell; it
   * accepts the shell's ✓ for it). Shadow mode matches it off rather than
   * calling it a disagreement.
   */
  trusts?: string;
}

/** release.sh's `die`: the release stops here, and says why. */
export class ReleaseStop extends Error {
  readonly id: string;
  constructor(id: string, message: string) {
    super(message);
    this.id = id;
  }
}

export type Style = 'release' | 'verify';

export class Reporter {
  readonly outcomes: Outcome[] = [];
  private readonly io: Io;
  private readonly style: Style;
  /** Shadow mode prints nothing but its one line. */
  readonly quiet: boolean;
  failed = false;
  pending = false;

  constructor(io: Io, style: Style, quiet = false) {
    this.io = io;
    this.style = style;
    this.quiet = quiet;
  }

  private add(o: Outcome) {
    this.outcomes.push(o);
  }

  /** A heading, as the shell's `step`. */
  step(title: string) {
    if (!this.quiet) this.io.out(`\n\u001b[1m▸ ${title}\u001b[0m`);
  }

  /** Bold text, as the shell's `bold`. */
  bold(text: string) {
    if (!this.quiet) this.io.out(`\u001b[1m${text}\u001b[0m`);
  }

  /** Plain text the shell prints with echo: not a verdict. */
  say(text: string) {
    if (!this.quiet) this.io.out(text);
  }

  sayErr(text: string) {
    if (!this.quiet) this.io.err(text);
  }

  ok(id: string, text: string) {
    this.add({ id, kind: 'ok', text });
    if (!this.quiet) this.io.out(this.style === 'release' ? `  ✓ ${text}` : `✓ ${text}`);
  }

  warn(id: string, text: string) {
    this.add({ id, kind: 'warn', text });
    if (!this.quiet) this.io.err(`  ⚠ ${text}`);
  }

  fail(id: string, text: string) {
    this.failed = true;
    this.add({ id, kind: 'fail', text });
    if (!this.quiet) this.io.out(`✗ ${text}`);
  }

  pend(id: string, text: string) {
    this.pending = true;
    this.add({ id, kind: 'pend', text });
    if (!this.quiet) this.io.out(`⧗ ${text}`);
  }

  /** A step shadow mode did not repeat, and whose ✓ it takes from the shell. */
  skip(id: string, text: string, trusts?: string) {
    this.add({ id, kind: 'skip', text, trusts });
  }

  /**
   * A stop whose words the caller has already printed in its own format
   * (build-catalyst.sh's and build-ios-appstore.sh's `✗` lines).
   */
  halt(id: string, text: string): never {
    this.add({ id, kind: 'stop', text });
    throw new ReleaseStop(id, text);
  }

  /** release.sh's `die`. Records, prints, and throws — the caller exits 1. */
  stop(id: string, text: string): never {
    this.add({ id, kind: 'stop', text });
    if (!this.quiet) this.io.err(`\n  ✗ ${text}\n`);
    throw new ReleaseStop(id, text);
  }
}
