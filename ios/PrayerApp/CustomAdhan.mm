

#import "MihrabTurbo.h"

@interface CustomAdhan (Turbo) <NativeCustomAdhanSpec>
@end

@implementation CustomAdhan (Turbo)

RCT_EXPORT_MODULE(CustomAdhan)

- (void)pick:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self pick:resolve rejecter:reject];
}

- (void)current:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self current:resolve rejecter:reject];
}

- (void)remove:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self remove:resolve rejecter:reject];
}

- (void)ensureChannel:(NSString *)channelName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self ensureChannel:channelName resolver:resolve rejecter:reject];
}

// Not on this platform (the contract is one for all of them): pickSystemSound, ensureAlarmChannel, deleteChannel.

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeCustomAdhanSpecJSI>(params);
}

@end
