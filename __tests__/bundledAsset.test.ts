/** Where a bundled file is read from on each platform. */
describe('bundledAssetPath', () => {
  afterEach(() => jest.resetModules());

  function load(os: string, catalyst: boolean) {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    jest.doMock('react-native-blob-util', () => ({
      __esModule: true,
      default: { fs: { asset: (f: string) => `bundle-asset://${f}`, dirs: { MainBundleDir: '/App/Mihrab.app' } } },
    }));
    jest.doMock('../src/responsive/breakpoints', () => ({ isMacCatalyst: catalyst }));
    return require('../src/quran/bundledAsset').bundledAssetPath as (f: string) => string;
  }

  it('Android reads the APK asset by name', () => {
    expect(load('android', false)('quran/tajweed/001.json')).toBe('bundle-asset://quran/tajweed/001.json');
  });
  it('iOS reads from the bundle root', () => {
    expect(load('ios', false)('quran/tajweed/001.json')).toBe('/App/Mihrab.app/quran/tajweed/001.json');
  });
  it('the Mac reads from Contents/Resources', () => {
    expect(load('ios', true)('quran/tajweed/001.json')).toBe('/App/Mihrab.app/Contents/Resources/quran/tajweed/001.json');
  });
});
