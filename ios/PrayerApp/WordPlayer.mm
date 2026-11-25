

#import "MihrabTurbo.h"

@interface WordPlayer (Turbo) <NativeWordPlayerSpec>
@end

@implementation WordPlayer (Turbo)

RCT_EXPORT_MODULE(WordPlayer)

- (void)play:(NSString *)path startMs:(double)startMs endMs:(double)endMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self play:path startMs:@(startMs) endMs:@(endMs) resolver:resolve rejecter:reject];
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self stop:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWordPlayerSpecJSI>(params);
}

@end
