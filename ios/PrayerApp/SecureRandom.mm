

#import "MihrabTurbo.h"

@interface SecureRandom (Turbo) <NativeSecureRandomSpec>
@end

@implementation SecureRandom (Turbo)

RCT_EXPORT_MODULE(SecureRandom)

- (void)bytes:(double)count resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self bytes:@(count) resolver:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSecureRandomSpecJSI>(params);
}

@end
