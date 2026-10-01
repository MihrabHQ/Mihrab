import { Unzlib, unzlibSync, Zlib, zlibSync } from 'fflate';

/**
 * A one-page A4 PDF wrapped around a captured PNG.
 *
 * ── WHY THIS EXISTS RATHER THAN A LIBRARY ─────────────────────────────
 *
 * The month sheet is a thing people print and pin up in a hallway, and a
 * PNG is not what you hand a printer: it has no page size, so every print
 * dialogue guesses one, and the guesses differ. A PDF that says A4 prints
 * as A4 everywhere.
 *
 * There is no PDF dependency in this app and adding one to draw a single
 * image would be a large amount of code for a small amount of work — the
 * whole document is one image on one page. What that costs is written out
 * below, and it is about a hundred lines.
 *
 * ── WHY THE PIXELS ARE RE-ENCODED ─────────────────────────────────────
 *
 * PNG is not a PDF filter. A PDF image stream can be Flate-compressed —
 * which is the same deflate a PNG uses — but PNG additionally runs a
 * per-row FILTER over the bytes before compressing them, and it may carry
 * an alpha channel that a PDF image cannot hold without a separate soft
 * mask. So the IDAT is inflated, un-filtered, stripped to RGB, and
 * deflated again. Nothing is resampled and nothing is quantised: the
 * bytes that go into the PDF are the exact pixels that came out of the
 * capture.
 *
 * The obvious shortcut — capture JPEG and embed it with DCTDecode, which
 * needs no decoding at all — was rejected on the artefact. This sheet is
 * small text on white, which is precisely what JPEG's chroma subsampling
 * and ringing damage most, and a table of prayer times that has gone soft
 * at the digits is worse than no PDF.
 */

/** A4 in PostScript points, which is the unit a PDF page is measured in. */
export const A4_WIDTH_PT = 595.276;
export const A4_HEIGHT_PT = 841.89;

type Decoded = { width: number; height: number; rgb: Uint8Array };

function be32(b: Uint8Array, at: number): number {
  return (
    ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
  );
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** What the chunk walk finds: the shape, and the compressed pixels. */
type PngParts = { width: number; height: number; channels: number; idat: Uint8Array[] };

/**
 * Walk the chunks. Only the shape a screen capture actually produces is
 * handled — eight bits a channel, truecolour with or without alpha, not
 * interlaced. Every other shape throws rather than being guessed at,
 * because a PDF built from a misread image is a file that opens and is
 * wrong, which is the worst of the three outcomes.
 */
function readPngParts(png: Uint8Array): PngParts {
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (png[i] !== PNG_MAGIC[i]) throw new Error('not a PNG');
  }
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const len = be32(png, at);
    const type = String.fromCharCode(
      png[at + 4],
      png[at + 5],
      png[at + 6],
      png[at + 7],
    );
    const body = at + 8;
    if (type === 'IHDR') {
      width = be32(png, body);
      height = be32(png, body + 4);
      const depth = png[body + 8];
      const colorType = png[body + 9];
      const interlace = png[body + 12];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (interlace !== 0) throw new Error('interlaced PNG');
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`unsupported colour type ${colorType}`);
    } else if (type === 'IDAT') {
      idat.push(png.subarray(body, body + len));
    } else if (type === 'IEND') {
      break;
    }
    at = body + len + 4; // + CRC
  }
  if (!width || !height || !channels) throw new Error('PNG has no IHDR');
  return { width, height, channels, idat };
}

/**
 * Undo PNG's filter on rows [from, to) of `raw`, writing plain RGB.
 *
 * `line` and `prev` carry the previous row between calls, so the work can
 * be cut into slices. The filter is chosen once per row and each kind has
 * its own loop: the per-byte branch the first version took was most of
 * the export's time on a phone, where Hermes runs this without a JIT.
 */
