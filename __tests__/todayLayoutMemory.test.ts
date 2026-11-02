import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _resetTodayLayoutForTests,
  primeTodayLayout,
  rememberTodayLayout,
  rememberedTodayLayout,
} from '../src/screens/home/todayLayoutMemory';

const KEY = '@mihrab/todayLayout/v1';

describe('the page\'s settled sizes', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    _resetTodayLayoutForTests();
    await AsyncStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('are kept under their key, merged piece by piece, and read back on the next launch', async () => {
    await primeTodayLayout();
    expect(rememberedTodayLayout('a')).toBeNull();
    rememberTodayLayout('a', { heroH: 320, topRowH: 36, block: { y: 180, h: 140 } });
    rememberTodayLayout('a', { table: 290 });
    expect(rememberedTodayLayout('a')).toEqual({ heroH: 320, topRowH: 36, block: { y: 180, h: 140 }, table: 290 });
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    const raw = await AsyncStorage.getItem(KEY);
    expect(JSON.parse(raw ?? '{}').a.table).toBe(290);
    // The next launch.
    _resetTodayLayoutForTests();
    expect(rememberedTodayLayout('a')).toBeNull();
    await primeTodayLayout();
    expect(rememberedTodayLayout('a')?.heroH).toBe(320);
    expect(rememberedTodayLayout('b')).toBeNull();
  });

  it('ignores what is not a size, and keeps only the last eight keys', async () => {
    await primeTodayLayout();
    rememberTodayLayout('x', { heroH: -1, table: Number.NaN } as never);
    expect(rememberedTodayLayout('x')).toBeNull();
    for (let i = 0; i < 10; i += 1) rememberTodayLayout(`k${i}`, { table: 100 + i });
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    const kept = Object.keys(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'));
    expect(kept).toHaveLength(8);
    expect(kept).not.toContain('k0');
    expect(kept).toContain('k9');
  });

  it('is primed with the settings and keyed by what the sizes depend on', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
    expect(read('src/context/PrayerSettingsContext.tsx')).toMatch(/Promise\.all\(\[loadSettings\(\), restoreSkyTheme\(\), primeTodayLayout\(\)\]\)/);
    const card = read('src/screens/home/TodayCard.tsx');
    for (const part of ["minimal ? 'minimal' : 'full'", 'currentFontScale().toFixed(2)', 'i18n.language', 'layoutRows.join', 'layoutInsets.top']) {
      expect(card).toContain(part);
    }
    expect(card).toMatch(/useState\(kept\?\.heroH \?\? 0\)/);
    expect(card).toMatch(/rememberTodayLayout\(layoutKey, \{ table: landedHeight \}\)/);
  });
});
