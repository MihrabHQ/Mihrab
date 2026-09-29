/**
 * Write the App Store listing from fastlane/metadata/ios/<locale>/ — the
 * port of scripts/appstore-metadata.py.
 *
 *   appstore-metadata                  apply, if a version is editable
 *   appstore-metadata --dry-run        say what would change
 *   appstore-metadata --create 2.27.1  make that version first
 *
 * Per locale, all thirteen the app speaks: the name and subtitle on the
 * app info (what search indexes first), and on the version — frozen once
 * submitted — the description, keywords, promotional text, what's new and
 * the URLs. The words come from the files, and the files come from
 * branding/IDENTITY.md; __tests__/storeListings.test.ts holds them to
 * Apple's limits and to guideline 2.3.10. What's new is the Android
 * changelog for this build's versionCode — English, Swedish and Arabic
 * are the three the release writes, so the other ten use the English one.
 *
 * WHY THIRTEEN (2026-09-28): a search in Turkish, Urdu or Indonesian had
 * nothing to match on the iPhone. WHY LIFESTYLE: it was filed under
 * Utilities, beside flashlights, and the category decides which charts and
 * "similar apps" it is shown among. WHY AT ALL: the listing had been
 * edited by hand in App Store Connect, which is exactly how it drifted.
 *
 * WHEN IT CAN RUN: version metadata is frozen while a version is in review
 * or on sale. This refuses (exit 3) rather than fighting Apple for it: run
 * it after the release uploads its build and before you press Submit.
 */
import type { Asc, Json } from './asc.ts';
import { AscExit } from './asc.ts';
import type { Io } from './io.ts';

export const BUNDLE_ID = 'com.hassan.prayerapp';
// App Store locale -> the Android directory whose changelog is "What's New".
// storeListings.test.ts holds this to the same table as the Python's.
export const LOCALES: Record<string, string> = {
  'en-US': 'en-US', sv: 'sv-SE', 'ar-SA': 'ar',
  'de-DE': 'de-DE', 'es-ES': 'es-ES', 'fr-FR': 'fr-FR', id: 'id',
  tr: 'tr-TR', ru: 'ru-RU', 'zh-Hans': 'zh-CN', hi: 'hi-IN',
  bn: 'bn-BD', ur: 'ur',
};
export const PRIMARY_CATEGORY = 'LIFESTYLE';
export const SECONDARY_CATEGORY = 'REFERENCE';
export const MARKETING_URL = 'https://mihrab.elghamri.se/';
export const SUPPORT_URL = 'https://github.com/MihrabHQ/Mihrab/issues';
export const PRIVACY_URL = 'https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md';

export const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

export interface MetaCtx {
  asc: Asc;
  io: Io;
  root: string;
  say(line: string): void;
}

const text = (m: MetaCtx, locale: string, field: string) =>
  m.io.fs.readText(`${m.root}/fastlane/metadata/ios/${locale}/${field}.txt`).trim();

export function versionCode(m: MetaCtx): string {
  const gradle = m.io.fs.readText(`${m.root}/android/app/build.gradle`);
  const hit = /versionCode\s+(\d+)/.exec(gradle);
  if (!hit) throw new AscExit('no versionCode in android/app/build.gradle');
  return hit[1];
}

/** This build's notes in the locale's language, or in English. */
export function whatsNew(m: MetaCtx, locale: string): string | null {
  for (const d of [LOCALES[locale], 'en-US']) {
    const f = `${m.root}/fastlane/metadata/android/${d}/changelogs/${versionCode(m)}.txt`;
    if (m.io.fs.exists(f)) return m.io.fs.readText(f).trim();
  }
  return null;
}

/** Python's `repr` of a short string, near enough for a diff line. */
function repr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
}

export async function appstoreMetadataMain(m: MetaCtx, argv: string[]): Promise<number> {
  try {
    return await run(m, argv);
  } catch (e) {
    if (e instanceof AscExit) {
      m.io.err(e.message);
      return e.code;
    }
    throw e;
  }
}

