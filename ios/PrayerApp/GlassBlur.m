// GlassBlur — the blurred material behind GlassSurface (src/components/
// GlassSurface.tsx), which shows it only under the Liquid Glass palette.
//
// The app's own, in place of @react-native-community/blur, which is no
// longer maintained: this is the one thing the app used of it, a
// UIVisualEffectView with a blur of a given style and radius, and a plain
// colour in its place when Reduce Transparency is on. What it draws is
// what that library drew, so nothing looks different.
//
// THE RADIUS. UIBlurEffect has no public radius: a style comes with its
// own. The library set one by subclassing UIBlurEffect and writing
// `blurRadius` into the effect's settings — UIKit's own object, not a
// public API (http://stackoverflow.com/a/30744777/304706). That is kept
// here as it shipped, behind a check: if a future UIKit has no such
// settings object or no such key, the style's own radius is used and
// nothing crashes.

#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

@interface UIBlurEffect (GlassBlurSettings)
@property (nonatomic, readonly) id effectSettings;
@end

@interface GlassBlurEffect : UIBlurEffect
@property (nonatomic, strong) NSNumber *blurAmount;
+ (instancetype)effectWithStyle:(UIBlurEffectStyle)style blurAmount:(NSNumber *)blurAmount;
@end

@implementation GlassBlurEffect
@dynamic blurAmount;

+ (instancetype)effectWithStyle:(UIBlurEffectStyle)style
{
  id instance = [super effectWithStyle:style];
  object_setClass(instance, self);
  return instance;
}

+ (instancetype)effectWithStyle:(UIBlurEffectStyle)style blurAmount:(NSNumber *)blurAmount
{
  GlassBlurEffect *effect = (GlassBlurEffect *)[self effectWithStyle:style];
  effect.blurAmount = blurAmount;
  return effect;
}

- (void)setBlurAmount:(NSNumber *)blurAmount
{
  objc_setAssociatedObject(self, @selector(blurAmount), blurAmount, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

- (NSNumber *)blurAmount
{
  return objc_getAssociatedObject(self, @selector(blurAmount));
}

- (id)effectSettings
{
  if (![UIBlurEffect instancesRespondToSelector:@selector(effectSettings)]) {
    return nil;
  }
  id settings = [super effectSettings];
  NSNumber *blurAmount = self.blurAmount;
  if (settings && blurAmount) {
    @try {
      [settings setValue:blurAmount forKey:@"blurRadius"];
    } @catch (NSException *exception) {
      // No such key on this UIKit: the style keeps its own radius.
    }
  }
  return settings;
}

- (id)copyWithZone:(NSZone *)zone
{
  id instance = [super copyWithZone:zone];
  object_setClass(instance, [self class]);
  objc_setAssociatedObject(instance, @selector(blurAmount), self.blurAmount, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  return instance;
}

@end

@interface GlassBlurView : UIView
@property (nonatomic, copy) NSString *blurType;
@property (nonatomic, strong) NSNumber *blurAmount;
@property (nonatomic, strong) UIColor *reducedTransparencyFallbackColor;
@end

@implementation GlassBlurView {
  UIVisualEffectView *_effectView;
  UIView *_fallbackView;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _effectView = [[UIVisualEffectView alloc] init];
    _effectView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _effectView.frame = self.bounds;
    _fallbackView = [[UIView alloc] init];
    _fallbackView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _fallbackView.frame = self.bounds;
    _blurAmount = @10;
    _blurType = @"dark";
    self.clipsToBounds = YES;
    [self addSubview:_effectView];
    [self updateEffect];
    [self updateFallback];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(reduceTransparencyChanged:)
                                                 name:UIAccessibilityReduceTransparencyStatusDidChangeNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _effectView.frame = self.bounds;
  _fallbackView.frame = self.bounds;
}

- (void)setBlurType:(NSString *)blurType
{
  if (blurType && ![_blurType isEqualToString:blurType]) {
    _blurType = [blurType copy];
    [self updateEffect];
  }
}

- (void)setBlurAmount:(NSNumber *)blurAmount
{
  if (blurAmount && ![_blurAmount isEqualToNumber:blurAmount]) {
    _blurAmount = blurAmount;
    [self updateEffect];
  }
}

- (void)setReducedTransparencyFallbackColor:(UIColor *)color
{
  if (color && ![_reducedTransparencyFallbackColor isEqual:color]) {
    _reducedTransparencyFallbackColor = color;
    [self updateFallback];
  }
}

// The three GlassSurface asks for; anything else is the dark one, as before.
- (UIBlurEffectStyle)style
{
  if ([_blurType isEqualToString:@"xlight"]) return UIBlurEffectStyleExtraLight;
  if ([_blurType isEqualToString:@"light"]) return UIBlurEffectStyleLight;
  return UIBlurEffectStyleDark;
}

- (void)updateEffect
{
  // Cleared first: a new radius on the same view is otherwise not taken up.
  _effectView.effect = nil;
  _effectView.effect = [GlassBlurEffect effectWithStyle:[self style] blurAmount:_blurAmount];
}

- (void)updateFallback
{
  BOOL plain = UIAccessibilityIsReduceTransparencyEnabled() && _reducedTransparencyFallbackColor != nil;
  if (plain) {
    if (_fallbackView.superview != self) [self insertSubview:_fallbackView atIndex:0];
    [_effectView removeFromSuperview];
  } else {
    [_fallbackView removeFromSuperview];
    if (_effectView.superview != self) [self insertSubview:_effectView atIndex:0];
  }
  _fallbackView.backgroundColor = _reducedTransparencyFallbackColor;
}

- (void)reduceTransparencyChanged:(__unused NSNotification *)notification
{
  [self updateFallback];
}

@end

@interface GlassBlurManager : RCTViewManager
@end

@implementation GlassBlurManager

RCT_EXPORT_MODULE(GlassBlur)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [GlassBlurView new];
}

RCT_EXPORT_VIEW_PROPERTY(blurType, NSString)
RCT_EXPORT_VIEW_PROPERTY(blurAmount, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(reducedTransparencyFallbackColor, UIColor)

@end
