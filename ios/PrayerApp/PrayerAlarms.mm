

#import "MihrabTurbo.h"

@interface PrayerAlarms (Turbo) <NativePrayerAlarmsSpec>
@end

@implementation PrayerAlarms (Turbo)

RCT_EXPORT_MODULE(PrayerAlarms)

- (void)isAvailable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self isAvailable:resolve rejecter:reject];
}

- (void)authorizationState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self authorizationState:resolve rejecter:reject];
}

- (void)requestAccess:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self requestAccess:resolve rejecter:reject];
}

- (void)schedule:(NSArray *)alarms resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self schedule:alarms resolver:resolve rejecter:reject];
}

- (void)clear:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self clear:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePrayerAlarmsSpecJSI>(params);
}

@end
