

#import "MihrabTurbo.h"

@interface MihrabClipboard (Turbo) <NativeMihrabClipboardSpec>
@end

@implementation MihrabClipboard (Turbo)

RCT_EXPORT_MODULE(MihrabClipboard)

- (void)setString:(NSString *)text resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self setString:text resolver:resolve rejecter:reject];
}

- (void)getString:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self getString:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabClipboardSpecJSI>(params);
}

@end
