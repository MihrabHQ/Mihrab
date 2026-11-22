/**
 * iOS: a stale cached location never answers a fresh request.
 *
 * @react-native-community/geolocation answered every pending request with
 * the first location Core Location delivered and stopped — and Core
 * Location often delivers its CACHED last location first, hours old. A
 * reader who travelled from Sweden to Germany was shown Stockholm at every
 * launch and every pull to refresh (Nov 2026). The patch makes each request
 * wait for a fix within its `maximumAge` (and this app asks for 60 s,
 * `getPosition.ts`). Native code cannot run here, so this holds the patch.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const patch = readFileSync(
  path.join(root, 'patches/@react-native-community+geolocation+3.4.0.patch'),
  'utf8',
);

describe('the iOS location patch', () => {
  it('lets a fix answer only requests it is fresh enough for', () => {
    expect(patch).toContain('ios/RNCGeolocation.mm');
    expect(patch).toMatch(/\+\s+NSTimeInterval age = -\[location\.timestamp timeIntervalSinceNow\];/);
    expect(patch).toMatch(/\+\s+if \(age > MAX\(request\.options\.maximumAge, 10\.0\)\) \{/);
    // And keeps updating while a request still waits.
    expect(patch).toMatch(/\+\s+if \(!_observingLocation && _pendingRequests\.count == 0\) \{/);
  });

  it('is what node_modules has', () => {
    const mm = readFileSync(
      path.join(root, 'node_modules/@react-native-community/geolocation/ios/RNCGeolocation.mm'),
      'utf8',
    );
    expect(mm).toContain('if (age > MAX(request.options.maximumAge, 10.0)) {');
  });

  it('the app asks for a fix no older than a minute', () => {
    const src = readFileSync(path.join(root, 'src/utils/getPosition.ts'), 'utf8');
    expect(src).toMatch(/opts\.maximumAge \?\? 60_000/);
  });
});
