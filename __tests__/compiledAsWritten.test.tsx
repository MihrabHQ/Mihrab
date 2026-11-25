/**
 * The canary of `tools/compiler-differential.js`.
 *
 * That tool holds every render test to the same output compiled and as
 * written, and what gives it its reach is THE SHAKE its recorder gives each
 * tree at the end (jest/differential.js): the clock a day on, the text size
 * changed, a render from the top. A shake that silently did nothing would
 * leave the tool comparing two identical recordings of nothing much, and
 * passing for ever.
 *
 * So this component reads the clock and the text size while rendering — as
 * no compiled component may — and the tool refuses to pass unless the shake
 * changed what it draws. Here, in an ordinary run, it only renders.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { PixelRatio, Text } from 'react-native';

function Canary() {
  return <Text>{`${new Date().toISOString().slice(0, 10)} · ${PixelRatio.getFontScale()}`}</Text>;
}

it('canary: reads the clock and the text size while rendering', async () => {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<Canary />);
  });
  expect(JSON.stringify(root.toJSON())).toMatch(/\d{4}-\d\d-\d\d · /);
});
