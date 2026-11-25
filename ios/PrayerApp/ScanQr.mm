

#import "MihrabTurbo.h"

@interface ScanQr (Turbo) <NativeScanQrSpec>
@end

@implementation ScanQr (Turbo)

RCT_EXPORT_MODULE(ScanQr)

- (void)isAvailable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self isAvailable:resolve rejecter:reject];
}

- (void)scan:(NSString *)hint cancel:(NSString *)cancel accent:(NSString *)accent resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self scan:hint cancel:cancel accent:accent resolver:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeScanQrSpecJSI>(params);
}

@end
