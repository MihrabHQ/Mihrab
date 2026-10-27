/**
 * Home's practice card draws the Log's graph — the strip, a row a prayer —
 * not the grid of one square a day, which went from the app.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      accent: '#2E7D5B',
      accentSolid: '#2E7D5B',
      text: '#111111',
      textSolid: '#111111',
      muted: '#777777',
      danger: '#B3261E',
      border: '#DDDDDD',
      card: '#FFFFFF',
      bg: '#FFFFFF',
      isDark: false,
    },
    isDark: false,
  }),
}));
jest.mock('../src/practice/practiceStore', () => {
  const actual = jest.requireActual('../src/practice/practiceStore');
  return {
    ...actual,
    usePracticeHistory: () => ({
      journal: [{ date: '2026-10-26', prayer: 'Fajr', status: 'on-time', loggedAt: '2026-10-26T05:00:00.000Z' }],
      fasts: [],
      sunnah: {},
    }),
  };
});

describe('the practice card on Home', () => {
  it('is the strip, a row a prayer', async () => {
    const { PracticeCard } = require('../src/screens/home/PracticeCard');
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<PracticeCard />);
    });
    // The strip is the one element handed `days` (a grid took `rows`).
    const strips = tree.root.findAll(n => Array.isArray(n.props?.days), { deep: true });
    expect(strips.length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => Array.isArray(n.props?.rows))).toHaveLength(0);
    const days = strips[0].props.days as Array<{ key: string }>;
    expect(days.length).toBeGreaterThanOrEqual(13 * 7 - 6);
    expect(days.some(d => d.key === '2026-10-26')).toBe(true);
    await act(async () => tree.unmount());
  });
});
