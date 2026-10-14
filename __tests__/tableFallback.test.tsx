/**
 * When the table in use has no row for today, the app says so — on the
 * provider row in Settings and in the month table's subtitle — instead of
 * computing the authority's method in silence.
 */
jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn(async () => ({ ok: false, status: 404 })) }));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useTableFallback } from '../src/hooks/useTableFallback';
import { isTableProvider } from '../src/prayer/prayerStorage';
import { jakimTable } from '../src/providers/nationalTables';
import fs from 'fs';
import path from 'path';

const KL = { latitude: 3.139, longitude: 101.6869 };

/** Mount the hook and wait until it has answered. */
async function answer(args: Parameters<typeof useTableFallback>): Promise<boolean | null> {
  let value: boolean | null = null;
  function Probe() {
    value = useTableFallback(...args);
    return null;
  }
  await act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  for (let i = 0; i < 20 && value === null; i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });
  }
  return value;
}

describe('the table-fallback indication', () => {
  it('knows which sources are tables', () => {
    for (const id of ['islamiska_forbundet', 'habous', 'marw', 'muis', 'jakim', 'kemenag', 'namazvakti'] as const) {
      expect(`${id} ${isTableProvider(id)}`).toBe(`${id} true`);
    }
    for (const id of ['aladhan', 'prayertimes_dev', 'local_adhan'] as const) {
      expect(`${id} ${isTableProvider(id)}`).toBe(`${id} false`);
    }
  });

  it('is off for a computed source, and on when the table has no row for today', async () => {
    expect(await answer(['aladhan', KL, 'auto', 0])).toBe(false);

    // JAKIM's seed covers today in a built checkout; past its last day the
    // phone stands in. A seed that is not built counts as past it too.
    const seed = jakimTable.config.seed;
    const covered = seed.version > 0 && seed.start <= new Date().toISOString().slice(0, 10);
    expect(await answer(['jakim', KL, 'auto', 0])).toBe(!covered);
    // Somewhere no table reaches, the table is not the answer either.
    expect(await answer(['jakim', { latitude: 59.33, longitude: 18.07 }, 'auto', 0])).toBe(true);
  });

  it('is wired into the settings row and the month subtitle', () => {
    const card = fs.readFileSync(path.join(__dirname, '../src/screens/settings/DataSourceCard.tsx'), 'utf8');
    const month = fs.readFileSync(path.join(__dirname, '../src/screens/month/MonthControls.tsx'), 'utf8');
    expect(card).toContain("t('settings.providerTableFallback'");
    expect(month).toContain("t('month.calculatedOnPhone')");
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/locales/en.json'), 'utf8'));
    expect(en.settings.providerTableFallback).toContain('{{picked}}');
    expect(en.month.calculatedOnPhone).toBeTruthy();
  });
});
