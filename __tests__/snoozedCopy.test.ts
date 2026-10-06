import i18n from '../src/i18n';
import { snoozedCopy } from '../src/notifications/notificationActions';

describe('snoozed prayer alert wording', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('re-fires the call to prayer with different wording, naming the prayer', () => {
    const out = snoozedCopy('Dhuhr', 'It is time for Dhuhr', {
      kind: 'prayer_time',
      prayer: 'Dhuhr',
    });
    expect(out.title).not.toBe('Dhuhr');
    expect(out.body).not.toBe('It is time for Dhuhr');
    expect(out.title).toContain('Dhuhr');
    expect(out.body).toContain('Dhuhr');
  });

  it('leaves other notices exactly as they were', () => {
    expect(
      snoozedCopy('Asr', 'Starts in 15 min', { kind: 'pre_prayer', prayer: 'Asr' }),
    ).toEqual({ title: 'Asr', body: 'Starts in 15 min' });
  });

  it('keeps the original text when the payload has no prayer', () => {
    expect(snoozedCopy('Fajr', 'x', { kind: 'prayer_time' })).toEqual({
      title: 'Fajr',
      body: 'x',
    });
  });
});
