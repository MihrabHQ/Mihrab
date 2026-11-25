// PrayerLiveActivity Objective-C bridge — task #128.
//
// Re-exports the Swift @objc methods on `PrayerLiveActivity` so the
// React Native bridge can find them by selector. The Swift class itself
// lives in `PrayerLiveActivity.swift` and conforms to the implicit RCT
// module protocol via `@objc(PrayerLiveActivity)`.
//
// We deliberately don't import any ActivityKit headers here — the
// bridge is pure JS↔Swift glue; all ActivityKit calls live in the Swift
// file under `#if canImport(ActivityKit)` guards.

#import "MihrabTurbo.h"

@interface PrayerLiveActivity (Turbo) <NativePrayerLiveActivitySpec>
@end

@implementation PrayerLiveActivity (Turbo)

RCT_EXPORT_MODULE(PrayerLiveActivity)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)start:(NSString *)json resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self start:json resolver:resolve rejecter:reject];
}

- (void)startV2:(NSString *)json resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self startV2:json resolver:resolve rejecter:reject];
}

- (void)update:(NSString *)json resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self update:json resolver:resolve rejecter:reject];
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self stop:resolve rejecter:reject];
}

- (void)reassert:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self reassert:resolve rejecter:reject];
}

- (void)isAvailable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self isAvailable:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePrayerLiveActivitySpecJSI>(params);
}

@end
