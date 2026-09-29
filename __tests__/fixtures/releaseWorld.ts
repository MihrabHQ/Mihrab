/**
 * A fake machine for the release tool's tests (scripts/release/).
 *
 * Commands answer from handlers registered by pattern — matched against
 * "cmd arg arg …", the newest registration winning — and a command nobody
 * registered FAILS (exit 1, "unhandled"), so a gate cannot pass on a
 * command the test forgot about. Files, HTTP and time are in memory;
 * sleeping advances the clock instantly.
 */
import { createHash } from 'crypto';
import type { Ctx } from '../../scripts/release/common.ts';
import type {
  ExecOptions,
  ExecResult,
  HttpRequest,
  HttpResponse,
  Io,
} from '../../scripts/release/io.ts';
import { ReleaseStop, Reporter } from '../../scripts/release/report.ts';
import type { Style } from '../../scripts/release/report.ts';

export interface Call {
  cmd: string;
  args: string[];
  line: string;
  opts: ExecOptions;
}

type Answer = Partial<ExecResult> | ((call: Call) => Partial<ExecResult> | undefined);
type HttpAnswer = Partial<HttpResponse> & { body?: string };

export class World {
  files = new Map<string, string>();
  dirs = new Set<string>();
  symlinks = new Map<string, string>();
  executables = new Set<string>();
  calls: Call[] = [];
  unhandled: string[] = [];
  requests: HttpRequest[] = [];
  env: Record<string, string | undefined> = {};
  out: string[] = [];
  err: string[] = [];
  answers: string[] = [];
  /** What a Ctrl-C would run now: `interrupt()` runs it, as the real one does. */
  interrupts: Array<() => void> = [];
  now = Date.parse('2026-09-29T12:00:00Z');
  slept = 0;
  private handlers: Array<[RegExp | string, Answer]> = [];
  private http = new Map<string, HttpAnswer | ((r: HttpRequest) => HttpAnswer)>();
  private tmp = 0;

  /** Answer every command whose line matches (a string matches as a prefix). */
  on(pattern: RegExp | string, answer: Answer): this {
    this.handlers.unshift([pattern, answer]);
    return this;
  }

  url(url: string, answer: HttpAnswer | ((r: HttpRequest) => HttpAnswer)): this {
    this.http.set(url, answer);
    return this;
  }

  file(path: string, text: string): this {
    this.files.set(path, text);
    let d = path.slice(0, path.lastIndexOf('/'));
    while (d) {
      this.dirs.add(d);
      d = d.slice(0, d.lastIndexOf('/'));
    }
    return this;
  }

  /** A directory, and every directory above it. */
  dir(path: string): this {
    let d = path;
    while (d) {
      this.dirs.add(d);
      d = d.slice(0, d.lastIndexOf('/'));
    }
    return this;
  }

  ran(pattern: RegExp | string): Call[] {
    return this.calls.filter(c =>
      typeof pattern === 'string' ? c.line.startsWith(pattern) : pattern.test(c.line),
    );
  }

  /** Index of the first call matching, or -1 — for asserting order. */
  indexOf(pattern: RegExp | string): number {
    return this.calls.findIndex(c =>
      typeof pattern === 'string' ? c.line.startsWith(pattern) : pattern.test(c.line),
    );
  }

