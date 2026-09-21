/**
 * MushafFont on the desktop: the CSS Font Loading API.
 *
 * The app keeps a ring of slot families ("MihrabMushaf0"…) and re-registers
 * a slot with another page's font when it recycles it. Here that means:
 * drop the FontFace the slot had, load the page's file as a new one under
 * the same family, add it. Chromium then redraws text in that family with
 * the new face — the same contract the phones keep.
 */
import { desktop } from '../shims/desktop';

const faces = new Map();

export const MushafFont = {
  async registerFont(family, path) {
    const d = desktop();
    if (!d) throw new Error('MushafFont needs the desktop app');
    const face = new FontFace(family, `url("${d.fs.fileUrl(path)}")`, { display: 'block' });
    await face.load();
    const previous = faces.get(family);
    if (previous) document.fonts.delete(previous);
    document.fonts.add(face);
    faces.set(family, face);
    return family;
  },
  async isValidFont(path) {
    const d = desktop();
    if (!d) return false;
    try {
      const probe = new FontFace(`MihrabProbe${Date.now()}`, `url("${d.fs.fileUrl(path)}")`);
      await probe.load();
      return true;
    } catch {
      return false;
    }
  },
};
