/**
 * Bookmark folders, memorising and a reading plan, where the reader meets
 * them (`screens/hadith/ReaderExtras.tsx`). The record and the plan's
 * arithmetic are held in hadithRecord.test.ts; this holds the lists and
 * the wiring. The whole flow was driven in the desktop app on 2026-11-26
 * (a folder made, filed in, deleted; a hadith memorised from the
 * Memorising list; a thirty-day plan begun) — not on a phone.
 */
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async () => null),
  packStatus: jest.fn(() => ({ state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => [],
  usePackStatuses: () => ({}),
  usePacksReadyKey: () => '',
}));

import fs from 'fs';
import path from 'path';
import { isRecordList, parseList } from '../src/hadith/catalog';
import { EMPTY_HADITH_RECORD as E, nameFolder, setBookmark, setFolder, setMemo } from '../src/hadith/hadithRecord';
import { packsForList, recordListIds } from '../src/hadith/useHadith';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

describe('the reader’s own lists', () => {
  it('are lists like any other, read from the record and from no pack', () => {
    expect(parseList('memo')).toEqual({ kind: 'memo' });
    expect(parseList('folder:f1')).toEqual({ kind: 'folder', id: 'f1' });
    for (const l of ['bookmarks', 'memo', 'folder:f1']) {
      expect(isRecordList(parseList(l))).toBe(true);
      expect(packsForList(l, 'en')).toEqual([]);
    }
    expect(isRecordList(parseList('set:nawawi'))).toBe(false);
    expect(recordListIds('set:nawawi', E)).toBeNull();
  });

  it('show the bookmarks that are in no folder under the folders, and each folder its own', () => {
    let r = nameFolder(E, 'f1', 'Fasting', 1);
    r = setBookmark(r, 'h:1', true, 2);
    r = setFolder(r, 'h:2', 'f1', 3);
    expect(recordListIds('bookmarks', r)).toEqual(['h:1']);
    expect(recordListIds('folder:f1', r)).toEqual(['h:2']);
    // With no folders, every bookmark, as before there were any.
    expect(recordListIds('bookmarks', setBookmark(setBookmark(E, 'h:1', true, 1), 'h:2', true, 2))).toEqual(['h:2', 'h:1']);
    expect(recordListIds('memo', setMemo(r, 'h:3', 1, 4))).toEqual(['h:3']);
  });
});

describe('where they are met', () => {
  const reader = read('src/screens/hadith/HadithReaderScreen.tsx');
  const list = read('src/screens/hadith/HadithListScreen.tsx');
  const hub = read('src/screens/HadithScreen.tsx');

  it('hides the text of a hadith read from the Memorising list until it is asked for', () => {
    expect(reader).toContain("const practising = parseList(list)?.kind === 'memo';");
    expect(reader).toContain('{practising && !recalled ? null : sideBySide ? (');
    // Asked for again at each hadith.
    expect(reader).toMatch(/setCopied\(false\);\s+setRecalled\(false\);/);
    expect(reader).toContain('void updateHadithRecord(r => setMemo(r, id, 2, now()));');
  });

  it('offers memorising and the folder at a hadith’s foot, a plan and the folders over a list, and both lists on Learn', () => {
    expect(reader).toContain('<ReaderTools id={id} rec={rec} />');
    expect(list).toContain("plannable={ref?.kind === 'set' || ref?.kind === 'comp' || ref?.kind === 'book'}");
    expect(hub).toContain("navigation.push('HadithList', { list: 'memo' })");
    expect(hub).toContain('{plan ? <PlanCard plan={plan} /> : null}');
  });

  it('has its words in all thirteen languages', () => {
    const keys = (lang: string) => {
      const h = JSON.parse(read(`src/i18n/locales/${lang}.json`)).hadith;
      return [h.memo, h.folder, h.plan].map(o => Object.keys(o));
    };
    const en = keys('en');
    expect(en.map(k => k.length)).toEqual([9, 8, 8]);
    for (const lang of LOCALES) expect(keys(lang)).toEqual(en);
    for (const lang of LOCALES) {
      const p = JSON.parse(read(`src/i18n/locales/${lang}.json`)).hadith.plan;
      for (const v of ['{{day}}', '{{days}}', '{{done}}', '{{target}}']) expect(p.line).toContain(v);
      expect(p.daysN).toContain('{{n}}');
    }
  });
});
