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
  it('uses iOS’s two low-power services and nothing else', () => {
    expect(swift).toContain('m.startMonitoringSignificantLocationChanges()');
    // Arrivals: what reaches an iPad with no cellular radio.
    expect(swift).toContain('m.startMonitoringVisits()');
    expect(swift).toMatch(/guard visit\.departureDate == Date\.distantFuture,/);
    // No continuous updates, no regions, no one-off request: no GPS of its own.
    expect(swift).not.toMatch(/startUpdatingLocation|requestLocation\(|startMonitoring\(for/);
  });

  it('the place the app repeats at every launch is not stamped "found now"', () => {
    // Only a fresh position says when (confirmPlace); see BackgroundLocation.ts.
    expect(swift).toMatch(/func setPlace\(latitude: Double, longitude: Double\) \{\s+if defaults\.object\(forKey: Key\.placeLat\) != nil,\s+defaults\.double\(forKey: Key\.placeLat\) == latitude,\s+defaults\.double\(forKey: Key\.placeLng\) == longitude \{\s+return/);
    expect(swift).toMatch(/func confirmPlace\(\) \{\s+defaults\.set\(Date\(\)\.timeIntervalSince1970, forKey: Key\.placeAt\)/);
    expect(read('ios/PrayerApp/BackgroundLocation.m')).toContain('RCT_EXTERN_METHOD(confirmPlace)');
  });

  it('a new time zone under a running app starts its JavaScript again', () => {
    const app = read('ios/PrayerApp/AppDelegate.swift');
    expect(app).toContain('name: NSNotification.Name.NSSystemTimeZoneDidChange,');
    expect(app).toContain('RCTTriggerReloadCommandListeners("time zone changed")');
  });

  it('listens only when the setting is on and iOS allows "Always"', () => {
    expect(swift).toMatch(/if enabled && m\.authorizationStatus == \.authorizedAlways \{\s+m\.startMonitoringSignificantLocationChanges\(\)\s+m\.startMonitoringVisits\(\)\s+\} else \{\s+m\.stopMonitoringSignificantLocationChanges\(\)\s+m\.stopMonitoringVisits\(\)/);
    expect(swift).toMatch(/private func consider\(_ location: CLLocation\) \{\s+guard enabled else \{ return \}/);
  });

  it('hands over only a move of twenty kilometres or more, newer than the app’s own place', () => {
    expect(swift).toMatch(/moveMeters: CLLocationDistance = 20_000/);
    expect(swift).toMatch(/guard location\.timestamp\.timeIntervalSince1970 > defaults\.double\(forKey: Key\.placeAt\) else \{ return \}/);
    expect(swift).toMatch(/handoffGap: TimeInterval = 30 \* 60/);
    expect(swift).toMatch(/if now - handoffAt < MihrabBackgroundLocation\.handoffGap,\s+defaults\.double\(forKey: Key\.placeAt\) <= handoffAt \{/);
  });

  it('a move is kept until JavaScript has written it, so a reload in between does not lose it', () => {
    expect(swift).toMatch(/pending = move\s+onMove\?\(move\)/);
    expect(swift).toMatch(/func takePending\(\) -> \[String: Double\]\? \{\s+pending\s+\}/);
    expect(swift).toMatch(/func endTask\(\) \{\s+DispatchQueue\.main\.async \{\s+self\.pending = nil/);
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
