// Notification delivery, end to end: a trigger scheduled a few seconds
// ahead must be shown by the system and reported to the page (where the
// adhan plays), the app's own prayer triggers must be on the books, and a
// repeating trigger must move to its next time rather than vanish.
module.exports = async ({ page, app, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  await page.waitForTimeout(Number(process.env.MIHRAB_SETTLE_MS || 15000));

  const env = await app.evaluate(({ Notification }) => ({
    supported: Notification.isSupported(),
    platform: process.platform,
  }));
  log('system', JSON.stringify(env));
  if (!env.supported) errors.push('Notification.isSupported() is false');

  // What the app itself scheduled: the day's prayers.
  const own = await page.evaluate(() => window.mihrabDesktop.notifications.triggers());
  const upcoming = own.filter(t => t.trigger.timestamp > Date.now());
  log('app triggers', own.length, 'upcoming', upcoming.length,
    upcoming.slice(0, 3).map(t => `${t.notification.title} @ ${new Date(t.trigger.timestamp).toLocaleTimeString()}`).join(' | '));
  // A fresh profile (CI) has no location yet, so nothing of its own.
  if (!upcoming.length && !process.env.MIHRAB_NOTIFY_FRESH) errors.push('the app has no upcoming notifications scheduled');

  // One of our own, due in 3 s, and a daily one due in 3 s.
  const result = await page.evaluate(async () => {
    const n = window.mihrabDesktop.notifications;
    const seen = [];
    const off = n.onEvent(e => seen.push({ type: e.type, id: e.detail?.notification?.id, sound: e.sound }));
    const at = Date.now() + 3000;
    await n.createTrigger({ id: 'probe-once', title: 'Mihrab test', body: 'Delivery check (once)' }, { type: 0, timestamp: at });
    await n.createTrigger({ id: 'probe-daily', title: 'Mihrab test', body: 'Delivery check (daily)', android: { sound: 'adhan_makkah' } }, { type: 0, timestamp: at, repeatFrequency: 1 });
    // The tick is 15 s; give it two.
    await new Promise(r => setTimeout(r, 33000));
    off();
    const left = await n.triggers();
    const daily = left.find(t => t.notification.id === 'probe-daily');
    await n.cancelTriggers(['probe-daily']);
    await n.cancelDisplayed(['probe-once', 'probe-daily']);
    return { seen, onceLeft: left.some(t => t.notification.id === 'probe-once'), dailyNext: daily && daily.trigger.timestamp - at };
  });
  log('events', JSON.stringify(result));
  const delivered = id => result.seen.some(e => e.type === 3 && e.id === id);
  if (!delivered('probe-once')) errors.push('the one-off trigger was not delivered');
  if (!delivered('probe-daily')) errors.push('the daily trigger was not delivered');
  if (result.onceLeft) errors.push('the one-off trigger is still on the books after firing');
  if (result.dailyNext !== 86_400_000) errors.push(`the daily trigger moved by ${result.dailyNext} ms, not a day`);
  const adhan = result.seen.find(e => e.id === 'probe-daily' && e.type === 3);
  if (adhan && adhan.sound !== 'adhan_makkah') errors.push(`the page was told sound ${adhan.sound}, not the adhan`);

  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
