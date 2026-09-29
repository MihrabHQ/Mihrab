/**
 * The Android paths that start things from the background, and the ones
 * that must stop cleanly — none of which a JVM test can run, so their shape
 * is pinned here.
 *
 *   - A rebuild for times computed under another UTC offset is started from
 *     a redraw, which Android 8+ refuses outside a temp-allowlisted
 *     broadcast. It used to be marked "asked" before the start, so a refusal
 *     from APPWIDGET_UPDATE stopped every later, allowed wake-up from asking.
 *   - A zone or clock change now redraws every widget from its own receiver,
 *     rather than only when a Hijri card happened to be placed.
 *   - A Live Activity service started with startForegroundService and no
 *     payload never reached startForeground, and the system kills the app
 *     for that; turning the feature off while the service was not running
 *     left its wake alarm armed to do exactly that later.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const KT = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const read = (name: string) => readFileSync(path.join(KT, name), 'utf8');
/** Source with `//` comment lines dropped: a claim about code, not prose. */
const code = (s: string) =>
  s
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');

const source = code(read('WidgetPayloadSource.kt'));
const receiver = code(read('WidgetClockChangeReceiver.kt'));
const service = code(read('MihrabLiveActivityService.kt'));
const module = code(read('MihrabLiveActivityModule.kt'));
const widgetModule = code(read('PrayerWidgetModule.kt'));
const manifest = readFileSync(
  path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8',
);

describe('the rebuild for a stale offset', () => {
  const ask = source.slice(source.indexOf('private fun askForRebuildIfStale'));

  it('is marked asked only once a start is accepted', () => {
    expect(ask).toMatch(
      /if \(context\.startService\([^)]*\)\) != null\) \{\s*staleAskedFor = key/,
    );
    expect(ask.indexOf('staleAskedFor = key')).toBeGreaterThan(ask.indexOf('startService'));
  });

  it('treats a background refusal as "try again later", not as an error', () => {
    expect(ask).toMatch(/catch \(e: IllegalStateException\)/);
  });

  it('is throttled across processes', () => {
    expect(ask).toMatch(/now - prefs\.getLong\(PREFS_STALE_ASK_MS, 0L\) in 0 until STALE_ASK_MIN_INTERVAL_MS\) return/);
    expect(ask).toMatch(/putLong\(PREFS_STALE_ASK_MS, now\)/);
  });

  it('reads only the schema it knows', () => {
    expect(source).toMatch(/schemaVersion == WidgetContract\.VERSION/);
  });
});

describe('a zone or clock change', () => {
  it('has a receiver of its own for both broadcasts', () => {
    const entry = /<receiver\s+android:name="\.WidgetClockChangeReceiver"[\s\S]*?<\/receiver>/.exec(manifest);
    expect(entry).not.toBeNull();
    expect(entry![0]).toMatch(/android:exported="false"/);
    expect(entry![0]).toMatch(/android\.intent\.action\.TIMEZONE_CHANGED/);
    expect(entry![0]).toMatch(/android\.intent\.action\.TIME_SET/);
  });

  it('adapts again and redraws every kind through the one fan-out', () => {
    expect(receiver).toMatch(/Intent\.ACTION_TIMEZONE_CHANGED, Intent\.ACTION_TIME_CHANGED -> Unit/);
    expect(receiver).toMatch(/WidgetPayloadSource\.invalidate\(\)[\s\S]*PrayerWidgetProvider\.requestUpdate\(context\)/);
  });
});

describe('the Live Activity service', () => {
  it('reaches startForeground before it stops when there is nothing to draw', () => {
    expect(service).toMatch(/if \(incoming == null\) \{\s*stopWithoutPayload\(startId\)\s*return START_NOT_STICKY/);
    const stop = service.slice(service.indexOf('private fun stopWithoutPayload'));
    const fg = stop.indexOf('startForeground(');
    expect(fg).toBeGreaterThan(-1);
    expect(stop.indexOf('stopSelf(startId)')).toBeGreaterThan(fg);
    expect(stop).toMatch(/cancelWakeAlarm\(this\)/);
  });

  it('is taken down with its wake alarm even when it is not running', () => {
    const takeDown = module.slice(module.indexOf('fun takeDown'));
    expect(takeDown).toMatch(/stopService\([\s\S]*?MihrabLiveActivityService\.cancelWakeAlarm\(context\)/);
    const cancel = module.slice(module.indexOf('fun cancel(promise: Promise)'));
    expect(cancel).toMatch(/clearPayload\(reactContext\)\s*takeDown\(reactContext\)/);
  });

  it('with nothing ahead, is taken down but keeps the payload and the setting', () => {
    const v2 = module.slice(module.indexOf('fun displayV2'), module.indexOf('fun clearAlertOverride'));
    expect(v2).toMatch(/if \(adapted == null\) \{[\s\S]*?takeDown\(reactContext\)/);
    expect(v2).not.toMatch(/clearPayload\(/);
  });

  it('restarts from the shared payload adapted for its minute', () => {
    expect(service).toMatch(/\?: MihrabLiveActivityModule\.currentPayload\(this\)/);
    expect(code(read('MihrabRestartReceiver.kt'))).toMatch(/MihrabLiveActivityModule\.currentPayload\(context\)/);
  });

  it('never lets a kept shared payload outrank a plain display()', () => {
    expect(module).toMatch(/fun display\(payloadJson: String, promise: Promise\) \{\s*clearPayloadV2\(reactContext\)/);
  });
});

describe('the widget payload write', () => {
  it('rejects a call that would leave nothing readable', () => {
    expect(widgetModule).toMatch(/if \(json\.isEmpty\(\) && v2 == null\) \{\s*promise\.reject/);
    expect(widgetModule).toMatch(/val v2 = v2In\?\.takeIf \{ readable\(it\) \}/);
  });
});
