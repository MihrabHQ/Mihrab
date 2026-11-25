

#import "MihrabTurbo.h"

@interface MushafFont (Turbo) <NativeMushafFontSpec>
@end

@implementation MushafFont (Turbo)

RCT_EXPORT_MODULE(MushafFont)

- (void)registerFont:(NSString *)family path:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self registerFont:family path:path resolver:resolve rejecter:reject];
}

- (void)isValidFont:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self isValidFont:path resolver:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMushafFontSpecJSI>(params);
}

@end
