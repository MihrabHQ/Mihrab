/**
 * The namazvakti mirror's run planning (tools/namazvakti-dataset/years.ts).
 *
 * 2026's release lacked thirteen of the files its index counted (b491,
 * b493–b502, b510, b511): written on 16 October, refused by GitHub's rate
 * limit on the way up, and nothing checked. Their cities then waited behind
 * every lower-numbered file. And the job built only the current UTC year,
 * so the year about to begin was empty on 1 January.
 */
import fs from 'fs';
import path from 'path';
import {
  isUnservableAnswer,
  missingFromRelease,
  planQueue,
  targetYears,
  type PlanInput,
} from '../tools/namazvakti-dataset/years';
import {
  namazvaktiBucketAsset,
  NV_PACK_BUCKETS,
} from '../src/providers/namazvaktiPack';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 17);
const none = () => new Set<string>();

function input(over: Partial<PlanInput>): PlanInput {
  return {
    ids: [],
    years: [2026],
    now: NOW,
    refreshMs: 60 * DAY,
    readAt: () => -Infinity,
    lost: none,
    undownloaded: none,
    ...over,
  };
}

describe('which years a run builds', () => {
  it('this year, and from 1 December the next as well', () => {
    expect(targetYears(new Date(Date.UTC(2026, 10, 30, 23, 59)))).toEqual([
      2026,
    ]);
    expect(targetYears(new Date(Date.UTC(2026, 11, 1, 0, 0)))).toEqual([
      2026, 2027,
    ]);
    expect(targetYears(new Date(Date.UTC(2026, 11, 31, 23, 0)))).toEqual([
      2026, 2027,
    ]);
    expect(targetYears(new Date(Date.UTC(2027, 0, 1, 0, 0)))).toEqual([2027]);
  });
});

describe('the order a run asks', () => {
  it('the cities of files lost on the way to the release first, then the missing file by file, then the oldest read', () => {
    const lostFile = namazvaktiBucketAsset(491);
    const ids = [1, 1 + NV_PACK_BUCKETS, 2, 491, 491 + NV_PACK_BUCKETS, 3, 4];
    const read: Record<number, number> = {
      3: NOW - 90 * DAY, // due
      4: NOW - 10 * DAY, // fresh
      2: NOW - 70 * DAY, // due, read more recently than 3
    };
    const q = planQueue(
      input({
        ids,
        readAt: (_y, id) => read[id] ?? -Infinity,
        lost: () => new Set([lostFile]),
      }),
    );
    expect(q.map(p => p.id)).toEqual([
      491,
      491 + NV_PACK_BUCKETS,
      1,
      1 + NV_PACK_BUCKETS,
      3,
      2,
    ]);
    expect(q.every(p => p.year === 2026)).toBe(true);
  });

  it('leaves alone a file the release has that did not download', () => {
    const q = planQueue(
      input({
        ids: [5, 6],
        undownloaded: () => new Set([namazvaktiBucketAsset(5)]),
      }),
    );
    expect(q.map(p => p.id)).toEqual([6]);
  });

  it('in December, the year about to begin first, each city once', () => {
    const held2026 = new Set([10, 11]);
    const q = planQueue(
      input({
        ids: [10, 11, 12],
        years: [2026, 2027],
        readAt: (y, id) =>
          y === 2026 && held2026.has(id) ? NOW - 90 * DAY : -Infinity,
      }),
    );
    // Every city is missing for 2027: asked for 2027, and not again for 2026.
    expect(q).toEqual([
      { id: 10, year: 2027 },
      { id: 11, year: 2027 },
      { id: 12, year: 2027 },
    ]);
  });

  it('a year that is complete and fresh asks nothing', () => {
    expect(planQueue(input({ ids: [1, 2], readAt: () => NOW - DAY }))).toEqual(
      [],
    );
  });
});

describe('the release against its index', () => {
  it('names the files the index counts and the release lacks', () => {
    const index = {
      buckets: {
        'b490.json.gz': 50,
        'b491.json.gz': 50,
        'b492.json.gz': 50,
        'b000.json.gz': 0,
      },
    };
    expect(
      missingFromRelease(index, ['b490.json.gz', 'b492.json.gz', 'index.json']),
    ).toEqual(['b491.json.gz']);
    expect(missingFromRelease(null, ['b000.json.gz'])).toEqual([]);
    expect(missingFromRelease({}, [])).toEqual([]);
  });

  it('the workflow checks the download and the upload, and builds next year from December', () => {
    const wf = fs.readFileSync(
      path.join(__dirname, '../.github/workflows/namazvakti-years.yml'),
      'utf8',
    );
    expect(wf).toMatch(/date -u \+%m\)" = "12"/);
    expect(wf).toMatch(/NV_YEARS: \$\{\{ steps\.rel\.outputs\.years \}\}/);
    expect(wf).toMatch(/release-assets\.txt/);
    expect(wf).toMatch(/years\.ts verify/);
    // A failed upload no longer ends the loop before the rest and the index.
    expect(wf).toMatch(/up "\$f"\) \|\| \{/);
  });
});

describe('a city the site has no table for', () => {
  // What namazvakti.com answered for Salelologa (81957) on 18 October 2026:
  // the city's header, and a row that says the date did not come out.
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<cityinfo ID="81957" countryID="215" cityNameTR="Salelologa" cityNameEN="Salelologa">\n' +
    '  <prayertimes dayofyear="0" day="31" month="12">4:33\t4:46\t6:00\tHaydaaa tarih tutmadi, gun = 31 ay = 12\n' +
    '</prayertimes></cityinfo>';

  it('is told apart from a site that is down', () => {
    const { parseNamazvaktiXml } = require('../src/providers/namazvaktiParser');
    let message = '';
    try {
      parseNamazvaktiXml(xml, 2026, new Date().toISOString());
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/only 0 days in the file/);
    expect(isUnservableAnswer(xml, message)).toBe(true);
  });

  it('is not an error page, a timeout or any other failure', () => {
    expect(
      isUnservableAnswer(
        '<html>502</html>',
        'namazvakti: only 0 days in the file',
      ),
    ).toBe(false);
    expect(isUnservableAnswer(xml, 'HTTP 503')).toBe(false);
  });
});
