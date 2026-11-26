/**
 * "Agreed upon" — the list of hadith HadeethEnc attributes to al-Bukhārī
 * and Muslim both (Look up, above the books).
 *
 *   • The rule is read strictly: the attribution is "متفق عليه" and
 *     nothing else, and the grade "صحيح" and nothing else. A qualified
 *     attribution — a wording, a second narration from one of the two, a
 *     note — is not listed: telling those apart would be a reading of
 *     ours (`scripts/hadith/agreed-list.js`).
 *   • The list is HadeethEnc entries the app already serves: none of the
 *     ids it holds is one the packs withhold.
 *   • It is read from the one HadeethEnc pack, in the list's order, and
 *     an entry that is no longer in the pack is left out.
 *   • It is not offered in a browser, which can only fetch HadeethEnc one
 *     entry a request.
 */
const mockPacks: Record<string, unknown> = {};
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async (key: string) => mockPacks[key] ?? null),
  packStatus: jest.fn((key: string) => (mockPacks[key] ? { state: 'ready', bytes: 1 } : { state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => Object.keys(mockPacks),
  usePackStatuses: () => ({}),
  usePacksReadyKey: () => '',
}));

import fs from 'fs';
import path from 'path';
import AGREED from '../src/hadith/agreed.json';
import WITHHELD from '../src/hadith/withheld.json';
import { AGREED_IDS, AGREED_LIST, AGREED_OFFERED, parseList } from '../src/hadith/catalog';
import { listRows } from '../src/hadith/library';
import { packsForList } from '../src/hadith/useHadith';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { agreedUpon } = require('../scripts/hadith/agreed-list.js') as {
  agreedUpon: (e: { a?: string; g?: string }) => boolean;
};

const REPO = path.join(__dirname, '..');

describe('the rule', () => {
  it('lists an entry attributed "agreed upon" and graded ṣaḥīḥ, with or without vowel signs', () => {
    expect(agreedUpon({ a: 'متفق عليه', g: 'صحيح' })).toBe(true);
    expect(agreedUpon({ a: 'مُتَّفَقٌ عَلَيْهِ', g: 'صَحِيحٌ' })).toBe(true);
    expect(agreedUpon({ a: ' متفق عليه. ', g: 'صحيح.' })).toBe(true);
  });

  it('does not list one HadeethEnc attributes with any qualification', () => {
    for (const a of [
      'متفق عليه، واللفظ للبخاري',
      'متفق عليه واللفظ لمسلم',
      'متفق عليه، والرواية الثانية رواها مسلم',
      'متفق عليه بمعناه، وهذا لفظ الترمذي',
      'متفق عليه، لكنه عند البخاري من حديث أبي هريرة وعند مسلم من حديث عائشة',
      'متفق عليه.\nالرواية الثانية: رواها البخاري',
      'رواه البخاري',
      'رواه مسلم',
      'رواه أحمد، وأصله في صحيح مسلم',
      '',
    ]) {
      expect(agreedUpon({ a, g: 'صحيح' })).toBe(false);
    }
  });

  it('nor one whose grade says anything more than ṣaḥīḥ', () => {
    for (const g of ['صحيح الإسناد', 'صحيحان، والحديث الأول موقوف على أبي هريرة', 'حسن', 'ضعيف', '', undefined]) {
      expect(agreedUpon({ a: 'متفق عليه', g })).toBe(false);
    }
  });
});

describe('the list', () => {
  it('is written by the script, with the day of the pack it was read from', () => {
    expect(AGREED.note).toContain('scripts/hadith/agreed-list.js');
    expect(AGREED.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(AGREED_IDS).toBe(AGREED.ids);
  });

  it('holds each entry once, by its HadeethEnc id', () => {
    expect(AGREED_IDS.length).toBeGreaterThan(1000);
    expect(new Set(AGREED_IDS).size).toBe(AGREED_IDS.length);
    for (const id of AGREED_IDS) expect(id).toMatch(/^\d+$/);
  });

  it('holds nothing the packs withhold', () => {
    for (const id of WITHHELD.henc) expect(AGREED_IDS).not.toContain(id);
  });
});

describe('in the app', () => {
  const entry = (id: string) => ({ id, t: `Title ${id}`, h: `Text ${id}.`, a: 'Agreed upon', g: 'Authentic', c: ['1'], s: 1, q: 1 });
  const [first, second, third] = AGREED_IDS;

  beforeAll(() => {
    // The second is not in the pack; an entry that is not on the list is.
    mockPacks['henc/all/en'] = {
      pack: 'all',
      lang: 'en',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-25',
      entries: [entry(third), entry('1'), entry(first)],
    };
  });

  it('is a list of its own, read from the one HadeethEnc pack', () => {
    expect(AGREED_OFFERED).toBe(true);
    expect(parseList(AGREED_LIST)).toEqual({ kind: 'agreed' });
    expect(packsForList(AGREED_LIST, 'en')).toEqual(['categories/en', 'henc/all/en']);
    expect(packsForList(AGREED_LIST, 'sv')).toEqual(['categories/sv', 'categories/en', 'henc/all/sv', 'henc/all/en']);
  });

  it('shows its entries in the list’s order, and leaves out one that is not in the pack', async () => {
    const rows = await listRows(AGREED_LIST, 'en');
    expect(rows.map(r => r.id)).toEqual([`h:${first}`, `h:${third}`]);
    expect(rows.map(r => r.id)).not.toContain(`h:${second}`);
    expect(rows[0].title).toBe(`Title ${first}`);
  });

  it('is not offered in a browser, and is above the books everywhere else', () => {
    const catalog = fs.readFileSync(path.join(REPO, 'src/hadith/catalog.ts'), 'utf8');
    expect(catalog).toContain('export const AGREED_OFFERED = !IS_WEB_APP;');
    expect(catalog).toContain("if (list === AGREED_LIST) return AGREED_OFFERED ? { kind: 'agreed' } : null;");
    const screen = fs.readFileSync(path.join(REPO, 'src/screens/HadithScreen.tsx'), 'utf8');
    expect(screen.indexOf('testID="hadith-agreed"')).toBeGreaterThan(0);
    expect(screen.indexOf('testID="hadith-agreed"')).toBeLessThan(screen.indexOf("{t('hadith.books')}"));
    expect(screen).toMatch(/\{AGREED_OFFERED \? \(\s*<Group>\s*<Row\s+title=\{t\('hadith\.agreed\.title'\)\}/);
  });
});
