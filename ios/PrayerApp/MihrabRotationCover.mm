

#import "MihrabTurbo.h"

@interface MihrabRotationCover (Turbo) <NativeMihrabRotationCoverSpec>
@end

@implementation MihrabRotationCover (Turbo)

RCT_EXPORT_MODULE(MihrabRotationCover)

// The module's one constant. No window turns on the Mac, and JavaScript
// reads this before it arms anything (src/native/RotationCover.ts).
- (facebook::react::ModuleConstants<JS::NativeMihrabRotationCover::Constants>)getConstants
{
#if TARGET_OS_MACCATALYST
  BOOL enabled = NO;
#else
  BOOL enabled = YES;
#endif
  return facebook::react::typedConstants<JS::NativeMihrabRotationCover::Constants>({.enabled = (bool)enabled});
}

- (facebook::react::ModuleConstants<JS::NativeMihrabRotationCover::Constants>)constantsToExport
{
  return [self getConstants];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabRotationCoverSpecJSI>(params);
}

@end
