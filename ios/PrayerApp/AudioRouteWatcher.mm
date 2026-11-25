

#import "MihrabTurbo.h"

@interface AudioRouteWatcher (Turbo) <NativeAudioRouteWatcherSpec>
@end

@implementation AudioRouteWatcher (Turbo)

RCT_EXPORT_MODULE(AudioRouteWatcher)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAudioRouteWatcherSpecJSI>(params);
}

@end
