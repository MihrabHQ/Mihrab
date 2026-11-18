/**
 * #134: Notifee builds a channel from what it is given, and a channel with
 * no `sound` is SILENT (`NotificationChannel.setSound(null, null)`), not on
 * the phone's own tone. Channels that meant "the default notification
 * sound" left it out and were silent on every fresh install.
 *
 * So every channel the app makes says what it sounds like: `SYSTEM_TONE`,
 * an adhan's own sound, or `undefined` — silence, written down, and only
 * where silence is the point.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Each `createChannel({ … })` literal in the app, with where it is. */
function channelLiterals(): { where: string; body: string }[] {
  const out: { where: string; body: string }[] = [];
  for (const file of files(SRC)) {
    const src = readFileSync(file, 'utf8');
    let at = src.indexOf('createChannel({');
    while (at !== -1) {
      let i = src.indexOf('{', at);
      const start = i;
      let depth = 0;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
      }
      const line = src.slice(0, at).split('\n').length;
      out.push({ where: `${path.relative(SRC, file)}:${line}`, body: src.slice(start, i + 1) });
      at = src.indexOf('createChannel({', i);
    }
  }
  return out;
}

const SILENT_ON_PURPOSE = [
  'notifications/liveActivity.ts', // the countdown: the alert is the prayer's, not the card's
  'notifications/dhikrReminders.ts', // only its "(silent)" twin, at LOW importance
  'quran/downloadNotification.ts', // a progress bar
];

describe('every notification channel says what it sounds like (#134)', () => {
  const channels = channelLiterals();

  it('finds the channels', () => {
    expect(channels.length).toBeGreaterThanOrEqual(12);
  });

  it.each(channels.map(c => [c.where, c.body]))('%s names its sound', (_where, body) => {
    expect(body).toMatch(/\bsound:/);
  });

  it.each(channels.map(c => [c.where, c.body]))('%s is silent only where silence is the point', (where, body) => {
    if (!/\bsound:\s*undefined\b/.test(body)) return;
    expect(SILENT_ON_PURPOSE.some(f => where.startsWith(f))).toBe(true);
  });

  it('the reminders meant to sound use the phone’s own tone', () => {
    for (const f of [
      'ayahOfDay', 'duaReminders', 'endOfDayLog', 'fastingReminders',
      'hifzReminder', 'khatmahReminder', 'surahReminders',
    ]) {
      const c = channels.filter(x => x.where.startsWith(`notifications/${f}.ts`));
      expect(c).toHaveLength(1);
      expect(c[0].body).toMatch(/sound: SYSTEM_TONE/);
    }
    const dhikr = channels.filter(x => x.where.startsWith('notifications/dhikrReminders.ts'));
    expect(dhikr.map(d => /sound: SYSTEM_TONE/.test(d.body))).toEqual([true, false]);
  });
});
