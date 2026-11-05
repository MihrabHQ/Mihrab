/**
 * The ‹ › on a phone on its side, in fullscreen: centred between the
 * display's edge and the text, clear of a cutout, and not drawn at all
 * where the margin cannot hold them. See `landscapeTurnButtons`.
 */
import {
  landscapeTurnButtons,
  TURN_BUTTON_W,
} from '../src/quran/landscapeTurnButtons';

describe('landscapeTurnButtons', () => {
  it('centres each button between the edge of the display and the text', () => {
    // No cutout: a 900-wide pager, a 600-wide column, 150 either side.
    const p = landscapeTurnButtons({ padLeft: 0, padRight: 0, pageWidth: 900, textWidth: 600 });
    expect(p.left).toBe(75 - TURN_BUTTON_W / 2);
    expect(p.right).toBe(75 - TURN_BUTTON_W / 2);
  });

  it('measures from the display edge, not the pager edge, when nothing is in the way', () => {
    // A 10dp pad is a cutout: the centre (80) is clear of it, so it stays.
    const p = landscapeTurnButtons({ padLeft: 10, padRight: 10, pageWidth: 880, textWidth: 580 });
    // Text edge at 10 + 150 = 160 from the display; centre 80; offset in
    // the pager = 80 - 20 - 10.
    expect(p.left).toBe(50);
    expect(p.right).toBe(50);
  });

  it('steps inward past a cutout rather than sit under the camera', () => {
    // An iPhone on its side: 62 of island inset, 53 of margin.
    const p = landscapeTurnButtons({ padLeft: 62, padRight: 62, pageWidth: 750, textWidth: 644 });
    const textEdge = 62 + 53;
    // The whole button is clear of the inset and of the text.
    expect(p.left).not.toBeNull();
    expect(p.left!).toBeGreaterThanOrEqual(0);
    expect(62 + p.left! + TURN_BUTTON_W).toBeLessThanOrEqual(textEdge);
  });

  it('draws no button where the margin cannot hold one', () => {
    const p = landscapeTurnButtons({ padLeft: 0, padRight: 0, pageWidth: 700, textWidth: 660 });
    expect(p).toEqual({ left: null, right: null });
  });

  it('places each side on its own when the paddings differ', () => {
    // A vertical bar on the right only.
    const p = landscapeTurnButtons({ padLeft: 0, padRight: 48, pageWidth: 852, textWidth: 600 });
    expect(p.left).toBe(126 / 2 - TURN_BUTTON_W / 2);
    expect(p.right).not.toBeNull();
    expect(48 + p.right! + TURN_BUTTON_W).toBeLessThanOrEqual(48 + 126);
  });
});
