// A trigger 20s out with an adhan sound: does main fire it, does the page
// hear it, and does the sound file load?
module.exports = async ({ page, log }) => {
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const d = window.mihrabDesktop;
    window.__events = [];
    d.notifications.onEvent(e => window.__events.push({ type: e.type, sound: e.sound, id: e.detail?.notification?.id }));
    const url = d.fs.fileUrl(`${d.fs.dirs.bundle}/sounds/adhan_makkah.mp3`);
    const res = await fetch(url);
    const id = await d.notifications.createTrigger(
      { id: 'test-adhan', title: 'Dhuhr', body: 'It is time for Dhuhr', android: { sound: 'adhan_makkah' }, ios: { sound: 'adhan_makkah.caf' } },
      { type: 0, timestamp: Date.now() + 20000 },
    );
    return { status: res.status, bytes: (await res.arrayBuffer()).byteLength, id };
  });
  log('sound fetch', r);
  await page.waitForTimeout(40000);
  log('events', JSON.stringify(await page.evaluate(() => window.__events)));
  log('pending', JSON.stringify(await page.evaluate(() => window.mihrabDesktop.notifications.triggers().then(t => t.map(x => x.notification.id)))));
};
