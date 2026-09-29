/**
 * NO NATIVE CODE PARSES A FORMATTED TIME — the exit of the rewrite plan's
 * Phase 1 (docs/rewrite-plan.md, step 1.7).
 *
 * Times cross from the app to its widgets and Live Activities as minutes
 * after a day's midnight (payload v2), and every renderer places a time by
 * those minutes through the contract's WallClock. There were sixteen
 * hand-written "HH:mm" parsers across Swift and Kotlin, each with its own
 * idea of a malformed time; the 24-hour Live Activity that never appeared
 * and the 12-hour clock that needed its own fix both lived in them.
 *
 * The one parser left is `WallClock.minutes(fromHHmm:)` / `minutesFromHHmm`,
 * for a v1 payload the app stored before step 1.7 — read once, at load,
 * until the app next runs and replaces it. This scan keeps it the only one.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');

function sources(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'build' || name === 'Pods') continue;
      out.push(...sources(p, ext));
    } else if (name.endsWith(ext)) {
      out.push(p);
    }
  }
  return out;
}

// What a hand-written "HH:mm" parser looks like in either language.
const PARSERS: RegExp[] = [
  /split\(separator: ":"\)/,
  /\.split\(":"\)/,
  /Regex\("\^\(\\\\d\{1,2\}\):\(\\\\d\{2\}\)\$"\)/,
  /dateFormat = "HH:mm"/,
  /SimpleDateFormat\("HH:mm"/,
  /LocalTime\.parse\(/,
];

const ALLOWED = new Set([
  'ios/Contract/WallClock.swift',
  'android/app/src/main/java/com/prayer_times/contract/WallClock.kt',
]);

describe('native code', () => {
  const files = [
    ...sources(join(ROOT, 'ios'), '.swift'),
    ...sources(join(ROOT, 'android', 'app', 'src', 'main', 'java'), '.kt'),
  ];

  it('is all scanned', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('parses no formatted time outside WallClock', () => {
    const found: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (ALLOWED.has(rel)) continue;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
          if (PARSERS.some(re => re.test(line))) found.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });
});
