/**
 * The Android Live Activity, 2026-11-11:
 *  - the card says why when Android is not showing it (notifications off,
 *    or "Live Updates" off for the app) and offers the system page;
 *  - the countdown card on Android 17, which the system ticks, is no
 *    longer re-posted every minute the screen is on;
 *  - promotion and the chip's text are called directly, not found by
 *    walking Notification.Builder's methods on every post.
 * The chip and the always-on display depend on the card staying a
 * standard, uncolorized, promoted template: those are pinned here too.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const kt = (f: string) =>
  fs.readFileSync(path.join(root, 'android/app/src/main/java/com/prayer_times', f), 'utf8');
const moduleSrc = kt('MihrabLiveActivityModule.kt');
const serviceSrc = kt('MihrabLiveActivityService.kt');
const card = fs.readFileSync(path.join(root, 'src/screens/settings/LiveActivityCard.tsx'), 'utf8');
const native = fs.readFileSync(path.join(root, 'src/native/MihrabLiveActivity.ts'), 'utf8');

describe('what keeps the chip and the always-on display', () => {
  it('requests promotion on both builders, unless hidden from the lock screen', () => {
    // By one reflected method, looked up once: a direct call does not compile
    // on the android-36 platform F-Droid builds against (#131). Not the old
    // walk over every Builder method on each post.
    expect(moduleSrc).toMatch(/getMethod\("setRequestPromotedOngoing", Boolean::class\.javaPrimitiveType\)/);
    expect(moduleSrc).toContain('method.invoke(builder, true)');
    expect(moduleSrc).not.toContain('builder.setRequestPromotedOngoing(');
    expect(moduleSrc).toContain('if (!aodHidden) tryRequestPromotedOngoing(builder)');
    expect(moduleSrc.match(/tryRequestPromotedOngoing\(builder\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(moduleSrc).not.toContain('Notification.Builder::class.java.methods');
  });

  it('never colorizes and never attaches a custom view to the promoted card', () => {
    expect(moduleSrc.match(/\.setColorized\(false\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(moduleSrc).not.toContain('.setColorized(true)');
    const promoted = moduleSrc.slice(moduleSrc.indexOf('private fun buildAndroid16('), moduleSrc.indexOf('private fun buildLegacy('));
    expect(promoted).not.toMatch(/setCustom(Content|BigContent|HeadsUpContent)View/);
  });

  it('still draws the always-on display from text re-posted at each change', () => {
    expect(serviceSrc).toContain('o.put("ambient", !screenOn)');
    expect(serviceSrc).toContain('private fun scheduleMinuteAlarm()');
    expect(moduleSrc).toContain('ambientText = if (ambient) countdown else null');
  });
});

describe('the card that keeps itself current', () => {
  it('is marked by the builder only when the system ticks it and the screen is on', () => {
    expect(moduleSrc).toMatch(/if \(systemTicked && !ambient\) \{\s*builder\.addExtras\(android\.os\.Bundle\(\)\.apply \{ putBoolean\(EXTRA_SELF_TICKING, true\) \}\)/);
  });

  it('waits for the next change instead of a minute, within a cap', () => {
    const fn = serviceSrc.slice(serviceSrc.indexOf('private fun tickDelay()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body).toContain('if (!selfTicking) return TICK_MS');
    expect(body).toContain('next + 1000L');
    expect(body).toContain('prev + ARRIVED_MS + 500L');
    expect(body).toContain('coerceIn(1000L, SELF_TICKING_MAX_MS)');
    expect(serviceSrc).not.toContain('handler.postDelayed(next, TICK_MS)');
  });

  it('is told when the clock or its zone moves', () => {
    expect(serviceSrc).toContain('addAction(Intent.ACTION_TIMEZONE_CHANGED)');
    expect(serviceSrc).toContain('addAction(Intent.ACTION_TIME_CHANGED)');
  });
});

describe('the chip in the "Now" moment', () => {
  it('says the same word as the card', () => {
    expect(moduleSrc).toContain('val chipText = if (arrivedTitle != null) nowWord else shortText');
    const a17 = moduleSrc.slice(moduleSrc.indexOf('private fun buildAndroid17('), moduleSrc.indexOf('private fun appLabel('));
    expect(a17).not.toContain('tryAttachShortCriticalText(builder, shortText)');
  });
});

describe('when Android is not showing the card', () => {
  it('tells the two reasons apart, notifications first', () => {
    const fn = native.slice(native.indexOf('export async function liveUpdateBlock'));
    expect(fn.indexOf("return 'notifications'")).toBeGreaterThan(0);
    expect(fn.indexOf("return 'notifications'")).toBeLessThan(fn.indexOf("'promotion'"));
  });

  it('asks again whenever the app comes back to the front', () => {
    expect(card).toMatch(/AppState\.addEventListener\('change', state => \{\s*if \(state === 'active'\) ask\(\);/);
    expect(card).toContain('testID="live-updates-blocked"');
  });

  it('opens the page that fixes the one that is off', () => {
    const fn = moduleSrc.slice(moduleSrc.indexOf('fun openPromotionSettings('));
    expect(fn.slice(0, 1400)).toContain('val opened = notificationsOn && Build.VERSION.SDK_INT >= 36');
  });

  it('has its words in every language', () => {
    const dir = path.join(root, 'src/i18n/locales');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const st = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).settings;
      for (const k of ['laBlockedTitle', 'laBlockedAction', 'laBlockedHelp', 'laNoNotifTitle', 'laNoNotifHelp']) {
        expect(typeof st[k]).toBe('string');
      }
    }
  });
});
