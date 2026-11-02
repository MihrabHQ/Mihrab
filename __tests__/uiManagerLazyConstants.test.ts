import fs from 'fs';
import path from 'path';

/**
 * React Native is patched (patches/react-native+0.87.1.patch) so that
 * `UIManager.js` copies `BridgelessUIManager`'s view-manager properties as
 * the lazy getters they are, instead of spreading them — a spread read every
 * view manager's constants from the native side at launch, 33 ms on a
 * Pixel 10 Pro before the first frame (docs/first-frame-plan.md).
 */
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('UIManager keeps the view-manager constants lazy', () => {
  it('is patched into React Native', () => {
    const patch = read('patches/react-native+0.87.1.patch');
    expect(patch).toMatch(/Libraries\/ReactNative\/UIManager\.js/);
    expect(patch).toMatch(/^-\s*\.\.\.UIManagerImpl,/m);
    expect(patch).toMatch(/Object\.getOwnPropertyDescriptor\(UIManagerImpl, key\)/);
  });

  it('is applied on install', () => {
    const src = read('node_modules/react-native/Libraries/ReactNative/UIManager.js');
    expect(src).not.toMatch(/\.\.\.UIManagerImpl/);
    expect(src).toMatch(/Object\.defineProperty\(UIManager, key, \{\.\.\.descriptor, configurable: true\}\)/);
  });

  it('copies getters as getters and values as values, and never a property the wrapper defines itself', () => {
    const impl: Record<string, unknown> = { measure: () => 'impl' };
    let reads = 0;
    Object.defineProperty(impl, 'RNSVGSvgView', {
      enumerable: true,
      configurable: true,
      get: () => {
        reads += 1;
        return { lazy: true };
      },
    });
    const wrapper: Record<string, unknown> = { measure: () => 'wrapper' };
    for (const key of Object.keys(impl)) {
      if (Object.prototype.hasOwnProperty.call(wrapper, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(impl, key);
      if (descriptor) Object.defineProperty(wrapper, key, { ...descriptor, configurable: true });
    }
    expect(reads).toBe(0);
    expect((wrapper.measure as () => string)()).toBe('wrapper');
    expect(wrapper.RNSVGSvgView).toEqual({ lazy: true });
    expect(reads).toBe(1);
  });
});
