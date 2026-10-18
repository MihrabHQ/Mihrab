import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { useLandscapeFullscreen } from '../src/quran/landscapeFullscreen';

/** A reader: holds fullscreen, asks for it the way the screen does. */
function setup(landscape: boolean, full = false) {
  const asked: boolean[] = [];
  let state = full;
  let tree!: ReturnType<typeof create>;
  function Reader({ land }: { land: boolean }) {
    const [f, setF] = React.useState(state);
    state = f;
    useLandscapeFullscreen(land, f, next => {
      const v = next ?? !f;
      asked.push(v);
      setF(v);
    });
    return null;
  }
  act(() => {
    tree = create(<Reader land={landscape} />);
  });
  return {
    asked,
    full: () => state,
    turn: (land: boolean) =>
      act(() => {
        tree.update(<Reader land={land} />);
      }),
  };
}

describe('landscape defaults to fullscreen', () => {
  it('goes fullscreen when turned on its side, and back to windowed upright', () => {
    const r = setup(false);
    expect(r.full()).toBe(false);
    r.turn(true);
    expect(r.full()).toBe(true);
    r.turn(false);
    expect(r.full()).toBe(false);
  });

  it('keeps upright fullscreen if it was fullscreen', () => {
    const r = setup(false, true);
    r.turn(true);
    expect(r.full()).toBe(true);
    expect(r.asked).toEqual([]);
    r.turn(false);
    expect(r.full()).toBe(true);
  });

  it('opens fullscreen when the reader opens on its side', () => {
    const r = setup(true);
    expect(r.full()).toBe(true);
    r.turn(false);
    expect(r.full()).toBe(false);
  });

  it('does nothing without a turn', () => {
    const r = setup(false);
    r.turn(false);
    r.turn(false);
    expect(r.asked).toEqual([]);
  });
});
