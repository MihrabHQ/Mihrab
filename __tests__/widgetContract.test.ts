/**
 * The widget contract (payload v2) — docs/rewrite-plan.md, Phase 1.
 *
 * Three things are pinned here. The generated TypeScript, Swift and Kotlin
 * are what the contract says, so a contract edited without regenerating
 * fails the suite rather than a widget. The generator refuses a contract
 * it could only half mean. And the app's reference formatter for contract
 * times writes exactly what the app itself draws, for every minute of the
 * day on both clocks — the answer the native helpers are held to.
 */
import { existsSync, readFileSync } from 'fs';
import { relative } from 'path';
import { formatClock, _resetClockFormatCaches } from '../src/utils/clockFormat';
import {
  contractClock,
  contractDateKey,
  formatContractMinutes,
  minutesFromHHmm,
  NO_TIME,
  utcOffsetMinutesAtNoon,
} from '../src/widget/wallClock';
import { WIDGET_CONTRACT_VERSION } from '../src/widget/contract.generated';

const gen = require('../scripts/gen-widget-contract.js');
const contract = require('../scripts/contract/widget-contract.js');

describe('the generated contract', () => {
  const model = gen.load(contract);
  const files: [string, string][] = [
    [gen.OUT.ts, gen.genTs(model)],
    [gen.OUT.swift, gen.genSwift(model)],
    [gen.OUT.kotlin, gen.genKotlin(model)],
  ];

  it('matches what is checked in — run `npm run gen-widget-contract`', () => {
    const stale = files
      .filter(
        ([file, contents]) =>
          !existsSync(file) || readFileSync(file, 'utf8') !== contents,
      )
      .map(([file]) => relative(process.cwd(), file));
    expect(stale).toEqual([]);
  });

  it('carries the version the TypeScript exports', () => {
    expect(WIDGET_CONTRACT_VERSION).toBe(2);
    expect(files[1][1]).toContain('static let version = 2');
    expect(files[2][1]).toContain('const val VERSION = 2');
  });

  it('reads every non-required field leniently on both platforms', () => {
    // The 24-hour Live Activity bug was a strict read of a field the app
    // sometimes left out. Every Swift read of an optional goes through
    // try?, and Kotlin never uses org.json's opt* (optString writes "null").
    const swift = files[1][1];
    expect(swift).not.toMatch(/^ {6}\w+ [=] try c\.decode(IfPresent)?\(/m);
    expect(swift).toMatch(
      /^ {6}language [=] c\.wcValue\(String\.self, \.language\) \?\? ""$/m,
    );
    const kotlin = files[2][1];
    expect(kotlin).not.toMatch(/\.opt(String|Int|Long|Double|Boolean)\(/);
  });

  it('compiles into the app, the widgets and the Live Activity on iOS', () => {
    // `ruby scripts/add-ios-contract.rb` puts them there; a file in the
    // folder but in no target compiles nowhere and fails nothing.
    const pbx = readFileSync('ios/PrayerApp.xcodeproj/project.pbxproj', 'utf8');
    for (const file of ['WidgetContract.generated.swift', 'WallClock.swift']) {
      const inSources = pbx.match(
        new RegExp(
          `/\\* ${file.replace(/\./g, '\\.')} in Sources \\*/ = \\{`,
          'g',
        ),
      );
      expect({ file, targets: inSources?.length ?? 0 }).toEqual({
        file,
        targets: 3,
      });
    }
  });

  it('names the payload types the widgets will read', () => {
    const names = model.types.map((tp: { name: string }) => tp.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Payload',
        'Clock',
        'Day',
        'Row',
        'LogQueueEntry',
        'TasbihQueueEntry',
      ]),
    );
  });
});

describe('the generator refuses what it cannot mean', () => {
  const base = (fields: unknown[], extra: unknown[] = []) => ({
    version: 2,
    types: [{ name: 'A', fields }, ...extra],
  });

  it('an unknown type', () => {
    expect(() =>
      gen.load(base([['b', { kind: 'ref', name: 'Nope' }]])),
    ).toThrow(/unknown type/);
  });

  it('a fallback for a type that has required fields', () => {
    const b = { name: 'B', fields: [['x', { kind: 'int', required: true }]] };
    expect(() =>
      gen.load(
        base([['b', { kind: 'ref', name: 'B', default: 'fallback' }]], [b]),
      ),
    ).toThrow(/no fallback/);
  });

  it('an enum default outside the enum', () => {
    expect(() =>
      gen.load(base([['e', { kind: 'enum', values: ['x'], default: 'y' }]])),
    ).toThrow(/not in the enum/);
  });

  it('a field declared twice', () => {
    expect(() =>
      gen.load(
        base([
          ['a', { kind: 'int' }],
          ['a', { kind: 'int' }],
        ]),
      ),
    ).toThrow(/declared twice/);
  });
});

describe('contract time on the app side', () => {
  beforeEach(() => _resetClockFormatCaches());

  it('reads only canonical 24-hour clocks', () => {
    expect(minutesFromHHmm('00:00')).toBe(0);
    expect(minutesFromHHmm('05:12')).toBe(312);
    expect(minutesFromHHmm('5:12')).toBe(312);
    expect(minutesFromHHmm('23:59')).toBe(1439);
    for (const bad of [
      '',
      '—',
      '24:00',
      '12:60',
      '5:12 PM',
      '+5:12',
      '05:1',
      ' 05:12',
      null,
      undefined,
    ]) {
      expect(minutesFromHHmm(bad)).toBeNull();
    }
  });

  it('writes a missing time as the dash the app draws', () => {
    expect(formatContractMinutes(null, { hour12: false })).toBe(NO_TIME);
    expect(formatClock('—', false, 'en')).toBe(NO_TIME);
  });

  it.each(['en', 'sv', 'ar', 'zh', 'ur', 'tr'])(
    'writes every minute of the day exactly as the app does (%s)',
    locale => {
      for (const hour12 of [false, true]) {
        const clock = contractClock(hour12, locale);
        for (let m = 0; m < 1440; m++) {
          const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(
            m % 60,
          ).padStart(2, '0')}`;
          const app = formatClock(hhmm, hour12, locale);
          const contractText = formatContractMinutes(m, clock);
          if (app !== contractText) {
            throw new Error(
              `${locale} ${
                hour12 ? '12h' : '24h'
              } ${hhmm}: app "${app}", contract "${contractText}"`,
            );
          }
        }
      }
    },
  );

  it('leaves the defaults out of a 24-hour clock block', () => {
    expect(contractClock(false, 'ar')).toEqual({ hour12: false });
  });

  it('rolls minutes past the day around the clock', () => {
    expect(formatContractMinutes(1440 + 5, { hour12: false })).toBe('00:05');
    expect(formatContractMinutes(-1, { hour12: false })).toBe('23:59');
  });

  it("dates by the device's local calendar", () => {
    expect(contractDateKey(new Date(2026, 8, 28, 23, 59))).toBe('2026-09-28');
    expect(contractDateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('records the offset east of UTC, at noon', () => {
    const noon = new Date(2026, 8, 28, 12, 0, 0, 0);
    expect(utcOffsetMinutesAtNoon('2026-09-28')).toBe(
      -noon.getTimezoneOffset() || 0,
    );
    expect(utcOffsetMinutesAtNoon('not a date')).toBeNull();
  });
});
