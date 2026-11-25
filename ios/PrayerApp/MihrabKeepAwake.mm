

#import "MihrabTurbo.h"

@interface MihrabKeepAwake (Turbo) <NativeMihrabKeepAwakeSpec>
@end

@implementation MihrabKeepAwake (Turbo)

RCT_EXPORT_MODULE(MihrabKeepAwake)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabKeepAwakeSpecJSI>(params);
}

@end
