/**
 * The box drawn around Morocco, and the two things it must get right.
 *
 * Automatic provider selection has to answer "is this coordinate in the
 * country this dataset covers?" instantly and offline, before any network
 * call — which is why it is a bounding box and not a reverse-geocoded
 * country code. A box cannot follow Morocco's eastern border, so this pins
 * what it must include and what it must not.
 */
import { isCoordinateInMorocco } from '../src/utils/moroccoRegion';

describe('inside', () => {
  it.each([
    ['Casablanca', 33.5731, -7.5898],
    ['Rabat', 34.0209, -6.8416],
    ['Marrakech', 31.6295, -7.9811],
    ['Tangier', 35.7595, -5.834],
    ['Oujda, on the Algerian border', 34.6867, -1.9114],
    ['Agadir', 30.4278, -9.5981],
    ['Dakhla, Western Sahara', 23.6848, -15.958],
    ['Lagouira, the far south', 20.9167, -17.05],
  ])('%s', (_name, lat, lng) => {
    expect(isCoordinateInMorocco(lat, lng)).toBe(true);
  });

  it.each([
    ['Ceuta', 35.8894, -5.3213],
    ['Melilla', 35.2923, -2.9381],
  ])('%s — the ministry publishes it, so we cover it', (_name, lat, lng) => {
    // سبتة and مليلية are both in the ministry's own city list. Carving
    // them out would leave someone there with no dataset for a table that
    // exists.
    expect(isCoordinateInMorocco(lat, lng)).toBe(true);
  });
});

describe('outside', () => {
  it.each([
    ['Las Palmas, Canary Islands', 28.1235, -15.4363],
    ['Santa Cruz de Tenerife', 28.4636, -16.2518],
    ['Lanzarote', 28.9633, -13.5477],
  ])('%s — Spanish, and squarely inside any box round Morocco', (_name, lat, lng) => {
    expect(isCoordinateInMorocco(lat, lng)).toBe(false);
  });

  it.each([
    ['Algiers', 36.7538, 3.0588],
    ['Gibraltar', 36.1408, -5.3536],
    ['Nouakchott', 18.0735, -15.9582],
    ['Madrid', 40.4168, -3.7038],
    ['Stockholm', 59.3293, 18.0686],
    ['the Atlantic, well west', 30.0, -25.0],
  ])('%s', (_name, lat, lng) => {
    expect(isCoordinateInMorocco(lat, lng)).toBe(false);
  });

  it('follows the border, so Algeria’s side of it is not Morocco', () => {
    // A rectangle took in Tlemcen; the country's outline does not.
    expect(isCoordinateInMorocco(34.8828, -1.315)).toBe(false); // Tlemcen
    expect(isCoordinateInMorocco(34.85, -1.73)).toBe(false); // Maghnia
    expect(isCoordinateInMorocco(32.05, -1.25)).toBe(false); // Beni Ounif, beside Figuig
  });
});
