import fs from 'fs';
import os from 'os';
import path from 'path';

const ms = require('../scripts/ms-store-submit.js');

const ROOT = path.resolve(__dirname, '..');

describe('the Microsoft Store notes', () => {
  it('leave out the other platforms and issue numbers', () => {
    const text = [
      '• Hifz: by heart (#121).',
      '• Android: the Live Activity.',
      '• iPhone: the Live Activity.',
      '• أندرويد: شيء.',
      '• Morocco: the printed minute.',
    ].join('\n');
    expect(ms.storeNotes(text)).toBe('• Hifz: by heart.\n• Morocco: the printed minute.');
  });

  it('fit the limit by shortening the longest bullets first, then dropping the last', () => {
    const long = '• A: one. ' + 'two '.repeat(100).trim() + '.';
    const out = ms.storeNotes(`${long}\n• B: short.`, 60);
    expect(out).toBe('• A: one.\n• B: short.');
    const many = Array.from({ length: 30 }, (_, i) => `• Item ${i}.`).join('\n');
    expect(ms.storeNotes(many, 50).length).toBeLessThanOrEqual(50);
    expect(ms.storeNotes(many, 50).startsWith('• Item 0.')).toBe(true);
  });

  it('are within 1500 characters for every shipped release note', () => {
    for (const lang of ['en', 'sv', 'ar']) {
      const dir = path.join(ROOT, 'release-notes', lang);
      for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.txt'))) {
        const out = ms.storeNotes(fs.readFileSync(path.join(dir, f), 'utf8'));
        expect(out.length).toBeLessThanOrEqual(1500);
        expect(out).not.toMatch(/^•\s*(Android|iPhone):/m);
      }
    }
  });

  it('map listing languages to the notes folders', () => {
    expect(ms.notesLang('en-us')).toBe('en');
    expect(ms.notesLang('sv-SE')).toBe('sv');
    expect(ms.notesLang('ar')).toBe('ar');
    expect(ms.notesLang('de-de')).toBeNull();
  });
});

describe('the submission', () => {
  const live = {
    id: 'S2',
    fileUploadUrl: 'https://blob/x?sig=a+b',
    applicationPackages: [{ id: 'p1', fileName: 'Mihrab-2.35.0-win-x64.appx', fileStatus: 'Uploaded' }],
    listings: { 'en-us': { baseListing: { description: 'd', releaseNotes: '' } } },
  };

  it('removes the old packages, adds the new ones and sets the notes', () => {
    const out = ms.prepareSubmission(live, ['a.appx', 'b.appx'], { 'en-us': 'new', fr: 'x' });
    expect(out.applicationPackages).toEqual([
      { id: 'p1', fileName: 'Mihrab-2.35.0-win-x64.appx', fileStatus: 'PendingDelete' },
      { fileName: 'a.appx', fileStatus: 'PendingUpload' },
      { fileName: 'b.appx', fileStatus: 'PendingUpload' },
    ]);
    expect(out.listings['en-us'].baseListing).toEqual({ description: 'd', releaseNotes: 'new' });
    expect(out.listings.fr).toBeUndefined();
    expect(live.applicationPackages[0].fileStatus).toBe('Uploaded');
  });

  it('runs the API end to end: drop the draft, create, update, upload, commit, wait', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-store-'));
    fs.writeFileSync(path.join(dir, 'Mihrab-2.36.0-win-x64.appx'), 'x');
    fs.writeFileSync(path.join(dir, 'Mihrab-2.36.0-win-arm64.appx'), 'y');
    fs.writeFileSync(path.join(dir, 'upload.zip'), 'zip');
    const calls: string[] = [];
    let put: any;
    let statuses = ['CommitStarted', 'PreProcessing'];
    const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, text: async () => (body == null ? '' : JSON.stringify(body)), json: async () => body });
    const fetchImpl = async (url: string, init: any) => {
      const short = url.replace('https://manage.devcenter.microsoft.com/v1.0/my', '');
      calls.push(`${init.method} ${short}`);
      if (url.includes('login.microsoftonline.com')) return reply({ access_token: 't' });
      if (url.startsWith('https://blob/')) {
        expect(url).toBe('https://blob/x?sig=a%2Bb');
        expect(init.headers['x-ms-blob-type']).toBe('BlockBlob');
        return reply(null);
      }
      expect(init.headers.Authorization).toBe('Bearer t');
      if (init.method === 'GET' && short === '/applications/APP') return reply({ pendingApplicationSubmission: { id: 'D1' } });
      if (init.method === 'POST' && short === '/applications/APP/submissions') return reply(live);
      if (init.method === 'PUT') {
        put = JSON.parse(init.body);
        return reply(put);
      }
      if (short.endsWith('/status')) return reply({ status: statuses.shift() });
      return reply(null);
    };
    const res = await ms.submit({
      env: { STORE_TENANT_ID: 'T', STORE_CLIENT_ID: 'C', STORE_CLIENT_SECRET: 'S', STORE_PRODUCT_ID: 'APP' },
      dir,
      code: 295,
      fetchImpl,
      log: () => {},
      zip: () => path.join(dir, 'upload.zip'),
      pollMs: 0,
    });
    expect(res).toEqual({ id: 'S2', status: 'PreProcessing' });
    expect(calls).toEqual([
      'POST https://login.microsoftonline.com/T/oauth2/token',
      'GET /applications/APP',
      'DELETE /applications/APP/submissions/D1',
      'POST /applications/APP/submissions',
      'PUT /applications/APP/submissions/S2',
      'PUT https://blob/x?sig=a%2Bb',
      'POST /applications/APP/submissions/S2/commit',
      'GET /applications/APP/submissions/S2/status',
      'GET /applications/APP/submissions/S2/status',
    ]);
    expect(put.applicationPackages.map((p: any) => p.fileName)).toEqual([
      'Mihrab-2.35.0-win-x64.appx',
      'Mihrab-2.36.0-win-arm64.appx',
      'Mihrab-2.36.0-win-x64.appx',
    ]);
    expect(put.listings['en-us'].baseListing.releaseNotes).toContain('Hifz');

    statuses = ['CommitFailed'];
    const failing = async (url: string, init: any) => {
      const r: any = await fetchImpl(url, init);
      if (url.endsWith('/status')) return reply({ status: 'CommitFailed', statusDetails: { errors: [{ code: 'InvalidPackage' }] } });
      return r;
    };
    await expect(
      ms.submit({
        env: { STORE_TENANT_ID: 'T', STORE_CLIENT_ID: 'C', STORE_CLIENT_SECRET: 'S', STORE_PRODUCT_ID: 'APP' },
        dir, code: 295, fetchImpl: failing, log: () => {}, zip: () => path.join(dir, 'upload.zip'), pollMs: 0,
      }),
    ).rejects.toThrow(/InvalidPackage/);
  });
});
