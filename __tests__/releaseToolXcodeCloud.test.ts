/**
 * scripts/xcode-cloud.py, folded into TypeScript (scripts/release/
 * xcodeCloud.ts and asc.ts), against a fake App Store Connect.
 *
 * What releaseIosGate.test.ts holds by reading the Python's text, these
 * hold by running the port: newest-first runs, arrival-ordered builds, the
 * three answers of `shipped`, `ensure` never starting a second run beside
 * a live one, pausing by `isEnabled`.
 */
import { createPublicKey, generateKeyPairSync, verify as verifySig } from 'crypto';
import { Asc, credentials, makeToken } from '../scripts/release/asc.ts';
import type { XcCtx } from '../scripts/release/xcodeCloud.ts';
import {
  TRIGGER_GRACE_MINUTES,
  ensure,
  pause,
  resume,
  runLine,
  shipped,
  start,
  xcodeCloudMain,
} from '../scripts/release/xcodeCloud.ts';
import { HOME, ROOT, World } from './fixtures/releaseWorld';

const BASE = 'https://api.appstoreconnect.apple.com';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

interface Run {
  number: number;
  progress: string;
  sha?: string;
}

/** A fake App Store Connect with one product, one Default workflow. */
function apple(opts: {
  runs?: Run[];
  builds?: Array<{ version: string; marketing: string }>;
  enabled?: boolean;
  startStatus?: number;
} = {}) {
  const w = new World();
  w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/keys/AuthKey.p8', keyId: 'KEY1', issuerId: 'ISS' }));
  w.file('/keys/AuthKey.p8', PEM);
  const runs = (opts.runs ?? []).map(r => ({
    id: `run-${r.number}`,
    attributes: {
      number: r.number,
      executionProgress: r.progress,
      completionStatus: r.progress === 'COMPLETE' ? 'SUCCEEDED' : null,
      startReason: 'GIT_REF_CHANGE',
      sourceCommit: r.sha ? { commitSha: r.sha, message: 'Release 2.28.0 (283)\n\nbody' } : undefined,
    },
  }));
  const json = (data: unknown) => ({ text: JSON.stringify(data) });
  w.url(`${BASE}/v1/ciProducts?limit=10`, json({ data: [{ id: 'PROD', attributes: { name: 'Mihrab' } }] }));
  w.url(`${BASE}/v1/ciProducts/PROD/workflows?limit=20`, json({ data: [{ id: 'WF', attributes: { name: 'Default' } }] }));
  let enabled = opts.enabled ?? true;
  w.url(`${BASE}/v1/ciWorkflows/WF`, req => {
    if (req.method === 'PATCH') {
      enabled = JSON.parse(req.body ?? '{}').data.attributes.isEnabled;
      return json({ data: {} });
    }
    return json({ data: { attributes: { isEnabled: enabled } } });
  });
  for (const limit of [1, 5, 10, '3']) {
    w.url(`${BASE}/v1/ciProducts/PROD/buildRuns?limit=${limit}&sort=-number`, json({ data: runs.slice(0, Number(limit)) }));
  }
  w.url(`${BASE}/v1/ciBuildRuns`, () =>
    opts.startStatus
      ? { status: opts.startStatus, text: '{"errors":[{"status":"500","code":"UNEXPECTED_ERROR"}]}' }
      : json({ data: { id: 'NEW', attributes: { number: 741, executionProgress: 'PENDING' } } }),
  );
  w.url(`${BASE}/v1/apps?limit=10`, json({ data: [{ id: 'APP', attributes: { bundleId: 'com.hassan.prayerapp' } }] }));
  const builds = opts.builds ?? [];
  w.url(
    `${BASE}/v1/builds?filter[app]=APP&limit=30&sort=-uploadedDate&include=preReleaseVersion&fields[builds]=version,processingState,uploadedDate,preReleaseVersion&fields[preReleaseVersions]=version`,
    json({
      data: builds.map((b, i) => ({
        attributes: { version: b.version, processingState: 'VALID', uploadedDate: '2026-09-29' },
        relationships: { preReleaseVersion: { data: { id: `pre${i}` } } },
      })),
      included: builds.map((b, i) => ({ id: `pre${i}`, attributes: { version: b.marketing } })),
    }),
  );
  const said: string[] = [];
  const x: XcCtx = { asc: new Asc(w.io(), HOME), io: w.io(), root: ROOT, say: l => said.push(l) };
  return { w, x, said };
}