  io(): Io {
    // eslint-disable-next-line consistent-this -- the fakes below close over the world
    const world = this;
    return {
      env: this.env,
      out: l => world.out.push(l),
      err: l => world.err.push(l),
      ask: async q => {
        world.out.push(q);
        return world.answers.shift() ?? '';
      },
      onInterrupt: restore => {
        world.interrupts.push(restore);
        return () => {
          world.interrupts = world.interrupts.filter(r => r !== restore);
        };
      },
      clock: {
        now: () => world.now,
        sleep: async ms => {
          world.now += ms;
          world.slept += ms;
        },
      },
      exec: {
        async run(cmd: string, args: string[], opts: ExecOptions = {}) {
          const call: Call = { cmd, args, line: [cmd, ...args].join(' '), opts };
          world.calls.push(call);
          for (const [pattern, answer] of world.handlers) {
            const hit =
              typeof pattern === 'string' ? call.line.startsWith(pattern) : pattern.test(call.line);
            if (!hit) continue;
            const a = typeof answer === 'function' ? answer(call) : answer;
            if (a === undefined) continue;
            const res = { code: 0, stdout: '', stderr: '', ...a };
            if (opts.logFile) {
              const prev = opts.appendLog ? world.files.get(opts.logFile) ?? '' : '';
              world.file(opts.logFile, prev + res.stdout + res.stderr);
            }
            return res;
          }
          world.unhandled.push(call.line);
          return { code: 1, stdout: '', stderr: `unhandled: ${call.line}` };
        },
      },
      http: {
        async request(req: HttpRequest) {
          world.requests.push(req);
          const a = world.http.get(req.url) ?? world.http.get(req.url.replace(/\?.*$/, ''));
          const ans = typeof a === 'function' ? a(req) : a;
          if (!ans) return { status: 0, headers: {}, text: '' };
          return { status: ans.status ?? 200, headers: ans.headers ?? {}, text: ans.text ?? ans.body ?? '' };
        },
        async download(url: string, dest: string, opts: { keepErrorBody?: boolean } = {}) {
          world.requests.push({ method: 'GET', url });
          const a = world.http.get(url);
          const ans = typeof a === 'function' ? a({ method: 'GET', url }) : a;
          if (!ans) return { status: 0 };
          const status = ans.status ?? 200;
          if ((status >= 200 && status < 300) || opts.keepErrorBody) world.file(dest, ans.body ?? ans.text ?? '');
          return { status };
        },
      },
      fs: {
        exists: p => world.files.has(p) || world.dirs.has(p) || world.symlinks.has(p),
        isDir: p => world.dirs.has(p),
        isFile: p => world.files.has(p),
        isExecutable: p => world.executables.has(p),
        isSymlink: p => world.symlinks.has(p),
        size: p => (world.files.get(p) ?? '').length,
        readText: p => {
          const t = world.files.get(p);
          if (t === undefined) throw new Error(`ENOENT: ${p}`);
          return t;
        },
        readBinary: p => world.files.get(p) ?? '',
        writeText: (p, t) => {
          world.file(p, t);
        },
        appendText: (p, t) => {
          world.file(p, (world.files.get(p) ?? '') + t);
        },
        mkdir: p => {
          world.dirs.add(p);
        },
        mkdtemp: prefix => {
          const d = `/tmp/${prefix}${++world.tmp}`;
          world.dirs.add(d);
          return d;
        },
        rm: p => {
          for (const k of [...world.files.keys()]) if (k === p || k.startsWith(`${p}/`)) world.files.delete(k);
          for (const k of [...world.dirs]) if (k === p || k.startsWith(`${p}/`)) world.dirs.delete(k);
          world.symlinks.delete(p);
        },
        copy: (from, to) => {
          world.file(to, world.files.get(from) ?? '');
        },
        symlink: (target, link) => {
          world.symlinks.set(link, target);
        },
        list: dir => {
          const names = new Set<string>();
          for (const k of [...world.files.keys(), ...world.dirs, ...world.symlinks.keys()]) {
            if (k.startsWith(`${dir}/`)) names.add(k.slice(dir.length + 1).split('/')[0]);
          }
          return [...names].sort();
        },
        sha256: p => sha(world.files.get(p) ?? ''),
      },
    };
  }

  /** A Ctrl-C: every restore still registered runs (the real one then exits). */
  interrupt(): void {
    for (const restore of [...this.interrupts]) restore();
  }

  ctx(opts: { style?: Style; shadow?: boolean; dryRun?: boolean; quiet?: boolean } = {}): Ctx {
    const io = this.io();
    return {
      io,
      root: ROOT,
      home: HOME,
      report: new Reporter(io, opts.style ?? 'release', opts.quiet ?? false),
      dryRun: opts.dryRun ?? false,
      shadow: opts.shadow ?? false,
      wouldDo: [],
    };
  }
}

/** What the fake `Fs.sha256` answers for a file holding `text`. */
export const sha = (text: string) => createHash('sha256').update(text, 'latin1').digest('hex');

export const ROOT = '/repo';
export const HOME = '/home/mac';
export const TAP = `${HOME}/git/homebrew-tap/Casks/mihrab.rb`;

/** A cask as the tap holds it: legacy postflight, chronod, pluginkit. */
export const GOOD_CASK = `cask "mihrab" do
  version "2.27.1"
  sha256 "${'a'.repeat(64)}"

  url "https://github.com/MihrabHQ/Mihrab/releases/download/v#{version}/Mihrab-macOS-#{version}.zip"
  depends_on macos: ">= :monterey"
  depends_on arch: :arm64

  app "Mihrab.app"

  postflight do
    system_command "/usr/bin/killall", args: ["chronod"]
    system_command "/usr/bin/pluginkit", args: ["-a", "#{appdir}/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex"]
  end
end
`;

export const GRADLE = `android {
  defaultConfig {
    versionCode 282
    versionName "2.27.1"
  }
}
`;

/** The outcomes a reporter collected, as "kind id text" lines. */
export const lines = (ctx: Ctx) => ctx.report.outcomes.map(o => `${o.kind} ${o.id} ${o.text}`);

/** Run a gate and return the stop's message, or undefined when it did not stop. */
export async function stopOf(f: () => unknown): Promise<string | undefined> {
  try {
    await f();
    return undefined;
  } catch (e) {
    if (e instanceof ReleaseStop) return e.message;
    throw e;
  }
}
