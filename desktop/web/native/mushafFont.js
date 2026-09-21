/**
 * MushafFont on the desktop: the CSS Font Loading API.
 *
 * The app keeps a ring of slot families ("MihrabMushaf0"…) and re-registers
 * a slot with another page's font when it recycles it. Here that means:
 * drop the FontFace the slot had, load the page's file as a new one under
 * the same family, add it. Chromium then redraws text in that family with
 * the new face — the same contract the phones keep.
 *
 * The file is read and loaded from memory rather than by URL, because it
 * needs a `post` table added before Chromium will take it (see sfnt.js).
 */
import { desktop } from '../shims/desktop';
import { base64ToBytes, withPostTable } from './sfnt';

const faces = new Map();

async function fontBytes(path) {
  const d = desktop();
  if (!d) throw new Error('MushafFont needs the desktop app');
  return withPostTable(base64ToBytes(await d.fs.readFile(path, 'base64')));
}

export const MushafFont = {
  async registerFont(family, path) {
    const face = new FontFace(family, await fontBytes(path), { display: 'block' });
    await face.load();
    const previous = faces.get(family);
    if (previous) document.fonts.delete(previous);
    document.fonts.add(face);
    faces.set(family, face);
    return family;
  },
  async isValidFont(path) {
    try {
      const probe = new FontFace(`MihrabProbe${Date.now()}`, await fontBytes(path));
      await probe.load();
      return true;
    } catch {
      return false;
    }
  },
};
