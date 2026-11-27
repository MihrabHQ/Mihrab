/**
 * A phone with Location off, or a device with nothing to find a position
 * with, is told so at once — not after a timeout — and shown the way on.
 */
import fs from 'fs';
import path from 'path';
import { NativeModules } from 'react-native';
const { locationAvailability } = jest.requireActual('../src/native/Geolocation') as typeof import('../src/native/Geolocation');

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('locationAvailability', () => {
  const mod = () => (NativeModules.MihrabGeolocation ??= {}) as Record<string, unknown>;
  afterEach(() => {
    delete mod().getAvailability;
  });

  it('is ok where the question cannot be asked', async () => {
    delete mod().getAvailability;
    expect(await locationAvailability()).toBe('ok');
  });

  it('tells off from none from ok', async () => {
    mod().getAvailability = async () => ({ enabled: false, hasProvider: true });
    expect(await locationAvailability()).toBe('off');
    mod().getAvailability = async () => ({ enabled: true, hasProvider: false });
    expect(await locationAvailability()).toBe('none');
    mod().getAvailability = async () => ({ enabled: false, hasProvider: false });
    expect(await locationAvailability()).toBe('none');
    mod().getAvailability = async () => ({ enabled: true, hasProvider: true });
    expect(await locationAvailability()).toBe('ok');
  });

  it('never blocks a request on its own failure', async () => {
    mod().getAvailability = async () => {
      throw new Error('x');
    };
    expect(await locationAvailability()).toBe('ok');
  });
});

describe('where it is asked', () => {
  it('before the permission question, in setup and on Today', () => {
    const setup = read('src/components/LocationSetup.tsx');
    expect(setup.indexOf('await locationAvailability()')).toBeGreaterThan(-1);
    expect(setup.indexOf('await locationAvailability()')).toBeLessThan(
      setup.indexOf('await requestAndroidLocationPermission()'),
    );
    const day = read('src/hooks/usePrayerDay.ts');
    expect(day.indexOf('await locationAvailability()')).toBeLessThan(
      day.indexOf('await requestAndroidLocationPermission()'),
    );
    expect(read('src/screens/home/usePhaseRouting.ts')).toContain('unavailable: state.reason');
  });

  it('offers the settings only when there is a switch to turn on', () => {
    const setup = read('src/components/LocationSetup.tsx');
    expect(setup).toMatch(/locationOff && Platform\.OS === 'android'/);
    expect(setup).toContain('android.settings.LOCATION_SOURCE_SETTINGS');
  });

  it('has its words in every language', () => {
    const dir = path.join(root, 'src/i18n/locales');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const k of ['locationOff', 'locationNone', 'locationNotFound']) {
        expect(typeof d.errors[k]).toBe('string');
      }
      expect(typeof d.locationSetup.openLocationSettings).toBe('string');
    }
  });
});
