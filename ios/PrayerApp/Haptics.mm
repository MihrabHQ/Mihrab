

#import "MihrabTurbo.h"

@interface Haptics (Turbo) <NativeHapticsSpec>
@end

@implementation Haptics (Turbo)

RCT_EXPORT_MODULE(Haptics)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeHapticsSpecJSI>(params);
}

@end
