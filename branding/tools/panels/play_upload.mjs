// Play listing images through the Android Publisher API.
//   node branding/tools/panels/play_upload.mjs list           what each listing holds now (read-only; the edit is deleted)
//   node branding/tools/panels/play_upload.mjs upload         replace them from branding/store-panels, validate, commit
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PKG = 'com.prayer_times';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const P = path.join(ROOT, 'branding/store-panels');
const key = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/mihrab/play-service-account.json'), 'utf8'));
const LANG = { en: 'en-US', sv: 'sv-SE', ar: 'ar', tr: 'tr-TR', ur: 'ur', id: 'id', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', ru: 'ru-RU', bn: 'bn-BD', hi: 'hi-IN', zh: 'zh-CN' };
// Play's image type -> the set that fills it.
const TYPES = { phoneScreenshots: 'play-phone', sevenInchScreenshots: 'play-tablet', tenInchScreenshots: 'play-tablet', featureGraphic: 'play-feature' };

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 3000 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key).toString('base64url');
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${sig}` });
  const j = await r.json();
  if (!j.access_token) throw new Error('no token: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}
const T = await token();
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UP = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;
async function call(method, url, body, type) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${T}`, ...(type ? { 'content-type': type } : body ? { 'content-type': 'application/json' } : {}) }, body: body && !type ? JSON.stringify(body) : body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(API, '').replace(UP, '')} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const mode = process.argv[2];
const edit = (await call('POST', `${API}/edits`, {})).id;
try {
  const listings = (await call('GET', `${API}/edits/${edit}/listings`)).listings.map(l => l.language);
  console.log('listings:', listings.join(' '));
  const plan = [];
  for (const [lang, locale] of Object.entries(LANG)) {
    if (!listings.includes(locale)) { console.log(`  ${locale}: no listing on Play, skipped`); continue; }
    for (const [type, set] of Object.entries(TYPES)) {
      const have = (await call('GET', `${API}/edits/${edit}/listings/${locale}/${type}`)).images ?? [];
      const dir = path.join(P, set, lang);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort().map(f => path.join(dir, f)) : [];
      plan.push({ locale, type, have: have.length, files });
    }
  }
  const byType = {};
  for (const p of plan) (byType[p.type] ??= []).push(`${p.locale}:${p.have}->${p.have ? p.files.length : 0}`);
  for (const [t, v] of Object.entries(byType)) console.log(`${t}: ${v.join(' ')}`);
  if (mode !== 'upload') { await call('DELETE', `${API}/edits/${edit}`); console.log('read only; edit deleted'); process.exit(0); }
  for (const p of plan) {
    // A slot Play holds nothing in is left empty: this replaces, it does not add kinds of image.
    if (!p.have || !p.files.length) continue;
    await call('DELETE', `${API}/edits/${edit}/listings/${p.locale}/${p.type}`);
    for (const f of p.files) await call('POST', `${UP}/edits/${edit}/listings/${p.locale}/${p.type}?uploadType=media`, fs.readFileSync(f), 'image/png');
    console.log(`  ${p.locale} ${p.type}: ${p.files.length} uploaded`);
  }
  await call('POST', `${API}/edits/${edit}:validate`);
  console.log('validated');
  const done = await call('POST', `${API}/edits/${edit}:commit`);
  console.log('committed', done.id);
} catch (e) {
  console.error(String(e));
  await call('DELETE', `${API}/edits/${edit}`).catch(() => undefined);
  process.exit(1);
}
