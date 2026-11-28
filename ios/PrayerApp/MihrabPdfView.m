#import <React/RCTViewManager.h>

// `MihrabPdfView` to JS — see `MihrabPdfView.swift`, and
// `src/native/MihrabPdfViewNativeComponent.ts` for the props.
@interface RCT_EXTERN_MODULE(MihrabPdfViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(path, NSString)
RCT_EXPORT_VIEW_PROPERTY(page, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(tone, NSString)
RCT_EXPORT_VIEW_PROPERTY(goTo, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(zoomTo, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(pageBy, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(find, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(findStep, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onPdfViewport, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPdfReady, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPdfFind, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPdfError, RCTDirectEventBlock)

@end
