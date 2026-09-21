/**
 * Make a page font acceptable to Chromium.
 *
 * The QPC v2 page fonts ship without a `post` table. CoreText and Android's
 * font stack do not mind; Chromium runs every web font through OTS, whose
 * rule is that `post` is required, and rejects the file outright ("post:
 * missing required table") — every page of the muṣḥaf blank.
 *
 * The files on disk stay byte-for-byte as published (the store checks their
 * size against the manifest). What is handed to FontFace is a copy with a
 * minimal version-3 `post` table added: no glyph names, which nothing here
 * needs, and the font is otherwise untouched.
 */

const u32 = (v, o) => v.getUint32(o);

function checksum(bytes, offset, length) {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  let sum = 0;
  const end = offset + ((length + 3) & ~3);
  for (let o = offset; o < end; o += 4) {
    const word =
      o + 4 <= bytes.byteLength
        ? v.getUint32(o)
        : ((bytes[o] ?? 0) << 24) | ((bytes[o + 1] ?? 0) << 16) | ((bytes[o + 2] ?? 0) << 8) | (bytes[o + 3] ?? 0);
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function tableTags(view) {
  const n = view.getUint16(4);
  const tags = [];
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i;
    tags.push({
      tag: String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)),
      offset: u32(view, at + 8),
      length: u32(view, at + 12),
    });
  }
  return tags;
}

let announced = false;

export function withPostTable(input) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const tables = tableTags(view);
  if (tables.some(t => t.tag === 'post')) return src;
  if (!announced) {
    announced = true;
    // Also the marker release.sh looks for in the minified bundle.
    console.info('[mihrab] page fonts: adding the post table Chromium requires');
  }

  const post = new Uint8Array(32);
  new DataView(post.buffer).setUint32(0, 0x00030000); // version 3.0, rest zero

  const all = [
    ...tables.map(t => ({ tag: t.tag, data: src.subarray(t.offset, t.offset + t.length) })),
    { tag: 'post', data: post },
  ].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const n = all.length;
  const headerLen = 12 + 16 * n;
  let size = headerLen;
  for (const t of all) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);

  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= n) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  ov.setUint32(0, view.getUint32(0));
  ov.setUint16(4, n);
  ov.setUint16(6, searchRange);
  ov.setUint16(8, entrySelector);
  ov.setUint16(10, n * 16 - searchRange);

  let offset = headerLen;
  let headOffset = -1;
  all.forEach((t, i) => {
    out.set(t.data, offset);
    if (t.tag === 'head') {
      headOffset = offset;
      ov.setUint32(offset + 8, 0); // checkSumAdjustment, recomputed below
    }
    const rec = 12 + 16 * i;
    for (let k = 0; k < 4; k++) out[rec + k] = t.tag.charCodeAt(k);
    ov.setUint32(rec + 4, checksum(out, offset, t.data.length));
    ov.setUint32(rec + 8, offset);
    ov.setUint32(rec + 12, t.data.length);
    offset += (t.data.length + 3) & ~3;
  });
  if (headOffset >= 0) {
    // head's own record checksum is taken with the adjustment at zero,
    // which it is; then the whole-file adjustment goes in.
    ov.setUint32(headOffset + 8, (0xb1b0afba - checksum(out, 0, out.length)) >>> 0);
  }
  return out;
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
