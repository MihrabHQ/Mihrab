

#import "MihrabTurbo.h"

@interface MihrabLaunchSnapshot (Turbo) <NativeMihrabLaunchSnapshotSpec>
@end

@implementation MihrabLaunchSnapshot (Turbo)

RCT_EXPORT_MODULE(MihrabLaunchSnapshot)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabLaunchSnapshotSpecJSI>(params);
}

@end
