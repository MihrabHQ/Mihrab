/**
 * A press on the muṣḥaf page opens the ayah that was pressed — on the web too.
 *
 * On the web (the browser and the desktop app) a Pressable's onPress comes
 * from the browser's `click`, a MouseEvent with no `locationX`. The page's
 * word lookup did arithmetic on it, got NaN, and fell through to the line's
 * last word: every press opened the ayah that ends the line, and Al-Baqarah
 * 1 and Al-A'raf 1 — short ayahs that start and end inside one — could not
 * be opened at all. These press page 2's first line the way a browser does.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import MushafTextPage from '../src/quran/MushafTextPage';
import { pressLocationX } from '../src/components/pressLocation';

const colors = {
  text: '#111',
  accent: '#2E6B4F',
  heading: '#2E6B4F',
  selection: 'rgba(0,0,0,0.06)',
  muted: '#666',
  word: '#ccc',
};

/** A browser click: clientX, and the pressed element's box — no locationX. */
function webClick(clientX: number, box: { left: number; width: number }, laidOut = box.width) {
  return {
    nativeEvent: { clientX, pageX: clientX, pageY: 10 },
    currentTarget: { getBoundingClientRect: () => box, offsetWidth: laidOut },
  } as never;
}

describe('pressLocationX', () => {
  it('takes locationX where the platform gives it', () => {
    expect(pressLocationX({ nativeEvent: { locationX: 42 } } as never)).toBe(42);
  });
  it('works it out from a browser click and the pressed box', () => {
    expect(pressLocationX(webClick(130, { left: 100, width: 300 }))).toBe(30);
  });
  it('undoes a scaled page: 30 px on screen in a box drawn at half size is 60 laid out', () => {
    expect(pressLocationX(webClick(130, { left: 100, width: 150 }, 300))).toBe(60);
  });
  it('is NaN when there is nothing to go on', () => {
    expect(pressLocationX({ nativeEvent: {} } as never)).toBeNaN();
  });
});

describe('a press on page 2, as a browser makes it', () => {
  let root!: ReactTestRenderer;
  /** What the page reported pressed: the ayah, as the reader receives it. */
  const pressed: Array<{ surah: number; ayah: number }> = [];
  beforeEach(() => {
    pressed.length = 0;
    act(() => {
      root = create(
        <MushafTextPage
          page={2}
          width={360}
          colors={colors}
          fontFamily="MihrabMushaf1"
          onWordPress={w => pressed.push(w)}
          onWordLongPress={() => {}}
        />,
      );
    });
  });

  // The first ayah line of page 2: الٓمٓ ① ذَٰلِكَ ٱلْكِتَٰبُ … هُدًى — 2:1 and the start of 2:2.
  // The line's press target: the one with the line's long-press delay.
  const firstLine = () =>
    root.root.findAll(n => typeof n.props.onPress === 'function' && n.props.delayLongPress === 280)[0];
  const width = () => (firstLine().props.style as { width: number }).width;

  it('opens Al-Baqarah 1 at the right end of the line, where it is drawn', () => {
    act(() => firstLine().props.onPress(webClick(width() - 4, { left: 0, width: width() })));
    expect(pressed.map(w => `${w.surah}:${w.ayah}`)).toEqual(['2:1']);
  });

  it('opens Al-Baqarah 2 at the left end', () => {
    act(() => firstLine().props.onPress(webClick(4, { left: 0, width: width() })));
    expect(pressed.map(w => `${w.surah}:${w.ayah}`)).toEqual(['2:2']);
  });

  it('opens nothing — not the line’s last ayah — when the press carries no point', () => {
    act(() => firstLine().props.onPress({ nativeEvent: { pageX: 0, pageY: 0 } } as never));
    expect(pressed).toEqual([]);
  });
});
