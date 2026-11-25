#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <MihrabSpec/MihrabSpec.h>

/**
 * Whether the device clock is set to 24-hour time — issue #18.
 *
 * iOS has no API that names the "24-Hour Time" switch. What it does
 * instead is fold the choice into the current locale, so the honest way
 * to ask is to request the locale's preferred format for an hour field
 * ("j" — hour, in whichever cycle this user reads) and see whether a
 * day-period symbol came back with it. No "a" means 24-hour.
 *
 * `autoupdatingCurrentLocale` rather than `currentLocale` so a change
 * made in Settings while the app is backgrounded is visible on the next
 * call, which is exactly when JavaScript asks again.
 */
@interface SystemClock : NSObject <NativeSystemClockSpec>
@end

@implementation SystemClock

RCT_EXPORT_MODULE();

static BOOL MihrabSystemIs24Hour(void)
{
  NSString *format = [NSDateFormatter dateFormatFromTemplate:@"j"
                                                     options:0
                                                      locale:[NSLocale autoupdatingCurrentLocale]];
  if (format == nil) {
    return NO;
  }
  return [format rangeOfString:@"a"].location == NSNotFound;
}

- (facebook::react::ModuleConstants<JS::NativeSystemClock::Constants>)getConstants
{
  // The zone as well: JavaScript's first Intl call built a formatter to
  // learn it, milliseconds of a cold start (utils/zoneClock.ts).
  return facebook::react::typedConstants<JS::NativeSystemClock::Constants>({
      .is24Hour = (bool)MihrabSystemIs24Hour(),
      .timeZone = [NSTimeZone localTimeZone].name,
  });
}

- (facebook::react::ModuleConstants<JS::NativeSystemClock::Constants>)constantsToExport
{
  return [self getConstants];
}

// A different name from the `is24Hour` constant above, on purpose: a
// method and a constant sharing a name means one of them is unreachable
// from JavaScript in every bridge mode. See SystemClockModule.kt.
- (void)readIs24Hour:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  resolve(@(MihrabSystemIs24Hour()));
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}


- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSystemClockSpecJSI>(params);
}
@end
