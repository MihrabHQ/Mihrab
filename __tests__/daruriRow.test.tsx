/**
 * What the Today card actually says about a second time — issue #19.
 *
 * The row is the only surface these boundaries reach, so this is where
 * the two promises made in the issue thread are kept: that the modelled
 * ones are not printed in the same confident type as the computed ones,
 * and that a boundary the sky does not produce leaves the row exactly as
 * it was rather than showing a guess.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentBg: '#E7F0EB',
      accentSolid: '#0F5132',
      controlBg: '#EEEEEE',
    },
  }),
}));

jest.mock('../src/hooks/useClockFormatter', () => {
  const { makeClockFormatter } = require('../src/utils/clockFormat');
  const formatter = makeClockFormatter(false, 'en');
  return {
    useClockFormatter: () => formatter,
    useSystemIs24Hour: () => true,
  };
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'prayer.firstTimeUntil') {
        return `First time until ${(vars as { time: string }).time}`;
      }
      if (key === 'prayer.secondTimeUntil') {
        return `Second time until ${(vars as { time: string }).time}`;
      }
      if (key === 'prayer.firstTimeShort') return `1st to ${(vars as { time: string }).time}`;
      if (key === 'prayer.secondTimeShort') return `2nd to ${(vars as { time: string }).time}`;
      if (key === 'prayer.approx') return 'approx.';
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

import { PrayerRow } from '../src/screens/home/PrayerRow';
import { ExtraTimesStrip } from '../src/screens/home/ExtraTimesStrip';
import fs from 'fs';
import path from 'path';

/** Every run of text the row actually put on screen, in order. */
function render(props: Record<string, unknown>): string[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <PrayerRow
        prayerKey="Asr"
        rawTime="17:04"
        isNext={false}
        isSecondary={false}
        isLast={false}
        {...props}
      />,
    );
  });
  // A <Text> with an interpolated string renders as adjacent runs, so
  // each element's own string children are joined — that way an assertion
  // can name a whole line rather than its fragments.
  const joined: string[] = [];
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const n = node as { children?: unknown[]; type?: string } | null;
    if (!n || !n.children) return;
    const own = n.children.filter(c => typeof c === 'string') as string[];
    // The clock rides in a first-strong isolate so it keeps its own
    // direction in an Arabic line; the marks are not what is read.
    if (own.length > 0) joined.push(own.join('').replace(/[\u2068\u2069]/g, ''));
    const label = (n as { props?: { accessibilityLabel?: string } }).props?.accessibilityLabel;
    if (label) joined.push(`a11y: ${label}`);
    n.children.forEach(collect);
  };
  collect(tree.toJSON());
  return joined;
}

describe('the second-time line', () => {
  it('is absent when the feature is off', () => {
    const lines = render({});
    expect(lines).toContain('17:04');
    expect(lines.some(l => l.includes('First time until') || l.includes('1st to'))).toBe(false);
  });

  it('says when the preferred window closes', () => {
    const lines = render({ daruriAt: '19:44' });
    expect(lines).toContain('1st to 19:44');
    // The whole sentence is what a screen reader says.
    expect(lines).toContain('a11y: First time until 19:44');
  });

  /**
   * "The sun has a deep yellow view" is not a solar position, and a row
   * that printed it to the minute alongside the shadow boundary would be
   * claiming more than the app knows.
   */
  it('marks a modelled boundary as approximate', () => {
    const lines = render({ daruriAt: '19:44', daruriApprox: true });
    expect(lines).toContain('1st to ~19:44');
    expect(lines).toContain('a11y: First time until approx. 19:44');
  });

  /**
   * Issue #38 (2): once the preferred window has closed, the line turns
   * to the second window's end rather than staying on a boundary that is
   * already behind the reader.
   */
  it('says when the second window closes, once the first has', () => {
    const lines = render({ daruriAt: '04:30', daruriPhase: 'second' });
    expect(lines).toContain('2nd to 04:30');
    expect(lines.some(l => l.includes('First time') || l.includes('1st'))).toBe(false);
  });

  it('leaves the row alone where the sky produced no boundary', () => {
    // What `daruriTimesForDay` returns in Malmö in June: nothing.
    const lines = render({ daruriAt: undefined, daruriApprox: true });
    expect(lines.some(l => l.includes('First time until') || l.includes('1st to'))).toBe(false);
  });

  it('formats it the way the user reads a clock', () => {
    const hook = require('../src/hooks/useClockFormatter');
    const { makeClockFormatter } = require('../src/utils/clockFormat');
    const twelve = makeClockFormatter(true, 'en');
    const spy = jest
      .spyOn(hook, 'useClockFormatter')
      .mockReturnValue(twelve);
    try {
      expect(render({ daruriAt: '19:44' })).toContain('1st to 7:44 PM');
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * Beside the name when it fits, under it when it does not — and "does not
 * fit" is a tag a whole line down, not one resting a few points below the
 * top of the line it shares with a taller name.
 */
describe('where the tag sits', () => {
  const { WRAPPED_FROM } = require('../src/screens/home/PrayerRow');
  const layoutAt = (y: number) => {
    const onWrap = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <PrayerRow prayerKey="Asr" rawTime="17:04" isNext={false} isSecondary={false} isLast={false} daruriAt="19:44" onDaruriWrap={onWrap} />,
      );
    });
    const tag = tree.root.findAll(n => n.props.testID === 'daruri-Asr' && typeof n.props.onLayout === 'function')[0];
    act(() => tag.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 80, height: 13 } } }));
    return onWrap;
  };

  it('centred on the name’s line is not wrapped, at any density’s rounding', () => {
    for (const y of [3.6, 4.2, 5.3, 6]) expect(layoutAt(y)).not.toHaveBeenCalled();
    expect(WRAPPED_FROM).toBeGreaterThan(12);
  });

  it('a line down is', () => {
    expect(layoutAt(24)).toHaveBeenCalled();
    expect(layoutAt(30)).toHaveBeenCalled();
  });
});