function unfilterRows(
  raw: Uint8Array,
  width: number,
  channels: number,
  rgb: Uint8Array,
  line: Uint8Array,
  prev: Uint8Array,
  from: number,
  to: number,
): void {
  const stride = width * channels;
  for (let y = from; y < to; y++) {
    let src = y * (stride + 1);
    const filter = raw[src++];
    switch (filter) {
      case 0:
        for (let i = 0; i < stride; i++) line[i] = raw[src + i];
        break;
      case 1:
        for (let i = 0; i < channels; i++) line[i] = raw[src + i];
        for (let i = channels; i < stride; i++) {
          line[i] = (raw[src + i] + line[i - channels]) & 0xff;
        }
        break;
      case 2:
        for (let i = 0; i < stride; i++) line[i] = (raw[src + i] + prev[i]) & 0xff;
        break;
      case 3:
        for (let i = 0; i < channels; i++) {
          line[i] = (raw[src + i] + (prev[i] >> 1)) & 0xff;
        }
        for (let i = channels; i < stride; i++) {
          line[i] = (raw[src + i] + ((line[i - channels] + prev[i]) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let i = 0; i < channels; i++) line[i] = (raw[src + i] + prev[i]) & 0xff;
        for (let i = channels; i < stride; i++) {
          const a = line[i - channels];
          const b = prev[i];
          const c = prev[i - channels];
          const p = a + b - c;
          const pa = p > a ? p - a : a - p;
          const pb = p > b ? p - b : b - p;
          const pc = p > c ? p - c : c - p;
          line[i] =
            (raw[src + i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        break;
      default:
        throw new Error(`unknown PNG filter ${filter}`);
    }
    // Alpha, where there is one, is dropped: the sheet is composited onto
    // opaque white before it is captured, so there is nothing to keep.
    let dst = y * width * 3;
    if (channels === 3) {
      rgb.set(line, dst);
    } else {
      for (let s = 0; s < stride; s += 4) {
        rgb[dst++] = line[s];
        rgb[dst++] = line[s + 1];
        rgb[dst++] = line[s + 2];
      }
    }
    prev.set(line);
  }
}

function joinParts(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of parts) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

/** Undo PNG's per-row filtering and hand back plain RGB. */
export function decodePng(png: Uint8Array): Decoded {
  const { width, height, channels, idat } = readPngParts(png);
  const raw = unzlibSync(joinParts(idat));
  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  unfilterRows(
    raw,
    width,
    channels,
    rgb,
    new Uint8Array(stride),
    new Uint8Array(stride),
    0,
    height,
  );
  return { width, height, rgb };
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Deflate level for the page's pixels. 6, not 9: on a phone 9 took
 * several seconds longer for a file a few dozen kilobytes smaller, and
 * the wait is the part people notice.
 */
const PDF_DEFLATE_LEVEL = 6;

/**
 * The image, centred on an A4 page at the largest size that fits.
 *
 * The sheet is drawn to A4 proportions already, so in practice this
 * scales to the full page; the fit is computed anyway so that a capture
 * whose aspect drifted by a pixel is letterboxed rather than stretched.
 */
function buildPdf(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const scale = Math.min(A4_WIDTH_PT / width, A4_HEIGHT_PT / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const x = (A4_WIDTH_PT - drawW) / 2;
  const y = (A4_HEIGHT_PT - drawH) / 2;

  const round = (n: number) => Math.round(n * 100) / 100;
  const content = ascii(
    `q\n${round(drawW)} 0 0 ${round(drawH)} ${round(x)} ${round(y)} cm\n/Im0 Do\nQ\n`,
  );

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const push = (chunk: Uint8Array) => {
    parts.push(chunk);
    cursor += chunk.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = cursor;
    push(ascii(`${n} 0 obj\n${body}\nendobj\n`));
  };

  push(ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(A4_WIDTH_PT)} ${round(
      A4_HEIGHT_PT,
    )}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );

  // Object 4 carries binary, so it cannot go through `obj`.
  offsets[4] = cursor;
  push(
    ascii(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${pixels.length} >>\nstream\n`,
    ),
  );
  push(pixels);
  push(ascii('\nendstream\nendobj\n'));

  offsets[5] = cursor;
  push(
    ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`),
  );
  push(content);
  push(ascii('endstream\nendobj\n'));

  const xrefAt = cursor;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(ascii(xref));

  return joinParts(parts);
}

export function pngToPdfA4(png: Uint8Array): Uint8Array {
  const { width, height, rgb } = decodePng(png);
  return buildPdf(width, height, zlibSync(rgb, { level: PDF_DEFLATE_LEVEL }));
}

/** How long a slice of work runs before handing the thread back, ms. */
const SLICE_MS = 30;

/** Let a frame through: the spinner, the percentage, a tap. */
const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * The same PDF, made in slices with the thread handed back between them,
 * reporting how far it has got (0–1).
 *
 * Making it is a few seconds of pure JS on a phone — inflate the capture,
 * undo its filters, deflate the pixels — and done in one go it froze the
 * screen with nothing on it to say anything was happening. Here each
 * stage runs in ~30 ms slices, and `onProgress` hears where it is
 * between them. The weights are the stages' rough share of the time.
 */
export async function pngToPdfA4Async(
  png: Uint8Array,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const report = (f: number) => onProgress?.(Math.max(0, Math.min(1, f)));
  const INFLATE = 0.15;
  const UNFILTER = 0.45;
  const DEFLATE = 0.4;
  let last = Date.now();
  const maybeBreathe = async (fraction: number) => {
    if (Date.now() - last < SLICE_MS) return;
    report(fraction);
    await breathe();
    last = Date.now();
  };

  const { width, height, channels, idat } = readPngParts(png);
  report(0);

  // 1. Inflate, a slice of the compressed stream at a time.
  const compressed = joinParts(idat);
  const inflated: Uint8Array[] = [];
  const inflater = new Unzlib(chunk => {
    inflated.push(chunk);
  });
  const IN_SLICE = 64 * 1024;
  for (let off = 0; off < compressed.length; off += IN_SLICE) {
    const end = Math.min(off + IN_SLICE, compressed.length);
    inflater.push(compressed.subarray(off, end), end === compressed.length);
    await maybeBreathe((INFLATE * end) / compressed.length);
  }
  const raw = joinParts(inflated);

  // 2. Undo the filters, a band of rows at a time.
  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const ROWS = 32;
  for (let y = 0; y < height; y += ROWS) {
    const to = Math.min(y + ROWS, height);
    unfilterRows(raw, width, channels, rgb, line, prev, y, to);
    await maybeBreathe(INFLATE + (UNFILTER * to) / height);
  }

  // 3. Deflate the pixels, a slice at a time.
  const deflated: Uint8Array[] = [];
  const deflater = new Zlib({ level: PDF_DEFLATE_LEVEL }, chunk => {
    deflated.push(chunk);
  });
  const OUT_SLICE = 256 * 1024;
  for (let off = 0; off < rgb.length; off += OUT_SLICE) {
    const end = Math.min(off + OUT_SLICE, rgb.length);
    deflater.push(rgb.subarray(off, end), end === rgb.length);
    await maybeBreathe(INFLATE + UNFILTER + (DEFLATE * end) / rgb.length);
  }
  const pdf = buildPdf(width, height, joinParts(deflated));
  report(1);
  return pdf;
}

/** Base64 for a byte array, without leaning on Buffer or btoa. */
export function toBase64(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const codes = new Uint8Array(A.length);
  for (let i = 0; i < A.length; i++) codes[i] = A.charCodeAt(i);
  const EQ = 61; // '='
  // The characters as codes first, then strings of 8K at a time: a
  // megabyte of PDF one `+=` per character was most of a second on a
  // phone.
  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out[o++] = codes[b0 >> 2];
    out[o++] = codes[((b0 & 3) << 4) | (b1 >> 4)];
    out[o++] = has1 ? codes[((b1 & 15) << 2) | (b2 >> 6)] : EQ;
    out[o++] = has2 ? codes[b2 & 63] : EQ;
  }
  const pieces: string[] = [];
  const STEP = 8192;
  for (let i = 0; i < out.length; i += STEP) {
    pieces.push(
      String.fromCharCode.apply(
        null,
        out.subarray(i, i + STEP) as unknown as number[],
      ),
    );
  }
  return pieces.join('');
}

/** Each base64 character's value, by char code; -1 for anything else. */
const B64_VALUE = (() => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < A.length; i++) table[A.charCodeAt(i)] = i;
  return table;
})();

/**
 * Bytes for a base64 string — the other half, for what capture returns.
 *
 * A lookup table rather than `indexOf` per character: the capture is a
 * few megabytes of base64, and a search of the alphabet for each of them
 * was seconds on a phone.
 */
export function fromBase64(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4) + 3);
  let at = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const v = code < 128 ? B64_VALUE[code] : -1;
    if (v < 0) continue; // '=', newlines, anything else
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}
