/**
 * On the web a Modal is drawn in an element of its own on <body>, outside
 * the root View that carries the app's direction. Until 2026-11-24 every
 * sheet in Arabic or Urdu was therefore laid out left to right in the
 * browser and the desktop app, and a switch's thumb hung beside its track.
 * <body> now carries the app's direction, so the portals inherit it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = readFileSync(path.join(__dirname, '../src/AppNavigationRoot.tsx'), 'utf8');

it('<body> follows the app’s layout direction, on the web only', () => {
  const at = root.indexOf('doc.body.style.direction = layoutDir');
  expect(at).toBeGreaterThan(0);
  const effect = root.slice(root.lastIndexOf('useEffect(', at), at);
  expect(effect).toMatch(/Platform\.OS !== 'web'/);
  expect(effect).toMatch(/typeof doc === 'undefined'/);
  // The same value the root View is mirrored by.
  expect(root).toMatch(/direction: layoutDir,/);
});
