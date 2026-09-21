/**
 * The Windows/Linux build draws the mushaf from the same page fonts as the
 * phones, and Chromium rejects them unless they carry a `post` table, which
 * they do not. desktop/web/native/sfnt.js adds one in memory. What matters:
 * the result is a well-formed font with every original table intact, and a
 * font that already has `post` is left alone.
 */
import { readFileSync } from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withPostTable } = require('../desktop/web/native/sfnt');

type Table = { tag: string; checksum: number; offset: number; length: number };

function tables(bytes: Uint8Array): Table[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  return Array.from({ length: n }, (_, i) => {
    const at = 12 + 16 * i;
    return {
      tag: String.fromCharCode(...bytes.subarray(at, at + 4)),
      checksum: v.getUint32(at + 4),
      offset: v.getUint32(at + 8),
      length: v.getUint32(at + 12),
    };
  });
}

function sum(bytes: Uint8Array, offset: number, length: number): number {
  const padded = new Uint8Array((length + 3) & ~3);
  padded.set(bytes.subarray(offset, offset + length));
  const v = new DataView(padded.buffer);
  let s = 0;
  for (let o = 0; o < padded.length; o += 4) s = (s + v.getUint32(o)) >>> 0;
  return s;
}

/** A font with its post table taken out, the shape the page fonts ship in. */
function withoutPost(bytes: Uint8Array): Uint8Array {
  const keep = tables(bytes).filter(t => t.tag !== 'post');
  const header = 12 + 16 * keep.length;
  let size = header;
  for (const t of keep) size += (t.length + 3) & ~3;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, keep.length);
  let off = header;
  keep.forEach((t, i) => {
    out.set(bytes.subarray(t.offset, t.offset + t.length), off);
    const at = 12 + 16 * i;
    for (let k = 0; k < 4; k++) out[at + k] = t.tag.charCodeAt(k);
    v.setUint32(at + 4, t.checksum);
    v.setUint32(at + 8, off);
    v.setUint32(at + 12, t.length);
    off += (t.length + 3) & ~3;
  });
  return out;
}

const font = new Uint8Array(
  readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'fonts', 'SurahNames.ttf')),
);

describe('a page font gains the post table Chromium requires', () => {
  const stripped = withoutPost(font);
  const fixed: Uint8Array = withPostTable(stripped);

  it('the fixture really lacks post, as the QPC page fonts do', () => {
    expect(tables(stripped).map(t => t.tag)).not.toContain('post');
  });

  it('adds a version-3 post table and keeps every other table byte for byte', () => {
    const out = tables(fixed);
    const post = out.find(t => t.tag === 'post')!;
    expect(post.length).toBe(32);
    expect(new DataView(fixed.buffer, fixed.byteOffset).getUint32(post.offset)).toBe(0x00030000);
    for (const t of tables(stripped)) {
      const o = out.find(x => x.tag === t.tag)!;
      expect(o.length).toBe(t.length);
      const a = stripped.subarray(t.offset, t.offset + t.length);
      const b = fixed.subarray(o.offset, o.offset + o.length);
      if (t.tag === 'head') {
        // checkSumAdjustment (bytes 8..11) is recomputed; the rest is kept.
        expect(Buffer.from(b.subarray(0, 8))).toEqual(Buffer.from(a.subarray(0, 8)));
        expect(Buffer.from(b.subarray(12))).toEqual(Buffer.from(a.subarray(12)));
      } else {
        expect(Buffer.from(b)).toEqual(Buffer.from(a));
      }
    }
  });

  it('writes a directory OTS accepts: sorted tags, 4-byte aligned, true checksums', () => {
    const out = tables(fixed);
    const tags = out.map(t => t.tag);
    expect([...tags].sort()).toEqual(tags);
    for (const t of out) {
      expect(t.offset % 4).toBe(0);
      if (t.tag !== 'head') expect(t.checksum).toBe(sum(fixed, t.offset, t.length));
    }
    // The whole-file checksum lands on the magic number the spec requires.
    expect(sum(fixed, 0, fixed.length)).toBe(0xb1b0afba);
  });

  it('leaves a font that already has post exactly as it was', () => {
    expect(tables(font).map(t => t.tag)).toContain('post');
    expect(withPostTable(font)).toBe(font);
  });
});
