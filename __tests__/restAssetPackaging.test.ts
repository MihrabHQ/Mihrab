/**
 * The drill's silent rests reach the player on both platforms.
 *
 * `rest.ts` `require`s each `assets/audio/silence-<ms>ms.mp3`. Metro hands
 * react-native-track-player the asset's source, and the two platforms
 * resolve it differently:
 *
 *   • Android release: Metro copies the file into `res/raw/` under a name it
 *     derives from the path (`@react-native/asset-utils`
 *     `getAndroidResourceIdentifier`: lower case, `/` to `_`, anything else
 *     dropped — the dash is REMOVED, not turned into `_`), and the source's
 *     `uri` is that name. RNTP's `BundleUtils.getRawResourceId` lower-cases
 *     the uri, turns `-` into `_`, and asks `getIdentifier(name, "raw")`.
 *     The two must name the same resource, or every rest is a load error.
 *   • iOS / Mac: Metro copies the file into the app bundle's `assets/` and
 *     the uri is a file URL, which RNTP plays as any local file.
 *
 * And a rest is as long as its name says, or a drill's pause is not the
 * one asked for.
 */
import fs from 'fs';
import path from 'path';
import {
  getAndroidResourceFolderName,
  getAndroidResourceIdentifier,
} from '@react-native/asset-utils';
import { REST_PIECES } from '../src/quran/audio/rest';

const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');

/** What Metro records for a file under `assets/audio` of the project. */
const packagerAsset = (ms: number) => ({
  httpServerLocation: '/assets/assets/audio',
  name: `silence-${ms}ms`,
  type: 'mp3',
  scales: [1],
  width: undefined,
  height: undefined,
  hash: '',
  fileSystemLocation: AUDIO,
  files: [],
  __packager_asset: true,
});

/** RNTP's own reading of a `require`d source's uri (BundleUtils.getRawResourceId). */
const rntpRawName = (uri: string) => uri.toLowerCase().replace(/-/g, '_');

describe('Android: res/raw', () => {
  const names = REST_PIECES.map(p =>
    getAndroidResourceIdentifier(packagerAsset(p.ms) as never),
  );

  it('Metro writes each rest as a raw resource with a legal, distinct name', () => {
    for (const p of REST_PIECES) {
      expect(
        getAndroidResourceFolderName(packagerAsset(p.ms) as never, 1),
      ).toBe('raw');
    }
    expect(names).toEqual(
      REST_PIECES.map(p => `assets_audio_silence${p.ms}ms`),
    );
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(new Set(names).size).toBe(names.length);
  });

  it('RNTP asks for the very name Metro wrote', () => {
    for (const n of names) expect(rntpRawName(n)).toBe(n);
  });

  it('the build’s "!audio" asset ignore does not catch the raw resources', () => {
    // aapt's ignore patterns without a wildcard match a file or directory
    // by its whole name: `audio` drops assets/audio, not res/raw/*audio*.
    const gradle = fs.readFileSync(
      path.join(ROOT, 'android/app/build.gradle'),
      'utf8',
    );
    expect(gradle).toMatch(/"!audio"/);
    expect(gradle).not.toMatch(/"![^"]*\*[^"]*"/); // no wildcard that could
  });
});

describe('the files', () => {
  it('are required by literal path from assets/audio, one per piece', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/quran/audio/rest.ts'),
      'utf8',
    );
    for (const p of REST_PIECES) {
      expect(src).toContain(
        `require('../../../assets/audio/silence-${p.ms}ms.mp3')`,
      );
      expect(
        fs.statSync(path.join(AUDIO, `silence-${p.ms}ms.mp3`)).size,
      ).toBeGreaterThan(0);
    }
    // Nothing else in the folder ships unrequired.
    expect(fs.readdirSync(AUDIO).sort()).toEqual(
      REST_PIECES.map(p => `silence-${p.ms}ms.mp3`).sort(),
    );
  });

  it('are the lengths the generator makes', () => {
    const py = fs.readFileSync(
      path.join(ROOT, 'tools/silence/make.py'),
      'utf8',
    );
    const listed = /LENGTHS_MS = \[([^\]]*)\]/.exec(py)?.[1];
    expect(listed?.split(',').map(s => Number(s.trim()))).toEqual(
      REST_PIECES.map(p => p.ms).sort((a, b) => a - b),
    );
  });

  it('play for as long as their name says (MPEG-1 Layer III frames)', () => {
    for (const p of REST_PIECES) {
      const ms = mp3Ms(
        fs.readFileSync(path.join(AUDIO, `silence-${p.ms}ms.mp3`)),
      );
      // The encoder's delay and padding, under a frame and a half.
      expect(ms).toBeGreaterThanOrEqual(p.ms);
      expect(ms - p.ms).toBeLessThan(60);
    }
  });
});

/** Length of an MPEG-1 Layer III file by its audio frames (an Info/Xing frame not counted). */
function mp3Ms(b: Buffer): number {
  const KBPS = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ];
  const RATES = [44100, 48000, 32000];
  let i = 0;
  if (b.toString('latin1', 0, 3) === 'ID3') {
    i =
      10 +
      (((b[6] & 127) << 21) |
        ((b[7] & 127) << 14) |
        ((b[8] & 127) << 7) |
        (b[9] & 127));
  }
  let frames = 0;
  let rate = 0;
  let first = true;
  while (i + 4 <= b.length) {
    expect(b[i]).toBe(0xff);
    expect((b[i + 1] >> 1) & 0x0f).toBe(0x0d); // MPEG-1, Layer III
    rate = RATES[(b[i + 2] >> 2) & 3];
    const len =
      Math.floor((144 * KBPS[b[i + 2] >> 4] * 1000) / rate) +
      ((b[i + 2] >> 1) & 1);
    const head = b.toString('latin1', i + 4, i + 44);
    if (!(first && (head.includes('Info') || head.includes('Xing'))))
      frames += 1;
    first = false;
    i += len;
  }
  expect(i).toBe(b.length);
  return (frames * 1152 * 1000) / rate;
}
