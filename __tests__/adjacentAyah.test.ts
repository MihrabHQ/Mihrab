/**
 * The ayah sheet's ‹ › step through the Qur'an with `adjacentAyah`:
 * one ayah at a time, over a surah's end into the next, and nowhere
 * past the first or the last ayah.
 */
import { adjacentAyah, ayahCountForRiwayah } from '../src/quran/pages';

describe('adjacentAyah', () => {
  it('steps within a surah', () => {
    expect(adjacentAyah(2, 255, 1)).toEqual({ surah: 2, ayah: 256 });
    expect(adjacentAyah(2, 255, -1)).toEqual({ surah: 2, ayah: 254 });
  });

  it('crosses from a surah’s last ayah into the next surah', () => {
    expect(adjacentAyah(1, 7, 1)).toEqual({ surah: 2, ayah: 1 });
    expect(adjacentAyah(2, 286, 1)).toEqual({ surah: 3, ayah: 1 });
  });

  it('crosses back from a surah’s first ayah to the last of the one before', () => {
    expect(adjacentAyah(2, 1, -1)).toEqual({ surah: 1, ayah: 7 });
    expect(adjacentAyah(3, 1, -1)).toEqual({ surah: 2, ayah: 286 });
  });

  it('stops at the first and the last ayah of the Qur’an', () => {
    expect(adjacentAyah(1, 1, -1)).toBeNull();
    expect(adjacentAyah(114, 6, 1)).toBeNull();
    expect(adjacentAyah(114, 6, -1)).toEqual({ surah: 114, ayah: 5 });
  });

  it('counts by the riwayah asked for (Ḥafṣ when its data is not on the device)', () => {
    const last = ayahCountForRiwayah('warsh', 5);
    expect(adjacentAyah(5, last, 1, 'warsh')).toEqual({ surah: 6, ayah: 1 });
    expect(adjacentAyah(6, 1, -1, 'warsh')).toEqual({ surah: 5, ayah: last });
  });

  it('walks every one of the 6,236 ayahs forward and back again', () => {
    let at: { surah: number; ayah: number } | null = { surah: 1, ayah: 1 };
    let steps = 0;
    while (at) {
      const next = adjacentAyah(at.surah, at.ayah, 1);
      if (next) expect(adjacentAyah(next.surah, next.ayah, -1)).toEqual(at);
      at = next;
      steps += 1;
    }
    expect(steps).toBe(6236);
  });
});
