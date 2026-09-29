/**
 * The world the release tool talks to, as interfaces.
 *
 * Every gate in scripts/release/ reaches the machine only through these:
 * commands through `Exec`, the network through `Http`, files through `Fs`,
 * time through `Clock`. That is the whole point of the port. The shell
 * scripts could only be tested by searching their text, because a gate
 * written as `codesign -dv "$APP" 2>&1 | grep -q …` cannot be run anywhere
 * but a Mac holding a signed build. Written against these, the same gate is
 * a function a test hands a fake `codesign` answer to.
 *
 * `realIo()` at the bottom is the only code here that touches the real
 * machine, and it is deliberately thin: no decisions, no retries, no
 * parsing. Anything worth testing belongs in a gate, not in here.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

export interface ExecOptions {
  cwd?: string;
  /** Merged over the tool's own environment; `undefined` removes a name. */
  env?: Record<string, string | undefined>;
  /** Written to the command's stdin. */
  input?: string;
  /**
   * Let the command's output through to the terminal instead of capturing
   * it — for the long builds, whose progress a person is watching. Nothing
   * is captured then, so no gate may read `stdout` from a streamed run.
   */
  stream?: boolean;
  /**
   * Send stdout and stderr to this file instead (the shell's
   * `>/tmp/release-catalyst.log 2>&1`). Nothing is captured.
   */
  logFile?: string;
  /** Append rather than truncate `logFile` (the shell's `>>`). */
  appendLog?: boolean;
  timeoutMs?: number;
}

export interface ExecResult {
  /** The exit status; 127 when the command could not be started at all. */
  code: number;
  stdout: string;
  stderr: string;
}

export interface Exec {
  run(cmd: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
}

export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  /** 0 when the request never got an answer (DNS, TLS, timeout). */
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface Http {
  /** Follows redirects, as `curl -L` does. */
  request(req: HttpRequest): Promise<HttpResponse>;
  /**
   * Follows redirects and writes the body to `dest` — only on a 2xx
   * (`curl -f`), unless `keepErrorBody` asks for what plain `curl -sL -o`
   * does: save whatever came back, a 404 page included.
   */
  download(url: string, dest: string, opts?: { keepErrorBody?: boolean }): Promise<{ status: number }>;
}

export interface Fs {
  exists(p: string): boolean;
  isDir(p: string): boolean;
  isFile(p: string): boolean;
  /** An executable regular file (the shell's `[ -x … ]` on a file). */
  isExecutable(p: string): boolean;
  isSymlink(p: string): boolean;
  /** Bytes; 0 for a file that is not there (the shell's `[ -s … ]`). */
  size(p: string): number;
  readText(p: string): string;
  /** Raw bytes as a latin1 string — for searching binaries for ASCII. */
  readBinary(p: string): string;
  writeText(p: string, text: string): void;
  appendText(p: string, text: string): void;
  mkdir(p: string): void;
  /** A fresh directory under the system temp dir. */
  mkdtemp(prefix: string): string;
  rm(p: string): void;
  copy(from: string, to: string): void;
  symlink(target: string, link: string): void;
  list(dir: string): string[];
  sha256(p: string): string;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Io {
  exec: Exec;
  http: Http;
  fs: Fs;
  clock: Clock;
  env: Record<string, string | undefined>;
  /** One line to stdout / stderr. The reporter decides what they say. */
  out(line: string): void;
  err(line: string): void;
  /** Ask a person a question and wait (build-ios-appstore's "Continue?"). */
  ask(question: string): Promise<string>;
  /**
   * The shell's `trap … EXIT` for the one case `finally` cannot cover: a
   * Ctrl-C, a `kill`, a closed terminal. Runs `restore`, then exits
   * 128 + the signal's number, as the shell would. The returned function
   * stops listening, for when the thing to restore is restored.
   */
  onInterrupt(restore: () => void): () => void;
}

// ── The real machine ──────────────────────────────────────────────────

function realExec(): Exec {
  return {
    run(cmd, args, opts = {}) {
      return new Promise(resolve => {
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries({ ...process.env, ...(opts.env ?? {}) })) {
          if (v !== undefined) env[k] = v;
        }
        let logFd: number | undefined;
        if (opts.logFile) logFd = nodeFs.openSync(opts.logFile, opts.appendLog ? 'a' : 'w');
        const stdio: Array<'pipe' | 'inherit' | 'ignore' | number> = logFd !== undefined
          ? ['pipe', logFd, logFd]
          : opts.stream
            ? // A streamed command is one a person is watching, and may be
              // asked something by (the local iOS build's "Continue?"): it
              // gets the terminal, as the shell's commands did.
              [opts.input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit']
            : ['pipe', 'pipe', 'pipe'];
        let child;
        try {
          child = spawn(cmd, args, { cwd: opts.cwd, env, stdio });
        } catch (e) {
          if (logFd !== undefined) nodeFs.closeSync(logFd);
          resolve({ code: 127, stdout: '', stderr: String(e) });
          return;
        }
        const out: Buffer[] = [];
        const errs: Buffer[] = [];
        child.stdout?.on('data', (b: Buffer) => out.push(b));
        child.stderr?.on('data', (b: Buffer) => errs.push(b));
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (opts.timeoutMs) timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
        child.on('error', e => {
          if (timer) clearTimeout(timer);
          if (logFd !== undefined) nodeFs.closeSync(logFd);
          resolve({ code: 127, stdout: '', stderr: String(e) });
        });
        child.on('close', (code, signal) => {
          if (timer) clearTimeout(timer);
          if (logFd !== undefined) nodeFs.closeSync(logFd);
          resolve({
            // A signal is reported the way the shell reports it: 128 + n.
            code: code ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1),
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: Buffer.concat(errs).toString('utf8'),
          });
        });
        if (child.stdin) {
          if (opts.input !== undefined) child.stdin.end(opts.input);
          else child.stdin.end();
        }
      });
    },
  };
}

/**
 * Why a request got no answer. `fetch` throws "fetch failed" and keeps the
 * reason (ECONNREFUSED, ENOTFOUND, a certificate) one level down.
 */
export function failureReason(e: unknown): string {
  // Duck-typed, not `instanceof Error`: an error from another realm (undici
  // inside a test's VM) is an Error that instanceof does not recognise.
  const cause = typeof e === 'object' && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return cause === undefined ? String(e) : `${String(e)}: ${failureReason(cause)}`;
}

function realHttp(): Http {
  // THE TIMER RUNS UNTIL THE BODY IS READ, not until the headers arrive.
  // `fetch` resolves on the headers; clearing the timeout there left the
  // body with none, and a server that answers and then stalls (a CDN
  // mid-download) held the release for as long as it liked. So the caller
  // reads the body inside `go`, under the same abort.
  const go = async <T>(req: HttpRequest, read: (res: Response) => Promise<T>): Promise<T> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), req.timeoutMs ?? 120_000);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        redirect: 'follow',
        signal: ctl.signal,
      });
      return await read(res);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    async request(req) {
      try {
        return await go(req, async res => {
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k.toLowerCase()] = v;
          });
          return { status: res.status, headers, text: req.method === 'HEAD' ? '' : await res.text() };
        });
      } catch (e) {
        // Status 0 is "no answer", and the reason travels with it: a gate
        // that prints "HTTP 000" can at least say whether it was DNS, TLS
        // or the timeout.
        return { status: 0, headers: {}, text: failureReason(e) };
      }
    },
    async download(url, dest, opts = {}) {
      try {
        return await go({ method: 'GET', url, timeoutMs: 30 * 60_000 }, async res => {
          if (res.ok || opts.keepErrorBody) nodeFs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
          return { status: res.status };
        });
      } catch {
        return { status: 0 };
      }
    },
  };
}

