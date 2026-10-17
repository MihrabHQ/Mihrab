/**
 * The phone's zone is resolved once and kept (`deviceZone`): asking Intl is
 * the slow part on Hermes, and it is asked for every stored day. Kept only
 * until something could have changed it — a return to the foreground, or
 * the device's offset moving.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  _resetZoneCacheForTests,
  deviceZone,
  invalidateDeviceZone,
} from '../src/utils/zoneClock';

let zone = 'Europe/Stockholm';
let offset = -120;
let asked = 0;
beforeEach(() => {
  zone = 'Europe/Stockholm';
  offset = -120;
  asked = 0;
  _resetZoneCacheForTests();
  jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockImplementation(() => {
      asked++;
      return { timeZone: zone } as Intl.ResolvedDateTimeFormatOptions;
    });
  jest
    .spyOn(Date.prototype, 'getTimezoneOffset')
    .mockImplementation(() => offset);
});
afterEach(() => jest.restoreAllMocks());

it('asks Intl once while nothing changes', () => {
  expect(deviceZone()).toBe('Europe/Stockholm');
  expect(deviceZone()).toBe('Europe/Stockholm');
  expect(asked).toBe(1);
});

it('asks again when the offset moves', () => {
  deviceZone();
  zone = 'Africa/Casablanca';
  offset = 0;
  expect(deviceZone()).toBe('Africa/Casablanca');
  expect(asked).toBe(2);
});

it('asks again after a return to the foreground', () => {
  deviceZone();
  zone = 'Europe/Berlin'; // same offset
  expect(deviceZone()).toBe('Europe/Stockholm');
  invalidateDeviceZone();
  expect(deviceZone()).toBe('Europe/Berlin');
});

it('keeps an unresolvable zone as unresolvable, without throwing', () => {
  (
    Intl.DateTimeFormat.prototype.resolvedOptions as jest.Mock
  ).mockImplementation(() => {
    throw new Error('no Intl');
  });
  expect(deviceZone()).toBeUndefined();
});

it('the foreground invalidation is wired at the entry point', () => {
  const root = path.join(__dirname, '..');
  const wire = readFileSync(
    path.join(root, 'src/utils/deviceZoneAppState.ts'),
    'utf8',
  );
  expect(wire).toMatch(/state === 'active'\) invalidateDeviceZone\(\)/);
  const index = readFileSync(path.join(root, 'index.js'), 'utf8');
  expect(index).toContain("import './src/utils/deviceZoneAppState';");
  // zoneClock.ts stays a leaf the tools can run under plain Node.
  const leaf = readFileSync(path.join(root, 'src/utils/zoneClock.ts'), 'utf8');
  expect(leaf).not.toMatch(/from 'react-native'/);
});
