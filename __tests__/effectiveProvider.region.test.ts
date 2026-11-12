/**
 * Region-aware provider selection.
 *
 * `islamiska_forbundet` only has data for Swedish cities, so it must never be
 * used for coordinates outside Sweden — in automatic mode OR when the user has
 * pinned it manually. Verifies the provider switches intuitively by location.
 */
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';

const STOCKHOLM = { latitude: 59.3251, longitude: 18.0711 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };
const ALICE_SPRINGS = { latitude: -29.0135, longitude: 134.7544 }; // Coober Pedy: no place Diyanet lists within reach (Alice Springs itself is listed)

describe('getEffectiveDataProvider — region awareness', () => {
  describe('automatic mode', () => {
    it('uses the Swedish source inside Sweden', () => {
      expect(getEffectiveDataProvider(true, 'aladhan', STOCKHOLM, 'auto')).toBe(
        'islamiska_forbundet',
      );
    });

    it('uses Diyanet near a place it lists, outside Sweden', () => {
      // Paris; Manchester is a town of Wifaqul Ulama's timetables now
      expect(getEffectiveDataProvider(true, 'islamiska_forbundet', { latitude: 48.8566, longitude: 2.3522 }, 'auto')).toBe('diyanet');
      expect(getEffectiveDataProvider(true, 'islamiska_forbundet', MANCHESTER, 'auto')).toBe('wifaq');
    });

    it('uses London’s own timetable in London', () => {
      expect(getEffectiveDataProvider(true, 'islamiska_forbundet', LONDON, 'auto')).toBe('london');
      // A method chosen by hand is the reader's: computed, not the timetable.
      expect(getEffectiveDataProvider(true, 'islamiska_forbundet', LONDON, 3)).toBe('aladhan');
    });

    it('uses the global default further from any', () => {
      expect(getEffectiveDataProvider(true, 'islamiska_forbundet', ALICE_SPRINGS, 'auto')).toBe('aladhan');
    });

    it('falls back to the global default when coords are unknown', () => {
      expect(getEffectiveDataProvider(true, 'aladhan', null, 'auto')).toBe('aladhan');
    });
  });

  describe('manual mode', () => {
    it('honours a pinned Swedish source while inside Sweden', () => {
      expect(
        getEffectiveDataProvider(false, 'islamiska_forbundet', STOCKHOLM, 'auto'),
      ).toBe('islamiska_forbundet');
    });

    it('redirects a pinned Swedish source to what Automatic picks outside Sweden', () => {
      // The bug: "Stockholm" label but London coords returned Sweden-table
      // times. The guard keeps prayer times correct wherever the user is.
      expect(
        getEffectiveDataProvider(false, 'islamiska_forbundet', LONDON, 'auto'),
      ).toBe('london');
      expect(
        getEffectiveDataProvider(false, 'islamiska_forbundet', ALICE_SPRINGS, 'auto'),
      ).toBe('aladhan');
    });

    it('leaves a pinned Swedish source untouched when coords are unknown', () => {
      // Without coords we cannot know the region — re-resolve once location loads.
      expect(
        getEffectiveDataProvider(false, 'islamiska_forbundet', null, 'auto'),
      ).toBe('islamiska_forbundet');
    });

    it('never overrides a non-Swedish manual pick', () => {
      expect(getEffectiveDataProvider(false, 'aladhan', STOCKHOLM, 'auto')).toBe(
        'aladhan',
      );
    });
  });
});
