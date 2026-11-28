/**
 * The minimal Today's sheet carries the Mālikī second times and the bells
 * (TodayTimesSheet, `DayRows`; fed by `sheetRows` in TodayCard).
 *
 * Only Fajr's, ʿAṣr's and Ishāʾ's: Ẓuhr's boundary is ʿAṣr's row and
 * Maghrib's is Ishāʾ's. Fajr's leads the line Sunrise is on; the other two
 * sit on their prayer's own row.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Animated } from 'react-native';
import { TodayTimesSheet, type TimesSheetRow } from '../src/screens/home/TodayTimesSheet';

jest.mock('../src/screens/home/MinimalSheet', () => ({
  MinimalSheet: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: { text: '#fff', muted: '#aaa', accentSolid: '#0f0', card: '#000', border: '#333', textSolid: '#fff', accent: '#0f0' },
    isDark: true,
  }),
}));

const cycled: string[] = [];
const bell = (key: string) => ({ mode: 'notification' as const, onCycle: () => cycled.push(key), emphasised: false });
const row = (key: string, extra: Partial<TimesSheetRow> = {}): TimesSheetRow => ({
  key,
  name: key,
  time: '00:00',
  secondary: key === 'Sunrise',
  lit: false,
  ...extra,
});

async function sheet(rows: TimesSheetRow[]): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <TodayTimesSheet visible progress={new Animated.Value(1)} onClose={() => {}} title="Today" rows={rows} isToday onBackToToday={() => {}} />,
    );
  });
  return root;
}
const byId = (root: ReactTestRenderer, id: string) => root.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
// The bells, once each: the control's own props, on the node that takes the mode.
const bellsOf = (root: ReactTestRenderer) => {
  const seen = new Set<string>();
  return root.root
    .findAll(n => typeof n.props.prayerLabel === 'string' && typeof n.props.mode === 'string')
    .filter(n => (seen.has(n.props.prayerLabel) ? false : (seen.add(n.props.prayerLabel), true)));
};
const flat = (c: unknown): string => (Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' ? c : '');

describe('second times and bells on the minimal sheet', () => {
  const rows = [
    row('Fajr', { alert: bell('Fajr') }),
    row('Sunrise', { alert: bell('Sunrise'), lead: { text: '1st to ~06:16', label: 'Fajr, first time until approx. 06:16' } }),
    row('Dhuhr', { alert: bell('Dhuhr') }),
    row('Asr', { alert: bell('Asr'), tag: { text: '1st to ~17:10', label: 'Asr, first time until approx. 17:10' } }),
    row('Maghrib', { alert: bell('Maghrib') }),
    row('Isha', { alert: bell('Isha'), tag: { text: '1st to 21:31', label: 'Isha, first time until 21:31' } }),
  ];

  it("puts Fajr's first on Sunrise's line, and ʿAṣr's and Ishāʾ's on their own rows", async () => {
    const root = await sheet(rows);
    const lead = byId(root, 'sheet-lead');
    expect(lead).toHaveLength(1);
    expect(flat(lead[0].props.children)).toContain('06:16');
    expect(lead[0].props.accessibilityLabel).toBe('Fajr, first time until approx. 06:16');
    // On Sunrise's line, and before Sunrise on it.
    const line = byId(root, 'sheet-extra-times')[0];
    const texts = line.findAll(n => (n.type as unknown) === 'Text').map(n => flat(n.props.children));
    const at = (needle: string) => texts.findIndex(text => text.includes(needle));
    expect(at('06:16')).toBeGreaterThanOrEqual(0);
    expect(at('06:16')).toBeLessThan(at('Sunrise'));
    expect(byId(root, 'sheet-tag-Asr')).toHaveLength(1);
    expect(byId(root, 'sheet-tag-Isha')).toHaveLength(1);
    for (const key of ['Fajr', 'Dhuhr', 'Maghrib']) expect(byId(root, `sheet-tag-${key}`)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it('gives every time its bell, and the tap to the row it is on', async () => {
    const root = await sheet(rows);
    const bells = bellsOf(root);
    expect(bells.map(b => b.props.prayerLabel)).toEqual(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    cycled.length = 0;
    bells[3].props.onPress();
    expect(cycled).toEqual(['Asr']);
    await act(async () => root.unmount());
  });

  it('shows neither where the rows carry none (another day, the setting off)', async () => {
    const root = await sheet(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(key => row(key)));
    expect(bellsOf(root)).toHaveLength(0);
    expect(byId(root, 'sheet-lead')).toHaveLength(0);
    expect(byId(root, 'sheet-tag-Asr')).toHaveLength(0);
    await act(async () => root.unmount());
  });
});

describe('what the sheet is fed', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/screens/home/TodayCard.tsx'),
    'utf8',
  ) as string;

  it("tags ʿAṣr and Ishāʾ, leads Sunrise with Fajr's, and never Ẓuhr or Maghrib", () => {
    expect(src).toMatch(/const secondTime = \(key: 'Fajr' \| 'Asr' \| 'Isha'\) =>/);
    expect(src).toMatch(/tag: key === 'Asr' \|\| key === 'Isha' \? secondTime\(key\) : key === 'Fajr' && !sunriseShown \? fajrTime : undefined,/);
    expect(src).toMatch(/lead: key === 'Sunrise' \? fajrTime : undefined,/);
  });
});
