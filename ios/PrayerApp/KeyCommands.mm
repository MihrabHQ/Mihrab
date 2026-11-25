

#import "MihrabTurbo.h"

@interface MihrabKeyCommands (Turbo) <NativeMihrabKeyCommandsSpec>
@end

@implementation MihrabKeyCommands (Turbo)

RCT_EXPORT_MODULE(MihrabKeyCommands)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabKeyCommandsSpecJSI>(params);
}

@end
