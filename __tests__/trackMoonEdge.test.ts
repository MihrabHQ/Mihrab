/** A moon at the chart's edge is drawn whole, not half off the screen. */
jest.mock('react-native-svg', () => ({}));
import { moonX } from '../src/screens/home/HeroTrack';
import { MOON } from '../src/screens/home/HeroSky';

describe('moonX', () => {
  it('keeps a moon clamped to either edge whole on the chart', () => {
    expect(moonX(0, 400)).toBe(MOON / 2);
    expect(moonX(1, 400)).toBe(400 - MOON / 2);
  });
  it('leaves a moon inside the chart where it is', () => {
    expect(moonX(0.5, 400)).toBe(200);
    expect(moonX(0.25, 1000)).toBe(250);
  });
});
