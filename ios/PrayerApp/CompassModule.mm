

#import "MihrabTurbo.h"

@interface CompassModule (Turbo) <NativeCompassModuleSpec>
@end

@implementation CompassModule (Turbo)

RCT_EXPORT_MODULE(CompassModule)

- (void)startUpdates:(double)latitude longitude:(double)longitude
{
  [self startUpdates];
}

// Not on this platform (the contract is one for all of them): sensorsAccess, hasSystemCompass, openSystemCompass.

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeCompassModuleSpecJSI>(params);
}

@end
