/**
 * The iOS side of "the recitation behaves like a media app".
 *
 * Android got lock-screen controls for free from track-player's media
 * session. iOS needed four things pinned: the audio session configured for
 * long-form spoken playback (Apple's media-playback guide), the remote
 * commands bound (applyPlayerOptions, covered elsewhere), a pause when the
 * headphones come out (the iOS half of Android's handleAudioBecomingNoisy),
 * and the in-app adhan not playing over a running recitation.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('audio session configuration', () => {
  const src = read('src/quran/audio/playback.ts');

  it('sets up the player for long-form spoken playback on iOS', () => {
    expect(src).toMatch(/iosCategory:\s*IOSCategory\.Playback/);
    expect(src).toMatch(/iosCategoryMode:\s*IOSCategoryMode\.SpokenAudio/);
    expect(src).toMatch(/iosCategoryPolicy:\s*'longFormAudio'/);
    expect(src).toMatch(/autoHandleInterruptions:\s*true/);
  });

  it('left no diagnostics behind', () => {
    expect(src).not.toMatch(/TEMPDIAG/);
  });

  it('pauses when the output route goes away and before the adhan', () => {
    expect(src).toMatch(/onAudioRouteLost\(/);
    expect(src).toMatch(/onBeforeAdhanPlays\(/);
  });

  it('uses the square icon as lock-screen artwork', () => {
    // The rounded app icon has transparent corners, which the lock screen
    // paints white.
    expect(src).toMatch(/app-icon-square\.png/);
    expect(fs.existsSync(path.join(__dirname, '..', 'assets/app-icon-square.png'))).toBe(true);
  });
});

describe('AudioRouteWatcher (native)', () => {
  it('observes route changes and forwards only the lost-device reason', () => {
    const swift = read('ios/PrayerApp/AudioRouteWatcher.swift');
    expect(swift).toMatch(/AVAudioSession\.routeChangeNotification/);
    expect(swift).toMatch(/\.oldDeviceUnavailable/);
    expect(swift).toMatch(/"AudioRouteLost"/);
    expect(read('ios/PrayerApp/AudioRouteWatcher.m')).toMatch(
      /RCT_EXTERN_MODULE\(AudioRouteWatcher, RCTEventEmitter\)/,
    );
  });

  it('is compiled into the app', () => {
    const pbx = read('ios/PrayerApp.xcodeproj/project.pbxproj');
    expect(pbx).toMatch(/AudioRouteWatcher\.swift in Sources/);
    expect(pbx).toMatch(/AudioRouteWatcher\.m in Sources/);
  });
});

describe('AdhanPlayer (native)', () => {
  it('only deactivates the shared session for an adhan it played', () => {
    const swift = read('ios/PrayerApp/AdhanPlayer.swift');
    const stop = swift.slice(swift.indexOf('func stop('));
    expect(stop).toMatch(/guard let p = self\.player else/);
    expect(stop.indexOf('guard let p')).toBeLessThan(stop.indexOf('setActive(false'));
  });
});