/**
 * The Ḥanafī conflict, which is the one place this feature can make a
 * card contradict itself.
 *
 * Ẓuhr's ḍarūrī boundary is the 1:1 shadow whatever the app's ʿAṣr
 * setting says — it has to be, it is a Mālikī boundary. On Ḥanafī ʿAṣr
 * that lands roughly half an hour before the ʿAṣr drawn on the row
 * underneath it. Nothing is wrong with either number; they are two
 * madhāhib in one table. But it reads as a bug unless somebody says so,
 * and the place to say it is beside the switch, before it is touched.
 */
describe('the boundary a Hanafi user would find surprising', () => {
  const { solarDaruriBoundaries } = require('../src/prayer/daruriTimes');
  const adhan = jest.requireActual('adhan');

  it('sits well before the Hanafi Asr on the row below it', () => {
    const at = new Date(2026, 8, 4, 12, 0, 0);
    const boundary = solarDaruriBoundaries(at, 33.5731, -7.5898).DhuhrDaruri;

    const params = adhan.CalculationMethod.Other();
    params.fajrAngle = 19;
    params.ishaAngle = 17;
    params.madhab = adhan.Madhab.Hanafi;
    const hanafi = new adhan.PrayerTimes(
      new (require('adhan/lib/cjs/Coordinates').default)(33.5731, -7.5898),
      at,
      params,
    );
    const asrMinutes = hanafi.asr.getHours() * 60 + hanafi.asr.getMinutes();
    const [h, m] = boundary.split(':').map(Number);

    // Not a rounding difference — a whole madhhab apart. Wrap-aware, so
    // a runner whose zone puts the Moroccan afternoon across local
    // midnight (UTC+8:45 does) measures the same gap.
    expect((asrMinutes - (h * 60 + m) + 1440) % 1440).toBeGreaterThan(20);
  });
});

describe("Fajr's tag on Sunrise's strip, where the tags have left the names' line", () => {
  it('leaves the row one line tall: no tag under the name', () => {
    const below = render({ prayerKey: 'Fajr', daruriAt: '07:18', daruriBelow: true });
    expect(below).toContain('1st to 07:18');
    const moved = render({ prayerKey: 'Fajr', daruriAt: '07:18', daruriBelow: true, daruriInStrip: true });
    expect(moved.some(l => l.includes('1st to'))).toBe(false);
    // Beside the name, while it fits, nothing moves.
    expect(render({ prayerKey: 'Fajr', daruriAt: '07:18', daruriInStrip: true })).toContain('1st to 07:18');
  });

  it('is on the strip before Sunrise, read with the prayer it belongs to', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <ExtraTimesStrip
          lead={{ prayerKey: 'Fajr', text: '1st to ~07:18', label: 'Fajr, First time until approx. 07:18' }}
          items={[{ key: 'Sunrise', name: 'Sunrise', time: '08:01' }]}
        />,
      );
    });
    const flat = JSON.stringify(tree.toJSON());
    expect(flat.indexOf('1st to ~07:18')).toBeGreaterThan(-1);
    expect(flat.indexOf('1st to ~07:18')).toBeLessThan(flat.indexOf('08:01'));
    expect(tree.root.findByProps({ testID: 'daruri-Fajr' }).props.accessibilityLabel).toBe(
      'Fajr, First time until approx. 07:18',
    );
  });

  it("is Fajr's alone, and only over a strip that holds Sunrise", () => {
    const card = fs.readFileSync(path.join(__dirname, '..', 'src/screens/home/TodayCard.tsx'), 'utf-8');
    expect(card).toMatch(/key === 'Fajr' &&\s+groups\[at \+ 1\]\?\.kind === 'strip' &&[\s\S]{0,90}keys\.includes\('Sunrise'\)/);
    expect(card).toContain('fajrTag && fajrTagInStrip(index - 1)');
  });
});
