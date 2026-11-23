/**
 * The iPhone side of the optional background location — a preview
 * (ios/PrayerApp/BackgroundLocation.swift), held by its text: what makes it
 * cheap, that it does nothing unless asked for, and that it is built.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8');
const swift = read('ios/PrayerApp/BackgroundLocation.swift');

describe('background location on the iPhone (preview)', () => {
  it('uses iOS’s significant-change service and nothing else', () => {
    expect(swift).toContain('m.startMonitoringSignificantLocationChanges()');
    // No continuous updates, no region or visit monitoring, no one-off request.
    expect(swift).not.toMatch(/startUpdatingLocation|requestLocation\(|startMonitoringVisits|startMonitoring\(for/);
  });

  it('listens only when the setting is on and iOS allows "Always"', () => {
    expect(swift).toMatch(/if enabled && m\.authorizationStatus == \.authorizedAlways \{\s+m\.startMonitoringSignificantLocationChanges\(\)\s+\} else \{\s+m\.stopMonitoringSignificantLocationChanges\(\)/);
    expect(swift).toMatch(/guard enabled, let location = locations\.last else \{ return \}/);
  });

  it('hands over only a move of twenty kilometres or more, newer than the app’s own place', () => {
    expect(swift).toMatch(/moveMeters: CLLocationDistance = 20_000/);
    expect(swift).toMatch(/guard location\.timestamp\.timeIntervalSince1970 > defaults\.double\(forKey: Key\.placeAt\) else \{ return \}/);
    expect(swift).toMatch(/handoffGap: TimeInterval = 30 \* 60/);
  });

  it('is not offered on the Mac', () => {
    expect(swift).toMatch(/#if targetEnvironment\(macCatalyst\)\s+return false/);
  });

  it('is resumed at launch, for the launches iOS makes for a move', () => {
    expect(read('ios/PrayerApp/AppDelegate.swift')).toContain('MihrabBackgroundLocation.shared.resume()');
    expect(read('index.js')).toContain('startBackgroundMoveListener();');
  });

  it('is in the Xcode project, and the permission text says it is optional', () => {
    const project = read('ios/PrayerApp.xcodeproj/project.pbxproj');
    expect(project).toContain('BackgroundLocation.swift in Sources');
    expect(project).toContain('BackgroundLocation.m in Sources');
    const plist = read('ios/PrayerApp/Info.plist');
    const always = /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)![1];
    expect(always).toMatch(/^Optional\./);
    expect(always).toMatch(/works without it/);
  });

  it('says "Preview" on the row', () => {
    const card = read('src/screens/settings/BackgroundLocationCard.tsx');
    expect(card).toMatch(/settings\.previewTag/);
    expect(card).toMatch(/ios \? 'settings\.backgroundLocationHelpIos'/);
  });
});
