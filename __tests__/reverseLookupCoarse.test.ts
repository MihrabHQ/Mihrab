/**
 * Automatic location names the town without being asked to — so the fix it
 * sends to OpenStreetMap is coarse: two decimals, about a kilometre.
 */
import { coarseForLookup, reverseLocality, REVERSE_LOOKUP_DECIMALS } from '../src/geocoding/nominatim';

describe('the reverse lookup sends a town, not a doorstep', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('rounds to two decimals', () => {
    expect(REVERSE_LOOKUP_DECIMALS).toBe(2);
    expect(coarseForLookup(59.329323)).toBe('59.33');
    expect(coarseForLookup(-6.208763)).toBe('-6.21');
  });

  it('puts only the coarse coordinates in the request', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ address: { city: 'Stockholm', country_code: 'se' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await reverseLocality(59.3293235, 18.0685808);
    expect(r).toBeTruthy();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/[?&]lat=59\.33&lon=18\.07&/);
    expect(urls[0]).not.toMatch(/59\.329|18\.068/);
  });
});