async function run(m: MetaCtx, argv: string[]): Promise<number> {
  const dry = argv.includes('--dry-run');
  const create = argv.includes('--create') ? argv[argv.indexOf('--create') + 1] : undefined;

  const app = (await m.asc.call('/v1/apps?limit=10')).data.find(
    (a: Json) => a.attributes?.bundleId === BUNDLE_ID,
  );
  if (!app) throw new AscExit(`no app with bundle id ${BUNDLE_ID}`);
  const aid = app.id;

  const versions: Json[] = (await m.asc.call(`/v1/apps/${aid}/appStoreVersions?limit=5`)).data;
  let ver: Json = versions.find(
    v => EDITABLE.has(v.attributes?.appStoreState) && v.attributes?.platform === 'IOS',
  );
  if (!ver && create) {
    if (dry) {
      m.say(`would create version ${create}`);
    } else {
      ver = (
        await m.asc.write('POST', '/v1/appStoreVersions', {
          data: {
            type: 'appStoreVersions',
            attributes: { platform: 'IOS', versionString: create },
            relationships: { app: { data: { type: 'apps', id: aid } } },
          },
        })
      ).data;
      m.say(`created version ${create}`);
    }
  }
  const info: Json = (await m.asc.call(`/v1/apps/${aid}/appInfos?limit=5`)).data.find(
    (i: Json) => EDITABLE.has(i.attributes?.state) || EDITABLE.has(i.attributes?.appStoreState),
  );
  if (!ver || !info) {
    const states = versions
      .slice(0, 3)
      .map(v => v.attributes?.appStoreState || '?')
      .join(', ');
    m.say(`nothing to edit — the listing is frozen. Versions: ${states}`);
    m.say('Run this after the release uploads its build, or pass --create X.Y.Z.');
    return 3;
  }

  const cats = await m.asc.call(`/v1/appInfos/${info.id}?include=primaryCategory,secondaryCategory`);
  const rel = cats.data.relationships;
  const haveCats = [rel.primaryCategory?.data?.id ?? null, rel.secondaryCategory?.data?.id ?? null];
  if (haveCats[0] !== PRIMARY_CATEGORY || haveCats[1] !== SECONDARY_CATEGORY) {
    m.say(
      `  categories: (${haveCats.map(c => (c === null ? 'None' : repr(c))).join(', ')}) -> ` +
        `(${repr(PRIMARY_CATEGORY)}, ${repr(SECONDARY_CATEGORY)})`,
    );
    if (!dry) {
      await m.asc.write('PATCH', `/v1/appInfos/${info.id}`, {
        data: {
          type: 'appInfos',
          id: info.id,
          relationships: {
            primaryCategory: { data: { type: 'appCategories', id: PRIMARY_CATEGORY } },
            secondaryCategory: { data: { type: 'appCategories', id: SECONDARY_CATEGORY } },
          },
        },
      });
    }
  }

  m.say(
    `version ${ver.attributes.versionString} (${ver.attributes.appStoreState}), What's New from ` +
      `changelogs/${versionCode(m)}.txt`,
  );

  const byLocale = (list: Json[]) => {
    const out = new Map<string, Json>();
    for (const l of list) out.set(l.attributes.locale, l);
    return out;
  };
  const infoLocs = byLocale(
    (await m.asc.call(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data,
  );
  let verLocs = new Map<string, Json>();
  // App info first: a new app-info locale makes Apple create the matching
  // version locale on its own, so the version locales are read after it.
  for (const phase of ['appInfoLocalizations', 'appStoreVersionLocalizations'] as const) {
    if (phase === 'appStoreVersionLocalizations') {
      verLocs = byLocale(
        (await m.asc.call(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`))
          .data,
      );
    }
    for (const loc of Object.keys(LOCALES)) {
      let want: Record<string, string>;
      let have: Json;
      let parent: [string, string, string];
      if (phase === 'appInfoLocalizations') {
        want = { name: text(m, loc, 'name'), subtitle: text(m, loc, 'subtitle'), privacyPolicyUrl: PRIVACY_URL };
        have = infoLocs.get(loc);
        parent = ['appInfo', 'appInfos', info.id];
      } else {
        want = {
          description: text(m, loc, 'description'),
          keywords: text(m, loc, 'keywords'),
          promotionalText: text(m, loc, 'promotional_text'),
          marketingUrl: MARKETING_URL,
          supportUrl: SUPPORT_URL,
        };
        const wn = whatsNew(m, loc);
        if (wn) want.whatsNew = wn;
        have = verLocs.get(loc);
        parent = ['appStoreVersion', 'appStoreVersions', ver.id];
      }
      if (!have) {
        m.say(`  ${loc} ${phase}: new locale`);
        if (!dry) {
          await m.asc.write('POST', `/v1/${phase}`, {
            data: {
              type: phase,
              attributes: { ...want, locale: loc },
              relationships: { [parent[0]]: { data: { type: parent[1], id: parent[2] } } },
            },
          });
        }
        continue;
      }
      const diff: Record<string, string> = {};
      for (const [k, v] of Object.entries(want)) {
        if ((have.attributes[k] || '') !== v) diff[k] = v;
      }
      for (const k of Object.keys(diff)) {
        const was = String(have.attributes[k] || '').replace(/\n/g, ' ');
        m.say(`  ${loc} ${k}: ${repr(was.slice(0, 60))} -> ${repr(want[k].replace(/\n/g, ' ').slice(0, 60))}`);
      }
      if (Object.keys(diff).length && !dry) {
        await m.asc.write('PATCH', `/v1/${phase}/${have.id}`, {
          data: { type: phase, id: have.id, attributes: diff },
        });
      }
      if (!Object.keys(diff).length) m.say(`  ${loc} ${phase}: already correct`);
    }
  }
  m.say(dry ? '\n--dry-run: nothing written.' : '\nwritten. It shows on the App Store when this version is approved.');
  return 0;
}
