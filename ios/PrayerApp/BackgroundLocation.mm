

#import "MihrabTurbo.h"

@interface BackgroundLocation (Turbo) <NativeBackgroundLocationSpec>
@end

@implementation BackgroundLocation (Turbo)

RCT_EXPORT_MODULE(BackgroundLocation)

- (void)status:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self status:resolve rejecter:reject];
}

- (void)setEnabled:(BOOL)on resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self setEnabled:on resolver:resolve rejecter:reject];
}

- (void)requestAlways:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self requestAlways:resolve rejecter:reject];
}

- (void)takePending:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self takePending:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeBackgroundLocationSpecJSI>(params);
}

@end
