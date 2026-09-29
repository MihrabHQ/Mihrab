/**
 * scripts/appstore-metadata.py, folded into TypeScript
 * (scripts/release/appstoreMetadata.ts), against a fake App Store Connect:
 * it refuses a frozen listing, writes only what differs, creates a missing
 * locale, sets the categories, and under --dry-run writes nothing.
 */
import { generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { Asc } from '../scripts/release/asc.ts';
import { LOCALES, appstoreMetadataMain } from '../scripts/release/appstoreMetadata.ts';
import type { MetaCtx } from '../scripts/release/appstoreMetadata.ts';
import { GRADLE, HOME, ROOT, World } from './fixtures/releaseWorld';

const BASE = 'https://api.appstoreconnect.apple.com';
const PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function listing(opts: { state?: string; haveLocales?: string[]; cats?: [string, string] } = {}) {
  const w = new World();
  w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/k.p8', keyId: 'K', issuerId: 'I' }));
  w.file('/k.p8', PEM);
  w.file(`${ROOT}/android/app/build.gradle`, GRADLE);
  w.file(`${ROOT}/fastlane/metadata/android/en-US/changelogs/282.txt`, 'English notes\n');
  w.file(`${ROOT}/fastlane/metadata/android/sv-SE/changelogs/282.txt`, 'Svenska\n');
  for (const loc of Object.keys(LOCALES)) {
    for (const f of ['name', 'subtitle', 'description', 'keywords', 'promotional_text']) {
      w.file(`${ROOT}/fastlane/metadata/ios/${loc}/${f}.txt`, `${loc} ${f}\n`);
    }
  }
  const json = (data: unknown) => ({ text: JSON.stringify(data) });
  const state = opts.state ?? 'PREPARE_FOR_SUBMISSION';
  w.url(`${BASE}/v1/apps?limit=10`, json({ data: [{ id: 'APP', attributes: { bundleId: 'com.hassan.prayerapp' } }] }));
  w.url(`${BASE}/v1/apps/APP/appStoreVersions?limit=5`, json({
    data: [{ id: 'VER', attributes: { appStoreState: state, platform: 'IOS', versionString: '2.28.0' } }],
  }));
  w.url(`${BASE}/v1/apps/APP/appInfos?limit=5`, json({ data: [{ id: 'INFO', attributes: { state } }] }));
  const [p, s] = opts.cats ?? ['LIFESTYLE', 'REFERENCE'];
  w.url(`${BASE}/v1/appInfos/INFO?include=primaryCategory,secondaryCategory`, req =>
    req.method === 'PATCH'
      ? json({})
      : json({ data: { relationships: { primaryCategory: { data: { id: p } }, secondaryCategory: { data: { id: s } } } } }),
  );
  const have = opts.haveLocales ?? Object.keys(LOCALES);
  // Everything already correct, except the English description.
  const verLoc = (loc: string) => ({
    id: `V-${loc}`,
    attributes: {
      locale: loc,
      description: loc === 'en-US' ? 'old words' : `${loc} description`,
      keywords: `${loc} keywords`,
      promotionalText: `${loc} promotional_text`,
      marketingUrl: 'https://mihrab.elghamri.se/',
      supportUrl: 'https://github.com/MihrabHQ/Mihrab/issues',
      whatsNew: loc === 'sv' ? 'Svenska' : 'English notes',
    },
  });
  const infoLoc = (loc: string) => ({
    id: `I-${loc}`,
    attributes: {
      locale: loc,
      name: `${loc} name`,
      subtitle: `${loc} subtitle`,
      privacyPolicyUrl: 'https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md',
    },
  });
  w.url(`${BASE}/v1/appInfos/INFO/appInfoLocalizations?limit=50`, json({ data: have.map(infoLoc) }));
  w.url(`${BASE}/v1/appStoreVersions/VER/appStoreVersionLocalizations?limit=50`, json({ data: have.map(verLoc) }));
  for (const kind of ['appInfoLocalizations', 'appStoreVersionLocalizations']) {
    w.url(`${BASE}/v1/${kind}`, json({ data: {} }));
    for (const loc of Object.keys(LOCALES)) w.url(`${BASE}/v1/${kind}/${kind === 'appInfoLocalizations' ? 'I' : 'V'}-${loc}`, json({ data: {} }));
  }
  const said: string[] = [];
  const m: MetaCtx = { asc: new Asc(w.io(), HOME), io: w.io(), root: ROOT, say: l => said.push(l) };
  const writes = () => w.requests.filter(r => r.method !== 'GET' && r.method !== undefined);
  return { w, m, said, writes };
}

describe('the listing writer', () => {
  it('refuses a frozen listing with exit 3', async () => {
    const { m, said, writes } = listing({ state: 'READY_FOR_SALE' });
    expect(await appstoreMetadataMain(m, [])).toBe(3);
    expect(said[0]).toBe('nothing to edit — the listing is frozen. Versions: READY_FOR_SALE');
    expect(writes()).toEqual([]);
  });

  it('PATCHes only the field that differs', async () => {
    const { m, writes, said } = listing();
    expect(await appstoreMetadataMain(m, [])).toBe(0);
    const w = writes();
    expect(w.map(r => `${r.method} ${r.url.replace(BASE, '')}`)).toEqual([
      'PATCH /v1/appStoreVersionLocalizations/V-en-US',
    ]);
    expect(JSON.parse(w[0].body ?? '').data.attributes).toEqual({ description: 'en-US description' });
    expect(said).toContain("  en-US description: 'old words' -> 'en-US description'");
  });

  it('takes What’s New from the locale’s changelog, or the English one', async () => {
    // Swedish has its own; Turkish falls back to English — both already
    // match in the fake, so neither is written.
    const { m, writes } = listing();
    await appstoreMetadataMain(m, []);
    expect(writes().some(r => r.url.includes('V-sv') || r.url.includes('V-tr'))).toBe(false);
  });

  it('creates a locale the listing does not have yet', async () => {
    const { m, writes } = listing({ haveLocales: Object.keys(LOCALES).filter(l => l !== 'ur') });
    await appstoreMetadataMain(m, []);
    const posts = writes().filter(r => r.method === 'POST');
    expect(posts.map(r => JSON.parse(r.body ?? '').data.attributes.locale)).toEqual(['ur', 'ur']);
    expect(JSON.parse(posts[0].body ?? '').data.relationships).toEqual({ appInfo: { data: { type: 'appInfos', id: 'INFO' } } });
  });

  it('files the app under Lifestyle, with Reference second', async () => {
    const { m, writes } = listing({ cats: ['UTILITIES', 'REFERENCE'] });
    await appstoreMetadataMain(m, []);
    const cat = writes().find(r => r.url.endsWith('/v1/appInfos/INFO'));
    expect(JSON.parse(cat?.body ?? '').data.relationships.primaryCategory.data.id).toBe('LIFESTYLE');
  });

  it('--dry-run says what it would change and writes nothing', async () => {
    const { m, writes, said } = listing({ cats: ['UTILITIES', 'REFERENCE'], haveLocales: ['en-US'] });
    expect(await appstoreMetadataMain(m, ['--dry-run'])).toBe(0);
    expect(writes()).toEqual([]);
    expect(said).toContain("  categories: ('UTILITIES', 'REFERENCE') -> ('LIFESTYLE', 'REFERENCE')");
    expect(said[said.length - 1]).toBe('\n--dry-run: nothing written.');
  });

  it('writes the same thirteen locales as the Python, mapped the same way', () => {
    const py = readFileSync(path.join(__dirname, '..', 'scripts', 'appstore-metadata.py'), 'utf8');
    for (const [appStore, play] of Object.entries(LOCALES)) expect(py).toContain(`"${appStore}": "${play}"`);
    expect(Object.keys(LOCALES)).toHaveLength(13);
  });
});
