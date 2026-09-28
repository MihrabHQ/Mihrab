#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MihrabRotationCover, NSObject)

RCT_EXTERN_METHOD(arm:(nonnull NSNumber *)argb)
RCT_EXTERN_METHOD(disarm)
RCT_EXTERN_METHOD(lift:(nonnull NSNumber *)durationMs)

@end
