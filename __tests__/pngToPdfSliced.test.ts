/**
 * The month sheet's PDF, made in slices with a progress report.
 *
 * Done in one go it held the JS thread for seconds on a phone with nothing
 * on screen saying so. What the sliced version must get right: every PNG
 * row filter decodes to the exact pixels (the row loops were rewritten
 * for speed, one loop per filter); it makes a page with the same pixels
 * as the one-go version; the progress only goes forward and ends at 1;
 * and the faster base64 either side still round-trips.
 */
import { unzlibSync, zlibSync } from 'fflate';
import {
  decodePng,
  fromBase64,
  pngToPdfA4,
  pngToPdfA4Async,
  toBase64,
} from '../src/share/pngToPdf';

/** A small RGBA PNG whose rows use every filter in turn, and its plain RGB. */
function makePng(width: number, height: number) {
  const channels = 4;
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + (i >> 5) * 7) & 0xff;
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = pixels[y * stride + i];
      const a = i >= channels ? pixels[y * stride + i - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      const pred =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? (a + b) >> 1
                : paeth(a, b, c);
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 0xff;
    }
  }

  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlibSync(raw);
  // Two IDATs, as real encoders write them.
  const half = idat.length >> 1;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat.subarray(0, half)),
    chunk('IDAT', idat.subarray(half)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4) {
    rgb[j++] = pixels[i];
    rgb[j++] = pixels[i + 1];
    rgb[j++] = pixels[i + 2];
  }
  return { png, rgb };
}

/** The image stream's pixels, inflated back out of a PDF. */
function pdfPixels(pdf: Uint8Array): Uint8Array {
  const text = Buffer.from(pdf).toString('latin1');
  const m = /\/Length (\d+) >>\nstream\n/.exec(text);
  if (!m) throw new Error('no image stream');
  const at = m.index + m[0].length;
  return unzlibSync(pdf.subarray(at, at + Number(m[1])));
}

describe('the month sheet PDF, in slices', () => {
  const { png, rgb } = makePng(97, 61);
  const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

  it('decodes every PNG row filter to the exact pixels', () => {
    const decoded = decodePng(png);
    expect(decoded.width).toBe(97);
    expect(decoded.height).toBe(61);
    expect(same(decoded.rgb, rgb)).toBe(true);
  });

  it('makes the same page in slices as in one go, and says how far it has got', async () => {
    const seen: number[] = [];
    const sliced = await pngToPdfA4Async(png, f => seen.push(f));
    expect(same(pdfPixels(sliced), rgb)).toBe(true);
    expect(same(pdfPixels(pngToPdfA4(png)), rgb)).toBe(true);
    expect(Buffer.from(sliced.subarray(0, 8)).toString('latin1')).toBe('%PDF-1.4');
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  it('round-trips base64 across the 8K string pieces', () => {
    for (const n of [0, 1, 2, 3, 6143, 6144, 6145, 30000]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 0xff);
      const b64 = Buffer.from(bytes).toString('base64');
      expect(toBase64(bytes)).toBe(b64);
      expect(same(fromBase64(b64), bytes)).toBe(true);
    }
    // Line breaks in what a native module hands back are skipped.
    expect(Buffer.from(fromBase64('aGVs\nbG8=')).toString()).toBe('hello');
  });
});
