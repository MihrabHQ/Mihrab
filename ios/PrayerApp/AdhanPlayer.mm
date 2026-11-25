

#import "MihrabTurbo.h"

@interface AdhanPlayer (Turbo) <NativeAdhanPlayerSpec>
@end

@implementation AdhanPlayer (Turbo)

RCT_EXPORT_MODULE(AdhanPlayer)

- (void)play:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self play:name resolver:resolve rejecter:reject];
}

- (void)playPath:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self playPath:path resolver:resolve rejecter:reject];
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self stop:resolve rejecter:reject];
}

- (void)isPlaying:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self isPlaying:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAdhanPlayerSpecJSI>(params);
}

@end
