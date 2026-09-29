/**
 * The App Store Connect API, as scripts/xcode-cloud.py spoke to it.
 *
 * CREDENTIALS. The same App Store Connect API key notarytool and
 * build-ios-appstore.sh use. Nothing is written down in the repo: the
 * environment (`ASC_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID`) wins, then
 * ~/.config/mihrab/asc.json as {"keyPath":…, "keyId":…, "issuerId":…}.
 *
 * The token is an ES256 JWT signed with `node:crypto` — the Python needed
 * `pyjwt`, `cryptography` and `certifi` for the same fifteen lines, and
 * this needs nothing that Node does not already carry.
 */
import { createPrivateKey, sign } from 'node:crypto';
import type { Io } from './io.ts';

export const BASE = 'https://api.appstoreconnect.apple.com';

/**
 * What `sys.exit("…")` was in the Python: the command stops with this
 * message on stderr and exit status 1 — or another status, where the
 * Python raised `SystemExit(n)`.
 */
export class AscExit extends Error {
  readonly code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.code = code;
  }
}

export interface AscCreds {
  keyPath: string;
  keyId: string;
  issuerId: string;
}

export function configPath(home: string): string {
  return `${home}/.config/mihrab/asc.json`;
}

/** `~/…` in the config means the home directory, as the shell reads it. */
function expandHome(p: string, home: string): string {
  return p.startsWith('~/') ? `${home}${p.slice(1)}` : p;
}

export function credentials(io: Io, home: string): AscCreds {
  const file = configPath(home);
  const cfg: Record<string, string | undefined> = io.fs.exists(file)
    ? JSON.parse(io.fs.readText(file))
    : {};
  const creds = {
    keyPath: io.env.ASC_KEY_PATH || cfg.keyPath,
    keyId: io.env.ASC_KEY_ID || cfg.keyId,
    issuerId: io.env.ASC_ISSUER_ID || cfg.issuerId,
  };
  const missing = Object.entries(creds)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new AscExit(`missing credentials: ${missing.join(', ')} — see the header of scripts/release/asc.ts`);
  }
  return {
    keyPath: expandHome(creds.keyPath as string, home),
    keyId: creds.keyId as string,
    issuerId: creds.issuerId as string,
  };
}

const b64url = (b: Buffer) => b.toString('base64url');

/**
 * The token App Store Connect wants: ES256, `kid` the key id, `iss` the
 * issuer, fifteen minutes (the most it allows is twenty).
 */
export function makeToken(creds: AscCreds, pem: string, nowSeconds: number): string {
  const header = { alg: 'ES256', kid: creds.keyId, typ: 'JWT' };
  const claims = {
    iss: creds.issuerId,
    iat: nowSeconds,
    exp: nowSeconds + 900,
    aud: 'appstoreconnect-v1',
  };
  const input = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(
    Buffer.from(JSON.stringify(claims)),
  )}`;
  // JOSE wants the raw r‖s pair, not the DER that `sign` gives by default.
  const sig = sign('sha256', Buffer.from(input), {
    key: createPrivateKey(pem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${b64url(sig)}`;
}

// The API's JSON is loosely typed on purpose: every read below is guarded
// the way the Python's `.get(…)` chains were.
export type Json = any;

export class Asc {
  private readonly io: Io;
  private readonly home: string;
  private cached?: { token: string; at: number };

  constructor(io: Io, home: string) {
    this.io = io;
    this.home = home;
  }

  token(): string {
    // A token per request, as the Python made one — but a fresh one is
    // needed only when the last is near its fifteen minutes.
    const now = Math.floor(this.io.clock.now() / 1000);
    if (this.cached && now - this.cached.at < 600) return this.cached.token;
    const creds = credentials(this.io, this.home);
    const token = makeToken(creds, this.io.fs.readText(creds.keyPath), now);
    this.cached = { token, at: now };
    return token;
  }

  private url(path: string) {
    return path.startsWith('http') ? path : BASE + path;
  }

  /** GET, or POST when there is a body — the Python's `call`. */
  async call(path: string, body?: Json): Promise<Json> {
    return this.send(body ? 'POST' : 'GET', path, body, (status, text) =>
      `HTTP ${status}: ${text.slice(0, 1000)}`,
    );
  }

  /**
   * PATCH, which `call` cannot do — it is GET or POST by whether a body is
   * passed, and a PATCH needs both a body and its own verb.
   *
   * NULL IS NOT A VALUE HERE. App Store Connect treats an attribute sent as
   * `null` as one you did not send: clearing `branchStartCondition` this way
   * returns 200 and changes nothing, which is how "the trigger is off now"
   * can be believed for a whole release. Only attributes with real values
   * take, which is why pausing is `isEnabled: false` rather than the removal
   * of a start condition.
   */
  async patch(path: string, body: Json): Promise<Json> {
    return this.send('PATCH', path, body, (status, text) =>
      `HTTP ${status}: ${text.slice(0, 1000)}`,
    );
  }

  /** appstore-metadata.py's `send`: its errors name the method and path. */
  async write(method: string, path: string, body: Json): Promise<Json> {
    return this.send(method, path, body, (status, text) =>
      `${method} ${path}: HTTP ${status}: ${text.slice(0, 800)}`,
    );
  }

  private async send(
    method: string,
    path: string,
    body: Json,
    describe: (status: number, text: string) => string,
  ): Promise<Json> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token()}` };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await this.io.http.request({
      method,
      url: this.url(path),
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status < 200 || res.status >= 300) throw new AscExit(describe(res.status, res.text));
    return JSON.parse(res.text || '{}');
  }
}
