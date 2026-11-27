// A page of a PDF that is a file on this device, drawn to a picture.
//
// The same contract as Android's MihrabPdfModule.kt, and for the same
// reasons (see there): a Library book that is a PDF is read with no
// network, with what the system already has — Core Graphics here — and a
// page is drawn once at the width it is shown at, kept in the cache, and
// shown as an image in a list like any other.
//
// One queue of its own: a CGPDFDocument is not to be drawn from two
// threads at once, and a page of a long book takes long enough that it
// must not be drawn on the main one.

#import <CoreGraphics/CoreGraphics.h>
#import <UIKit/UIKit.h>

#import "MihrabTurbo.h"

static const CGFloat kMinWidth = 200;
static const CGFloat kMaxWidth = 3000;
static const double kMaxPixels = 13000000.0;
static const unsigned long long kCacheBytes = 120ULL * 1024ULL * 1024ULL;

@interface MihrabPdf : NSObject <NativeMihrabPdfSpec>
@end

@implementation MihrabPdf {
  dispatch_queue_t _queue;
  CGPDFDocumentRef _open;
  NSString *_openKey;
}

RCT_EXPORT_MODULE(MihrabPdf)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _queue = dispatch_queue_create("com.mihrab.pdf", DISPATCH_QUEUE_SERIAL);
    _open = NULL;
  }
  return self;
}

- (void)dealloc
{
  if (_open) CGPDFDocumentRelease(_open);
}

- (NSString *)plain:(NSString *)path
{
  return [path hasPrefix:@"file://"] ? [[NSURL URLWithString:path] path] ?: [path substringFromIndex:7] : path;
}

/// What the file is now: its place, size and date. A book fetched again is drawn again.
- (NSString *)keyFor:(NSString *)path
{
  NSDictionary *a = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
  return [NSString stringWithFormat:@"%@:%llu:%.0f", path, [a fileSize], [[a fileModificationDate] timeIntervalSince1970]];
}

- (NSString *)cacheRoot
{
  NSString *caches = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
  return [caches stringByAppendingPathComponent:@"pdf-pages"];
}

- (NSString *)pagesDirFor:(NSString *)path
{
  NSDictionary *a = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
  NSString *stem = [[path lastPathComponent] stringByDeletingPathExtension];
  NSString *name = [NSString stringWithFormat:@"%@-%llu-%.0f", stem, [a fileSize], [[a fileModificationDate] timeIntervalSince1970]];
  NSCharacterSet *bad = [[NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"] invertedSet];
  name = [[name componentsSeparatedByCharactersInSet:bad] componentsJoinedByString:@"_"];
  return [[self cacheRoot] stringByAppendingPathComponent:name];
}

/// The document at `path`, opened once and kept. On `_queue` only.
- (CGPDFDocumentRef)document:(NSString *)path
{
  NSString *key = [self keyFor:path];
  if (_open && [_openKey isEqualToString:key]) return _open;
  if (_open) {
    CGPDFDocumentRelease(_open);
    _open = NULL;
    _openKey = nil;
  }
  CGPDFDocumentRef doc = CGPDFDocumentCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path]);
  if (!doc) return NULL;
  // A locked file is not a book that can be read here.
  if (CGPDFDocumentIsEncrypted(doc) && !CGPDFDocumentUnlockWithPassword(doc, "")) {
    CGPDFDocumentRelease(doc);
    return NULL;
  }
  _open = doc;
  _openKey = key;
  return _open;
}

/// A page's size as it is read: its crop box, turned as the page says.
- (CGSize)sizeOf:(CGPDFPageRef)page
{
  CGRect box = CGPDFPageGetBoxRect(page, kCGPDFCropBox);
  int turn = CGPDFPageGetRotationAngle(page) % 180;
  return turn == 0 ? box.size : CGSizeMake(box.size.height, box.size.width);
}

- (void)info:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    NSString *file = [self plain:path];
    CGPDFDocumentRef doc = [self document:file];
    size_t pages = doc ? CGPDFDocumentGetNumberOfPages(doc) : 0;
    CGPDFPageRef first = pages > 0 ? CGPDFDocumentGetPage(doc, 1) : NULL;
    if (!first) {
      reject(@"pdf_unreadable", @"not a PDF that can be read", nil);
      return;
    }
    CGSize size = [self sizeOf:first];
    [self prune];
    resolve(@{@"pages" : @(pages), @"width" : @((NSInteger)llround(size.width)), @"height" : @((NSInteger)llround(size.height))});
  });
}

