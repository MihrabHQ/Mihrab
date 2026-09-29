/**
 * @jest-environment node
 */
/**
 * The one piece of scripts/release/ that touches the real machine
 * (io.ts's `realIo`), held against a real HTTP server on an ephemeral
 * port — because what it gets wrong only shows against real sockets.
 *
 * `fetch` resolves on the HEADERS. The timeout used to be cleared there,
 * so a server that answered and then stalled mid-body held the release
 * for as long as it liked; and a request that never got an answer came
 * back as status 0 with the reason thrown away.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { realIo } from '../scripts/release/io.ts';

let server: http.Server;
let base = '';
const open = new Set<http.ServerResponse>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/stall') {
      // Headers, the first bytes of a body, and then nothing, for ever.
      res.writeHead(200, { 'content-type': 'text/plain', 'last-modified': 'Tue, 29 Sep 2026 12:00:00 GMT' });
      res.write('the first bytes');
      open.add(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('whole');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const res of open) res.destroy();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
});

describe('realIo().http', () => {
  it('reads a whole answer, headers lower-cased', async () => {
    const res = await realIo().http.request({ method: 'GET', url: `${base}/ok`, timeoutMs: 5000 });
    expect(res).toEqual(expect.objectContaining({ status: 200, text: 'whole' }));
    expect(res.headers['content-type']).toBe('text/plain');
  });

  it('times out a body that stalls after the headers, and says so', async () => {
    const started = Date.now();
    const res = await realIo().http.request({ method: 'GET', url: `${base}/stall`, timeoutMs: 300 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.status).toBe(0);
    expect(res.text).toMatch(/abort/i);
  });

  it('keeps the reason a connection failed', async () => {
    // A port that was listening a moment ago and is not any more.
    const closed = http.createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise(resolve => closed.close(resolve));
    const res = await realIo().http.request({ method: 'GET', url: `http://127.0.0.1:${port}/`, timeoutMs: 5000 });
    expect(res.status).toBe(0);
    expect(res.text).toMatch(/ECONNREFUSED/);
  });
});
