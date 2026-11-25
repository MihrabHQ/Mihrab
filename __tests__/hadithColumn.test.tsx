/**
 * The Hadith screens laid out on a phone.
 *
 * `CenteredColumn` drops its `innerStyle` on a phone (there is no inner
 * column to give it to), and every Hadith screen kept its padding, its
 * gaps and its row direction there. On the Pixel 10 Pro, 2026-11-25: the
 * reader's six buttons stacked in a column a third of the screen tall, the
 * hadith ran to both edges of the glass, a list's description was cut off
 * under the title bar, and search results began off the screen's edge.
 * Wide windows were right, which is how it shipped to a test build.
 *
 * `Column` gives one style to whichever view holds the children. This
 * holds that at both widths, and that no Hadith screen goes back to
 * `innerStyle`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';

const mockWindow = { width: 412, height: 915 };
jest.mock('../src/responsive/windowSize', () => ({
  useWindowSize: () => mockWindow,
}));

import { Column } from '../src/screens/hadith/Column';

const BAR = { flexDirection: 'row' as const, justifyContent: 'space-around' as const, paddingHorizontal: 8 };

function render(width: number, node: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  mockWindow.width = width;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(node);
  });
  return tree;
}

/** The style of the view the children sit directly in. */
function holderStyle(tree: ReactTestRenderer.ReactTestRenderer) {
  const child = tree.root.findByProps({ testID: 'child' });
  let holder = child.parent;
  while (holder && holder.type !== View) holder = holder.parent;
  return StyleSheet.flatten(holder!.props.style) ?? {};
}

describe('Column', () => {
  it('lays its children out with the style on a phone', () => {
    const tree = render(412, (
      <Column style={BAR}>
        <Text testID="child">x</Text>
      </Column>
    ));
    expect(holderStyle(tree)).toMatchObject(BAR);
  });

  it('lays them out the same way in a wide window, inside the capped column', () => {
    const tree = render(1280, (
      <Column style={BAR}>
        <Text testID="child">x</Text>
      </Column>
    ));
    const style = holderStyle(tree);
    expect(style).toMatchObject(BAR);
    expect(style.maxWidth).toBeGreaterThan(0);
  });

  it('keeps the band\'s own style on the full-width view at both widths', () => {
    const band = { paddingTop: 40, backgroundColor: 'rgb(1, 2, 3)' };
    for (const width of [412, 1280]) {
      const tree = render(width, (
        <Column outer={band} style={BAR}>
          <Text testID="child">x</Text>
        </Column>
      ));
      const views = tree.root.findAllByType(View);
      const outermost = StyleSheet.flatten(views[0].props.style) ?? {};
      expect(outermost).toMatchObject(band);
    }
  });
});

describe('the Hadith screens', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', p), 'utf8');
  const screens = ['HadithScreen.tsx', 'hadith/HadithListScreen.tsx', 'hadith/HadithReaderScreen.tsx', 'hadith/PackGate.tsx'];

  it('never hand a layout to innerStyle, which a phone drops', () => {
    for (const file of screens) {
      expect(`${file}: ${/innerStyle=/.test(read(file))}`).toBe(`${file}: false`);
    }
  });

  it("put the reader's buttons in a row, through Column", () => {
    const reader = read('hadith/HadithReaderScreen.tsx');
    expect(reader).toContain('<Column style={styles.barInner}>');
    expect(reader).toMatch(/barInner: \{ flexDirection: 'row'/);
    expect(reader).toContain('<Column style={styles.page}>');
    expect(reader).toMatch(/page: \{ paddingHorizontal: SPACING\.lg/);
  });

  it('pad the tab and a list through Column', () => {
    expect(read('HadithScreen.tsx')).toContain('<Column style={styles.page}>');
    expect(read('hadith/HadithListScreen.tsx')).toContain('<Column style={styles.headInner}>');
  });
});
