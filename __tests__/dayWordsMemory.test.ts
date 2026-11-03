import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _resetDayWordsForTests,
  primeDayWords,
  rememberDayWord,
  rememberedDayWord,
} from '../src/screens/home/dayWordsMemory';

const KEY = '@mihrab/dayWords/v1';

beforeEach(async () => {
  jest.useFakeTimers();
  _resetDayWordsForTests();
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

describe('the day bar’s words, remembered', () => {
  it('opens on the kept words, and knows nothing it was not told', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ 'weekday|sv|2026-10-3': 'tisdag', bad: 7 }));
    await primeDayWords();
    expect(rememberedDayWord('weekday|sv|2026-10-3')).toBe('tisdag');
    expect(rememberedDayWord('bad')).toBeUndefined();
    expect(rememberedDayWord('date|sv|2026-10-3')).toBeUndefined();
  });

  it('keeps a new word a breath later, and keeps only the latest forty-eight', async () => {
    await primeDayWords();
    for (let i = 0; i < 60; i += 1) rememberDayWord(`weekday|en|2026-0-${i}`, `day ${i}`);
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) as string) as Record<string, string>;
    expect(Object.keys(stored)).toHaveLength(48);
    expect(stored['weekday|en|2026-0-59']).toBe('day 59');
    expect(stored['weekday|en|2026-0-0']).toBeUndefined();
  });

  it('survives an unreadable record', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    await expect(primeDayWords()).resolves.toBeUndefined();
    expect(rememberedDayWord('x')).toBeUndefined();
  });
});
