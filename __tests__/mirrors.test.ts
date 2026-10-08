import { fetchMirrored, mirrorUrl, MIRROR_TAGS } from '../src/config/mirrors';
import { surahRows } from '../src/quran/tafsir';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const no = (status: number) => ({ ok: false, status });

describe('mirror urls', () => {
  it('point at this repository release assets', () => {
    expect(mirrorUrl(MIRROR_TAGS.tafsir, 'x__1.json')).toBe(
      'https://github.com/MihrabHQ/Mihrab/releases/download/data-tafsir-v1/x__1.json',
    );
  });
});

describe('fetchMirrored', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('answers from the mirror and never touches the original', async () => {
    const f = jest.fn().mockResolvedValue(ok({ a: 1 }));
    global.fetch = f as never;
    const res = await fetchMirrored('https://m/1', 'https://o/1', undefined, {
      timeoutMs: 1000,
    });
    expect(res.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://m/1');
  });

  it('falls back to the original when the mirror has no such asset', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(no(404))
      .mockResolvedValueOnce(ok({ a: 2 }));
    global.fetch = f as never;
    const res = await fetchMirrored('https://m/2', 'https://o/2', undefined, {
      timeoutMs: 1000,
    });
    expect(res.ok).toBe(true);
    expect(f.mock.calls.map(c => c[0])).toEqual(['https://m/2', 'https://o/2']);
  });

  it('falls back to the original when the mirror is unreachable', async () => {
    const f = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok({ a: 3 }));
    global.fetch = f as never;
    const res = await fetchMirrored('https://m/3', 'https://o/3', undefined, {
      timeoutMs: 1000,
      baseDelayMs: 1,
    });
    expect(res.ok).toBe(true);
    expect(f.mock.calls[1][0]).toBe('https://o/3');
  });
});

describe('surahRows', () => {
  it('reads a bare array and the { ayahs } shape the Urdu edition uses', () => {
    expect(surahRows([{ ayah: 1, text: 'a' }])).toHaveLength(1);
    expect(surahRows({ ayahs: [{ ayah: 1, text: 'a' }] })).toHaveLength(1);
    expect(surahRows({ nope: true })).toBeNull();
    expect(surahRows(null)).toBeNull();
  });
});