- (void)renderPage:(NSString *)path page:(double)page width:(double)width resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    NSString *file = [self plain:path];
    NSInteger index = (NSInteger)page;
    NSInteger wanted = (NSInteger)MIN(kMaxWidth, MAX(kMinWidth, width));
    NSString *dir = [self pagesDirFor:file];
    NSString *out = [dir stringByAppendingPathComponent:[NSString stringWithFormat:@"%ld@%ld.jpg", (long)index, (long)wanted]];
    NSString *sizeFile = [dir stringByAppendingPathComponent:[NSString stringWithFormat:@"%ld@%ld.txt", (long)index, (long)wanted]];
    NSFileManager *fm = [NSFileManager defaultManager];
    NSString *kept = [fm fileExistsAtPath:out] ? [NSString stringWithContentsOfFile:sizeFile encoding:NSUTF8StringEncoding error:nil] : nil;
    NSArray<NSString *> *wh = [kept componentsSeparatedByString:@"x"];
    if (wh.count == 2) {
      [fm setAttributes:@{NSFileModificationDate : [NSDate date]} ofItemAtPath:out error:nil];
      resolve(@{@"uri" : [[NSURL fileURLWithPath:out] absoluteString], @"width" : @([wh[0] integerValue]), @"height" : @([wh[1] integerValue])});
      return;
    }
    CGPDFDocumentRef doc = [self document:file];
    CGPDFPageRef p = (doc && index >= 0 && (size_t)index < CGPDFDocumentGetNumberOfPages(doc)) ? CGPDFDocumentGetPage(doc, (size_t)index + 1) : NULL;
    if (!p) {
      reject(@"pdf_page", @"the page could not be drawn", nil);
      return;
    }
    CGSize size = [self sizeOf:p];
    if (size.width <= 0 || size.height <= 0) {
      reject(@"pdf_page", @"the page has no size", nil);
      return;
    }
    double w = (double)wanted;
    double h = MAX(1.0, round(w * size.height / size.width));
    if (w * h > kMaxPixels) {
      double k = sqrt(kMaxPixels / (w * h));
      w = MAX(1.0, floor(w * k));
      h = MAX(1.0, floor(h * k));
    }
    UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat preferredFormat];
    format.scale = 1;
    format.opaque = YES;
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(w, h) format:format];
    NSData *jpeg = [renderer JPEGDataWithCompressionQuality:0.88
                                                    actions:^(UIGraphicsImageRendererContext *ctx) {
                                                      CGContextRef c = ctx.CGContext;
                                                      // A PDF page has no paper of its own.
                                                      CGContextSetFillColorWithColor(c, [UIColor whiteColor].CGColor);
                                                      CGContextFillRect(c, CGRectMake(0, 0, w, h));
                                                      // PDF space has its origin at the bottom; the page is fitted to the picture, turned as it says.
                                                      CGContextTranslateCTM(c, 0, h);
                                                      CGContextScaleCTM(c, 1, -1);
                                                      CGContextConcatCTM(c, CGPDFPageGetDrawingTransform(p, kCGPDFCropBox, CGRectMake(0, 0, w, h), 0, true));
                                                      // …which only ever makes a page smaller: a page smaller than the picture is scaled up to it.
                                                      CGRect box = CGPDFPageGetBoxRect(p, kCGPDFCropBox);
                                                      CGSize shown = (CGPDFPageGetRotationAngle(p) % 180 == 0) ? box.size : CGSizeMake(box.size.height, box.size.width);
                                                      if (shown.width < w) {
                                                        CGFloat k = w / shown.width;
                                                        CGContextTranslateCTM(c, box.origin.x + box.size.width / 2, box.origin.y + box.size.height / 2);
                                                        CGContextScaleCTM(c, k, k);
                                                        CGContextTranslateCTM(c, -(box.origin.x + box.size.width / 2), -(box.origin.y + box.size.height / 2));
                                                      }
                                                      CGContextSetInterpolationQuality(c, kCGInterpolationHigh);
                                                      CGContextSetRenderingIntent(c, kCGRenderingIntentDefault);
                                                      CGContextDrawPDFPage(c, p);
                                                    }];
    [fm createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    if (!jpeg || ![jpeg writeToFile:out atomically:YES]) {
      reject(@"pdf_page", @"the page could not be kept", nil);
      return;
    }
    [[NSString stringWithFormat:@"%ldx%ld", (long)w, (long)h] writeToFile:sizeFile atomically:YES encoding:NSUTF8StringEncoding error:nil];
    resolve(@{@"uri" : [[NSURL fileURLWithPath:out] absoluteString], @"width" : @((NSInteger)w), @"height" : @((NSInteger)h)});
  });
}

/// The cache is the system's to empty, but it is not left to grow past its share: the pages least lately read go first.
- (void)prune
{
  NSFileManager *fm = [NSFileManager defaultManager];
  NSURL *root = [NSURL fileURLWithPath:[self cacheRoot]];
  NSArray *keys = @[NSURLIsRegularFileKey, NSURLFileSizeKey, NSURLContentModificationDateKey];
  NSMutableArray<NSURL *> *files = [NSMutableArray array];
  unsigned long long total = 0;
  for (NSURL *u in [fm enumeratorAtURL:root includingPropertiesForKeys:keys options:0 errorHandler:nil]) {
    NSNumber *regular = nil;
    NSNumber *size = nil;
    [u getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];
    if (![regular boolValue]) continue;
    [u getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    total += [size unsignedLongLongValue];
    [files addObject:u];
  }
  if (total <= kCacheBytes) return;
  [files sortUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) {
    NSDate *da = nil;
    NSDate *db = nil;
    [a getResourceValue:&da forKey:NSURLContentModificationDateKey error:nil];
    [b getResourceValue:&db forKey:NSURLContentModificationDateKey error:nil];
    return [da ?: [NSDate distantPast] compare:db ?: [NSDate distantPast]];
  }];
  for (NSURL *u in files) {
    if (total <= kCacheBytes * 3 / 4) break;
    NSNumber *size = nil;
    [u getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    if ([fm removeItemAtURL:u error:nil]) total -= MIN(total, [size unsignedLongLongValue]);
  }
}

- (void)clearCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    if (self->_open) {
      CGPDFDocumentRelease(self->_open);
      self->_open = NULL;
      self->_openKey = nil;
    }
    [[NSFileManager defaultManager] removeItemAtPath:[self cacheRoot] error:nil];
    resolve(@YES);
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMihrabPdfSpecJSI>(params);
}

@end