describe('the token', () => {
  it('is an ES256 JWT App Store Connect can verify with the key', () => {
    const t = makeToken({ keyPath: '', keyId: 'KEY1', issuerId: 'ISS' }, PEM, 1_800_000_000);
    const [h, c, s] = t.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({
      iss: 'ISS',
      iat: 1_800_000_000,
      exp: 1_800_000_900,
      aud: 'appstoreconnect-v1',
    });
    const ok = verifySig(
      'sha256',
      Buffer.from(`${h}.${c}`),
      { key: createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })), dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url'),
    );
    expect(ok).toBe(true);
  });

  it('takes the environment over the config file, and names what is missing', () => {
    const w = new World();
    w.env.ASC_KEY_ID = 'ENVKEY';
    expect(() => credentials(w.io(), HOME)).toThrow('missing credentials: keyPath, issuerId');
    w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '~/k.p8', keyId: 'CFG', issuerId: 'I' }));
    expect(credentials(w.io(), HOME)).toEqual({ keyPath: `${HOME}/k.p8`, keyId: 'ENVKEY', issuerId: 'I' });
  });
});

describe('runs', () => {
  it('asks newest first — unsorted is oldest first, which failed 2.13.1', async () => {
    const { w, x, said } = apple({ runs: [{ number: 740, progress: 'RUNNING', sha: 'abcdef1234' }] });
    expect(await xcodeCloudMain(x, ['runs', '3'])).toBe(0);
    const asked = w.requests.map(r => r.url).filter(u => u.includes('buildRuns'));
    expect(asked).toEqual([`${BASE}/v1/ciProducts/PROD/buildRuns?limit=3&sort=-number`]);
    expect(said[0]).toMatch(/^#740 RUNNING\/None {2}None {2}GIT_REF_CHANGE {2}abcdef12 {2}Release 2\.28\.0 \(283\) {2}id=run-740$/);
  });

  it('every buildRuns request sorts', async () => {
    const { w, x } = apple({ runs: [{ number: 1, progress: 'COMPLETE', sha: 'a' }] });
    await shipped(x, '9.9.9', 'bbbbbbbb');
    await ensure(x, 'aaaaaaaa', '0');
    for (const url of w.requests.map(r => r.url).filter(u => u.includes('buildRuns'))) expect(url).toContain('sort=-number');
  });

  it('prints None for what the API left out, as the Python did', () => {
    expect(runLine({ id: 'x', attributes: {} })).toBe('#None None/None  None  None      id=x');
  });
});

describe('shipped: 0 yes, 3 not yet, 2 never', () => {
  it('finds the version by its marketing version, among builds sorted by arrival', async () => {
    const { w, x, said } = apple({ builds: [{ version: '718', marketing: '2.28.0' }] });
    expect(await shipped(x, '2.28.0')).toBe(0);
    expect(said).toEqual(['2.28.0 is in App Store Connect: build 718, VALID, uploaded 2026-09-29']);
    const q = w.requests.find(r => r.url.includes('/v1/builds?'))?.url ?? '';
    expect(q).toContain('sort=-uploadedDate');
    expect(q).not.toContain('sort=-version');
  });

  it('is 3 while a run is still going', async () => {
    const { x, said } = apple({ runs: [{ number: 741, progress: 'RUNNING', sha: 'cafe0000' }] });
    expect(await shipped(x, '2.28.0', 'cafe0000')).toBe(3);
    expect(said[0]).toMatch(/#741 cafe0000 is still going/);
  });

  it('is 3 inside the grace window when Xcode Cloud has not seen the commit yet (2.13.1)', async () => {
    const { w, x, said } = apple({ runs: [{ number: 740, progress: 'COMPLETE', sha: 'old00000' }] });
    w.on('git -C /repo log -1 --format=%ct', { stdout: `${Math.floor(w.now / 1000) - 120}\n` });
    expect(await shipped(x, '2.28.0', 'new11111')).toBe(3);
    expect(said[0]).toContain('has not created a run for new11111 yet (2 min after the commit)');
  });

  it('is 2 once the commit is older than the grace window', async () => {
    const { w, x, said } = apple({ runs: [{ number: 740, progress: 'COMPLETE', sha: 'old00000' }] });
    w.on('git -C /repo log -1 --format=%ct', {
      stdout: `${Math.floor(w.now / 1000) - (TRIGGER_GRACE_MINUTES + 1) * 60}\n`,
    });
    expect(await shipped(x, '2.28.0', 'new11111')).toBe(2);
    expect(said[0]).toContain('is 16 min old and Xcode Cloud never started a run for it');
  });

  it('is 2 when nothing ever reached it and no commit was given', async () => {
    const { x, said } = apple({ runs: [] });
    expect(await shipped(x, '2.28.0')).toBe(2);
    expect(said[0]).toMatch(/NEVER REACHED App Store Connect/);
  });
});

describe('start: never a second run beside a live one (2026-08-26)', () => {
  it('refuses while one is in flight, and says how to watch it', async () => {
    const { w, x, said } = apple({ runs: [{ number: 740, progress: 'PENDING', sha: 'abc' }] });
    expect(await start(x)).toBe(1);
    expect(said[0]).toMatch(/^already in flight: #740 PENDING/);
    expect(w.requests.some(r => r.url.endsWith('/v1/ciBuildRuns'))).toBe(false);
  });

  it('starts one with --force', async () => {
    const { w, x } = apple({ runs: [{ number: 740, progress: 'PENDING', sha: 'abc' }] });
    expect(await start(x, '--force')).toBe(0);
    expect(w.requests.filter(r => r.url.endsWith('/v1/ciBuildRuns'))).toHaveLength(1);
  });

  it('refuses a paused workflow before asking Apple for anything else', async () => {
    const { x } = apple({ enabled: false });
    await expect(start(x)).rejects.toThrow(/the Default workflow is paused/);
  });
});

describe('ensure: wait for the push, start only if it never came', () => {
  it('finds the push trigger’s run without starting one', async () => {
    const { w, x, said } = apple({ runs: [{ number: 742, progress: 'RUNNING', sha: 'feedbeef00' }] });
    expect(await ensure(x, 'feedbeef00')).toBe(0);
    expect(said).toEqual(['run 742 is building feedbeef (RUNNING)']);
    expect(w.requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('polls every 20 s until the deadline, then starts one by hand (2026-08-07)', async () => {
    const { w, x, said } = apple({ runs: [] });
    expect(await ensure(x, 'feedbeef00', '1')).toBe(0);
    expect(w.slept).toBe(60_000);
    expect(said[0]).toMatch(/no run for feedbeef after 1 min — the push trigger did not fire/);
    expect(said[1]).toMatch(/^started run 741/);
  });

  it('refuses with 2 when another commit’s run is live', async () => {
    const { x, said } = apple({ runs: [{ number: 740, progress: 'RUNNING', sha: 'other000' }] });
    expect(await ensure(x, 'feedbeef00', '0')).toBe(2);
    expect(said[1]).toMatch(/Starting a second would kill both/);
  });

  it('is 2 when Apple refuses the start — and now says why (2.25.0 said nothing)', async () => {
    const { x, said } = apple({ runs: [], startStatus: 500 });
    expect(await ensure(x, 'feedbeef00', '0')).toBe(2);
    expect(said.join('\n')).toContain('could not start one: HTTP 500');
  });
});

describe('pause and resume: by isEnabled, because null is ignored', () => {
  it('PATCHes isEnabled false, then true', async () => {
    const { w, x } = apple();
    expect(await pause(x)).toBe(0);
    expect(await resume(x)).toBe(0);
    const bodies = w.requests.filter(r => r.method === 'PATCH').map(r => JSON.parse(r.body ?? ''));
    expect(bodies.map(b => b.data.attributes)).toEqual([{ isEnabled: false }, { isEnabled: true }]);
  });

  it('says so and sends nothing when already in that state', async () => {
    const { w, x, said } = apple({ enabled: false });
    await pause(x);
    expect(said).toEqual(['already paused — pushes to main start nothing.']);
    expect(w.requests.some(r => r.method === 'PATCH')).toBe(false);
  });
});

describe('the command line keeps the Python’s exit codes', () => {
  it('an HTTP error is exit 1 with the message on stderr', async () => {
    const { w, x } = apple();
    w.url(`${BASE}/v1/ciProducts?limit=10`, { status: 401, text: 'NOT_AUTHORIZED' });
    expect(await xcodeCloudMain(x, ['runs'])).toBe(1);
    expect(w.err).toEqual(['HTTP 401: NOT_AUTHORIZED']);
  });

  it('shipped passes 3 through', async () => {
    const { x } = apple({ runs: [{ number: 741, progress: 'RUNNING', sha: 'cafe0000' }] });
    expect(await xcodeCloudMain(x, ['shipped', '2.28.0', 'cafe0000'])).toBe(3);
  });
});