function realFs(): Fs {
  const stat = (p: string) => {
    try {
      return nodeFs.statSync(p);
    } catch {
      return undefined;
    }
  };
  return {
    exists: p => stat(p) !== undefined,
    isDir: p => stat(p)?.isDirectory() ?? false,
    isFile: p => stat(p)?.isFile() ?? false,
    isExecutable: p => {
      const s = stat(p);
      // eslint-disable-next-line no-bitwise -- the execute bits of a file mode
      return !!s && s.isFile() && (s.mode & 0o111) !== 0;
    },
    isSymlink: p => {
      try {
        return nodeFs.lstatSync(p).isSymbolicLink();
      } catch {
        return false;
      }
    },
    size: p => stat(p)?.size ?? 0,
    readText: p => nodeFs.readFileSync(p, 'utf8'),
    readBinary: p => nodeFs.readFileSync(p).toString('latin1'),
    writeText: (p, t) => nodeFs.writeFileSync(p, t),
    appendText: (p, t) => nodeFs.appendFileSync(p, t),
    mkdir: p => nodeFs.mkdirSync(p, { recursive: true }),
    mkdtemp: prefix => nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix)),
    rm: p => nodeFs.rmSync(p, { recursive: true, force: true }),
    copy: (from, to) => nodeFs.cpSync(from, to, { recursive: true }),
    symlink: (target, link) => {
      nodeFs.rmSync(link, { force: true });
      nodeFs.symlinkSync(target, link);
    },
    list: dir => {
      try {
        return nodeFs.readdirSync(dir);
      } catch {
        return [];
      }
    },
    sha256: p => createHash('sha256').update(nodeFs.readFileSync(p)).digest('hex'),
  };
}

export function realIo(): Io {
  return {
    exec: realExec(),
    http: realHttp(),
    fs: realFs(),
    clock: { now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)) },
    env: process.env,
    out: line => process.stdout.write(`${line}\n`),
    err: line => process.stderr.write(`${line}\n`),
    ask: question =>
      new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        let answered = false;
        // No terminal to answer from (stdin closed) is a no, not a hang.
        rl.on('close', () => {
          if (!answered) resolve('');
        });
        rl.question(question, answer => {
          answered = true;
          rl.close();
          resolve(answer);
        });
      }),
    onInterrupt: restore => {
      const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
      const handlers = signals.map(sig => {
        const handler = () => {
          try {
            restore();
          } finally {
            process.exit(128 + (os.constants.signals[sig] ?? 0));
          }
        };
        process.once(sig, handler);
        return [sig, handler] as const;
      });
      return () => {
        for (const [sig, handler] of handlers) process.removeListener(sig, handler);
      };
    },
  };
}
