/**
 * The reader's riwayah on the translation view's Ḥafṣ rows (#138, #139).
 * Placed by the Ḥafṣ ayahs each riwayah ayah is recited in, never by its
 * number: Warsh's ayah n is not Ḥafṣ ayah n from the first difference in
 * a surah on.
 */
jest.mock('../src/quran/riwayahData', () => ({
  // Every Warsh/Qālūn ayah that exists, as "w<surah>:<ayah>".
  riwayahAyahText: (riwayah: string, surah: number, ayah: number) => {
    const counts: Record<number, number> = { 1: 7, 2: 285, 56: 99, 79: 45, 112: 4 };
    if (riwayah === 'hafs') return null;
    if (riwayah === 'missing') return null;
    return ayah <= (counts[surah] ?? 0) ? `w${surah}:${ayah}` : null;
  },
}));

import { riwayahRows } from '../src/quran/riwayahRows';

const text = (s: string) => ({ kind: 'text' as const, text: s });

describe('riwayahRows', () => {
  it('Ḥafṣ needs none of it', () => {
    expect(riwayahRows('hafs', 1, 7)).toBeNull();
  });

  it('al-Fātiḥah: the basmalah row keeps the bundled basmalah, الْحَمْدُ goes on row 2, and the split last ayah shares row 7', () => {
    const rows = riwayahRows('warsh', 1, 7)!;
    expect(rows[0]).toEqual({ kind: 'basmalah' });
    expect(rows[1]).toMatchObject(text('w1:1'));
    expect(rows[2]).toMatchObject(text('w1:2'));
    expect(rows[5]).toMatchObject(text('w1:5'));
    // صِرَٰطَ اَ۬لذِينَ أَنْعَمْتَ عَلَيْهِمْ is an ayah of its own in Warsh.
    expect(rows[6]).toEqual({ kind: 'text', text: 'w1:6 w1:7', ayahs: [6, 7], parts: ['w1:6', 'w1:7'] });
  });

  it('al-Baqarah: الٓمٓ is not an ayah, so Warsh 1 holds Ḥafṣ 1 and 2, and every row after is one on', () => {
    const rows = riwayahRows('warsh', 2, 286)!;
    expect(rows[0]).toEqual({ kind: 'text', text: 'w2:1', ayahs: [1], parts: ['w2:1'] });
    expect(rows[1]).toEqual({ kind: 'joined', into: 1 });
    expect(rows[2]).toMatchObject(text('w2:2'));
    // The last two ayahs: Ḥafṣ 285–286 are Warsh 284–285.
    expect(rows[284]).toMatchObject(text('w2:284'));
    expect(rows[285]).toMatchObject(text('w2:285'));
  });

  it('an-Nāziʿāt 37: one Warsh ayah for Ḥafṣ 37 and 38', () => {
    const rows = riwayahRows('qalun', 79, 46)!;
    expect(rows[36]).toMatchObject({ kind: 'text', ayahs: [37] });
    expect(rows[37]).toEqual({ kind: 'joined', into: 37 });
    expect(rows[45]).toMatchObject(text('w79:45'));
  });

  it('al-Wāqiʿah: 99 Madani ayahs to 96 — the splits share their row', () => {
    const rows = riwayahRows('warsh', 56, 96)!;
    expect(rows).toHaveLength(96);
    expect(rows[7]).toEqual({ kind: 'text', text: 'w56:8 w56:9', ayahs: [8, 9], parts: ['w56:8', 'w56:9'] });
    expect(rows[95]).toMatchObject(text('w56:99'));
    expect(rows.every(r => r != null)).toBe(true);
  });

  it('the same count as Ḥafṣ: row n is ayah n', () => {
    const rows = riwayahRows('shubah', 112, 4)!;
    expect(rows.map(r => (r.kind === 'text' ? r.text : r.kind))).toEqual(['w112:1', 'w112:2', 'w112:3', 'w112:4']);
  });

  it('no text on this device (an image riwayah, a dataset not hydrated): null, and the caller shows the bundled text whole', () => {
    expect(riwayahRows('missing' as never, 1, 7)).toBeNull();
  });
});
