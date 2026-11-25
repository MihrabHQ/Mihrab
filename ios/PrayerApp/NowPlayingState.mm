

#import "MihrabTurbo.h"

@interface NowPlayingState (Turbo) <NativeNowPlayingStateSpec>
@end

@implementation NowPlayingState (Turbo)

RCT_EXPORT_MODULE(NowPlayingState)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeNowPlayingStateSpecJSI>(params);
}

@end
