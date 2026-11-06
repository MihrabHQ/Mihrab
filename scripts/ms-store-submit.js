#!/usr/bin/env node
/*
 * Submits a release to the Microsoft Store, end to end, through the Partner
 * Center submission API (learn.microsoft.com/windows/uwp/monetize/
 * create-and-manage-submissions-using-windows-store-services):
 *
 *   1. drops a pending draft, if there is one (a submission made here
 *      replaces it; the Store holds one draft at a time);
 *   2. creates a submission from the live one, so the listing, pricing and
 *      age ratings carry over;
 *   3. marks the live packages for removal and adds the new .appx files;
 *   4. sets "What's new in this version" for each listing language that
 *      has release notes (release-notes/<lang>/<code>.txt, minus the lines
 *      for Android and iPhone, fitted to the Store's 1500 characters);
 *   5. uploads the packages, commits the submission for certification and
 *      waits until the Store has taken it.
 *
 *   node scripts/ms-store-submit.js --dir <folder with the .appx files>
 *     [--root <checkout of the release tag>] [--code 295] [--dry-run]
 *
 * Needs STORE_TENANT_ID, STORE_CLIENT_ID, STORE_CLIENT_SECRET (an Entra app
 * with the Manager role in Partner Center) and STORE_PRODUCT_ID. --dry-run
 * prints the notes it would set and stops before any call.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const API = 'https://manage.devcenter.microsoft.com/v1.0/my';
const NOTES_LIMIT = 1500;
const ROOT = path.resolve(__dirname, '..');

// Lines about another platform, in the languages the notes are kept in.
const OTHER_PLATFORM = /^•\s*(Android|iPhone|iPad|iOS|Mac|macOS|Live Activity|أندرويد|آيفون|آيباد|ماك)\s*:/;

/** The notes of one language for the Windows app, at most `limit` chars. */
function storeNotes(text, limit = NOTES_LIMIT) {
  let bullets = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !OTHER_PLATFORM.test(l))
    .map(l => l.replace(/\s*\(#\d+(?:,\s*#\d+)*\)/g, ''));
  const joined = () => bullets.join('\n');
  // Too long: the longest bullets keep their first sentence, one at a time.
  const firstSentence = b => {
    const m = b.match(/^(.+?[.!?؟。])\s/u);
    return m ? m[1] : b;
  };
  while (joined().length > limit) {
    let longest = -1;
    bullets.forEach((b, i) => {
      if (firstSentence(b) !== b && (longest < 0 || b.length > bullets[longest].length)) longest = i;
    });
    if (longest < 0) break;
    bullets[longest] = firstSentence(bullets[longest]);
  }
  // Still too long: the last bullets go.
  while (joined().length > limit && bullets.length > 1) bullets = bullets.slice(0, -1);
  return joined().slice(0, limit);
}

/** Listing language ("en-us", "sv", "ar-sa") → release-notes folder. */
function notesLang(listingLang) {
  const base = listingLang.toLowerCase().split('-')[0];
  return ['en', 'sv', 'ar'].includes(base) ? base : null;
}

function notesFor(listingLangs, code, root = ROOT) {
  const out = {};
  for (const lang of listingLangs) {
    const folder = notesLang(lang);
    if (!folder) continue;
    const file = path.join(root, 'release-notes', folder, `${code}.txt`);
    if (fs.existsSync(file)) out[lang] = storeNotes(fs.readFileSync(file, 'utf8'));
  }
  return out;
}

/** The new submission's body: new packages in, old ones out, notes set. */
function prepareSubmission(submission, appxNames, notes) {
  const s = JSON.parse(JSON.stringify(submission));
  for (const p of s.applicationPackages ?? []) p.fileStatus = 'PendingDelete';
  s.applicationPackages = [
    ...(s.applicationPackages ?? []),
    ...appxNames.map(fileName => ({ fileName, fileStatus: 'PendingUpload' })),
  ];
  for (const [lang, text] of Object.entries(notes)) {
    if (s.listings?.[lang]?.baseListing) s.listings[lang].baseListing.releaseNotes = text;
  }
  return s;
}

function versionCode(root = ROOT) {
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const m = gradle.match(/versionCode\s+(\d+)/);
  if (!m) throw new Error('no versionCode in android/app/build.gradle');
  return Number(m[1]);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function token(env, fetchImpl) {
  const res = await fetchImpl(`https://login.microsoftonline.com/${env.STORE_TENANT_ID}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.STORE_CLIENT_ID,
      client_secret: env.STORE_CLIENT_SECRET,
      resource: 'https://manage.devcenter.microsoft.com',
    }).toString(),
  });
  if (!res.ok) throw new Error(`sign-in failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function submit({ env, dir, code, root = ROOT, fetchImpl = fetch, log = console.log, zip, pollMs = 30000, maxPolls = 120 }) {
  const appx = fs.readdirSync(dir).filter(f => /\.(appx|msix)$/i.test(f)).sort();
  if (appx.length === 0) throw new Error(`no .appx in ${dir}`);
  const auth = await token(env, fetchImpl);
  const call = async (method, url, body) => {
    const res = await fetchImpl(`${API}${url}`, {
      method,
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  const app = `/applications/${env.STORE_PRODUCT_ID}`;

  const info = await call('GET', app);
  const pending = info.pendingApplicationSubmission?.id;
  if (pending) {
    log(`dropping the pending draft ${pending}`);
    await call('DELETE', `${app}/submissions/${pending}`);
  }
  const created = await call('POST', `${app}/submissions`);
  log(`submission ${created.id}`);
  const notes = notesFor(Object.keys(created.listings ?? {}), code, root);
  for (const [lang, text] of Object.entries(notes)) log(`what's new, ${lang}: ${text.length} characters`);
  const body = prepareSubmission(created, appx, notes);
  await call('PUT', `${app}/submissions/${created.id}`, body);

  const archive = zip(dir, appx);
  log(`uploading ${appx.join(', ')} (${(fs.statSync(archive).size / 1e6).toFixed(0)} MB)`);
  const up = await fetchImpl(created.fileUploadUrl.replace(/\+/g, '%2B'), {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob' },
    body: fs.readFileSync(archive),
  });
  if (!up.ok) throw new Error(`package upload failed: HTTP ${up.status} ${await up.text()}`);

  await call('POST', `${app}/submissions/${created.id}/commit`);
  for (let i = 0; i < maxPolls; i++) {
    const st = await call('GET', `${app}/submissions/${created.id}/status`);
    if (st.status !== 'CommitStarted') {
      if (st.status === 'CommitFailed') {
        throw new Error(`the Store refused the submission: ${JSON.stringify(st.statusDetails?.errors ?? st.statusDetails)}`);
      }
      log(`committed — ${st.status}; live once it passes certification`);
      return { id: created.id, status: st.status };
    }
    await sleep(pollMs);
  }
  throw new Error('the commit did not finish in time; see Partner Center');
}

function zipWithCli(dir, files) {
  const out = path.join(dir, 'store-upload.zip');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync('zip', ['-0', '-j', '-q', out, ...files.map(f => path.join(dir, f))]);
  return out;
}

async function main(argv) {
  const arg = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = arg('--dir');
  if (!dir) throw new Error('usage: ms-store-submit.js --dir <folder> [--root <release checkout>] [--code N] [--dry-run]');
  const root = path.resolve(arg('--root') ?? ROOT);
  const code = Number(arg('--code') ?? versionCode(root));
  if (argv.includes('--dry-run')) {
    for (const [lang, text] of Object.entries(notesFor(['en-us', 'sv', 'ar'], code, root))) {
      console.log(`--- ${lang} (${text.length})\n${text}`);
    }
    return;
  }
  const env = process.env;
  const missing = ['STORE_TENANT_ID', 'STORE_CLIENT_ID', 'STORE_CLIENT_SECRET', 'STORE_PRODUCT_ID'].filter(k => !env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  await submit({ env, dir, code, root, zip: zipWithCli });
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { storeNotes, notesLang, notesFor, prepareSubmission, submit, versionCode };
