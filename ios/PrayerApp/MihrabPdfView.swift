import PDFKit
import React
import UIKit

/**
 A Library book that is a PDF, read in Apple's own PDF view (PDFKit), on
 iPhone, iPad and Mac.

 The scrolling, the zoom under two fingers and the drawing of the pages are
 the system's, as they are on Android (`MihrabPdfReaderView.kt`, which says
 why: a reader made of pictures of pages, zoomed by hand from JavaScript,
 twitched when the fingers lifted and moved one way at a time). This is the
 same view to JavaScript — the same props, the same events
 (`src/native/MihrabPdfViewNativeComponent.ts`) — so the screen that keeps
 the place, the bookmarks and the notes knows one reader.

 The file is one already on the device (`libraryPdf.ts` fetched and checked
 it); it is opened by its path and nothing here reaches the network.

 Things asked for, not states to be in — a page to go to, a zoom to take, a
 screen to turn, words to find — come with a `key` that changes each time
 they are asked, so the same one can be asked twice.
 */
class MihrabPdfReaderView: UIView {
  private let pdf = PDFView()
  /// Over the pages, taking no touches: what turns the paper warm, or dark.
  private let tint = UIView()
  private var opened = ""
  private var arriving = false
  private var saidPage = -1
  private var saidZoom = -1
  private var goKey = 0
  private var zoomKey = 0
  private var pageKey = 0
  private var findKey = 0
  private var stepKey = 0
  private var matches: [PDFSelection] = []
  private var shown = -1
  private var lastWidth: CGFloat = 0

  @objc var path: NSString = "" { didSet { DispatchQueue.main.async { [weak self] in self?.open() } } }
  /// The page to open at, from 0.
  @objc var page: NSNumber = 0
  @objc var onPdfViewport: RCTDirectEventBlock?
  @objc var onPdfReady: RCTDirectEventBlock?
  @objc var onPdfFind: RCTDirectEventBlock?
  @objc var onPdfError: RCTDirectEventBlock?

  @objc var tone: NSString = "paper" { didSet { applyTone() } }

  @objc var goTo: NSDictionary? {
    didSet {
      guard let d = goTo, let key = d["key"] as? Int, key != goKey, let n = d["page"] as? Int else { return }
      goKey = key
      go(n)
    }
  }

  /// `step` is against the page's own width: 1 is a page as wide as the view.
  @objc var zoomTo: NSDictionary? {
    didSet {
      guard let d = zoomTo, let key = d["key"] as? Int, key != zoomKey, let step = d["step"] as? Double else { return }
      zoomKey = key
      DispatchQueue.main.async { [weak self] in self?.zoom(CGFloat(step)) }
    }
  }

  /// A screen on (1) or back (-1).
  @objc var pageBy: NSDictionary? {
    didSet {
      guard let d = pageBy, let key = d["key"] as? Int, key != pageKey, let by = d["by"] as? Int else { return }
      pageKey = key
      guard let scroll = scroller() else { return }
      let most = max(0, scroll.contentSize.height - scroll.bounds.height)
      let y = min(most, max(0, scroll.contentOffset.y + CGFloat(by) * scroll.bounds.height * 0.85))
      scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: y), animated: false)
    }
  }

  @objc var find: NSDictionary? {
    didSet {
      guard let d = find, let key = d["key"] as? Int, key != findKey else { return }
      findKey = key
      look((d["query"] as? String) ?? "", key)
    }
  }

  @objc var findStep: NSDictionary? {
    didSet {
      guard let d = findStep, let key = d["key"] as? Int, key != stepKey, let by = d["by"] as? Int else { return }
      stepKey = key
      let n = matches.count
      if n == 0 { return }
      shown = ((shown + by) % n + n) % n
      showMatch()
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    pdf.autoScales = true
    pdf.displayMode = .singlePageContinuous
    pdf.displayDirection = .vertical
    pdf.displaysPageBreaks = true
    pdf.backgroundColor = .clear
    pdf.frame = bounds
    pdf.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(pdf)
    tint.isUserInteractionEnabled = false
    tint.isHidden = true
    tint.frame = bounds
    tint.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(tint)
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(moved), name: .PDFViewPageChanged, object: pdf)
    center.addObserver(self, selector: #selector(moved), name: .PDFViewScaleChanged, object: pdf)
    center.addObserver(self, selector: #selector(moved), name: .PDFViewVisiblePagesChanged, object: pdf)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  deinit { NotificationCenter.default.removeObserver(self) }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The phone was turned, or the window made wider: a page as wide as the view is another zoom now.
    if bounds.width > 0 && bounds.width != lastWidth {
      let fitted = lastWidth == 0 || abs(pdf.scaleFactor - pdf.minScaleFactor) < 0.01
      lastWidth = bounds.width
      limits()
      if fitted { pdf.scaleFactor = pdf.scaleFactorForSizeToFit }
      report()
    }
  }

  /// A page as wide as the view is the least zoom, and four times it the most.
  private func limits() {
    let fit = pdf.scaleFactorForSizeToFit
    guard fit > 0 else { return }
    pdf.minScaleFactor = fit
    pdf.maxScaleFactor = fit * 4
  }

  private func open() {
    var file = path as String
    if file.hasPrefix("file://") { file = String(file.dropFirst(7)) }
    if file.isEmpty || file == opened { return }
    guard let doc = PDFDocument(url: URL(fileURLWithPath: file)), doc.pageCount > 0 else {
      onPdfError?(["message": "the file would not open"])
      return
    }
    opened = file
    matches = []
    shown = -1
    saidPage = -1
    saidZoom = -1
    pdf.document = doc
    pdf.autoScales = true
    limits()
    let at = min(max(0, page.intValue), doc.pageCount - 1)
    arriving = at > 0
    onPdfReady?(["search": true])
    // Once the pages have a size: a view not yet laid out has nowhere to go.
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.limits()
      if at > 0 { self.go(at) }
      self.arriving = false
      self.report()
    }
  }

  private func go(_ n: Int) {
    guard let doc = pdf.document, doc.pageCount > 0, let p = doc.page(at: min(max(0, n), doc.pageCount - 1)) else { return }
    // The top of the page, not wherever the view was on the one before.
    let box = p.bounds(for: pdf.displayBox)
    pdf.go(to: PDFDestination(page: p, at: CGPoint(x: box.minX, y: box.maxY)))
  }

  private func zoom(_ step: CGFloat) {
    let fit = pdf.scaleFactorForSizeToFit
    guard fit > 0, pdf.document != nil else { return }
    limits()
    // What is in the middle of the view stays there.
    let middle = CGPoint(x: pdf.bounds.midX, y: pdf.bounds.midY)
    let page = pdf.page(for: middle, nearest: true)
    let point = page.map { pdf.convert(middle, to: $0) }
    pdf.scaleFactor = min(pdf.maxScaleFactor, max(pdf.minScaleFactor, fit * step))
    if let page = page, let point = point, let scroll = scroller() {
      let now = pdf.convert(point, from: page)
      let dx = now.x - middle.x
      let dy = now.y - middle.y
      let x = min(max(0, scroll.contentOffset.x + dx), max(0, scroll.contentSize.width - scroll.bounds.width))
      let y = min(max(0, scroll.contentOffset.y + dy), max(0, scroll.contentSize.height - scroll.bounds.height))
      scroll.setContentOffset(CGPoint(x: x, y: y), animated: false)
    }
    report()
  }

  /// The view's own scroller, which PDFKit does not hand out.
  private func scroller() -> UIScrollView? {
    var queue: [UIView] = [pdf]
    while !queue.isEmpty {
      let v = queue.removeFirst()
      if let s = v as? UIScrollView { return s }
      queue.append(contentsOf: v.subviews)
    }
    return nil
  }

  @objc private func moved() { report() }

  private func report() {
    guard let doc = pdf.document, let current = pdf.currentPage, !arriving else { return }
    let fit = pdf.scaleFactorForSizeToFit
    guard fit > 0 else { return }
    let index = doc.index(for: current)
    if index == NSNotFound { return }
    let percent = Int((pdf.scaleFactor / fit * 20).rounded()) * 5
    if index == saidPage && percent == saidZoom { return }
    saidPage = index
    saidZoom = percent
    onPdfViewport?(["page": index, "zoom": Double(percent) / 100.0])
  }

  /// The colour of the paper: the view's own picture, blended on its way to the glass. The file is not touched.
  private func applyTone() {
    switch tone as String {
    case "night":
      tint.backgroundColor = UIColor(white: 0.92, alpha: 1)
      tint.layer.compositingFilter = "differenceBlendMode"
      tint.isHidden = false
    case "sepia":
      tint.backgroundColor = UIColor(red: 1, green: 0.95, blue: 0.82, alpha: 1)
      tint.layer.compositingFilter = "multiplyBlendMode"
      tint.isHidden = false
    default:
      tint.layer.compositingFilter = nil
      tint.isHidden = true
    }
  }

  // MARK: Looking for words

  private func look(_ query: String, _ key: Int) {
    matches = []
    shown = -1
    pdf.highlightedSelections = nil
    pdf.clearSelection()
    let words = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let doc = pdf.document, !words.isEmpty else { return }
    let from = max(0, saidPage)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let found = doc.findString(words, withOptions: [.caseInsensitive, .diacriticInsensitive])
      DispatchQueue.main.async {
        guard let self = self, self.findKey == key, self.pdf.document === doc else { return }
        self.matches = found
        // The first place at or after the page being read; none there, the first in the book.
        let first = found.firstIndex { sel in
          guard let p = sel.pages.first else { return false }
          return doc.index(for: p) >= from
        }
        self.shown = first ?? (found.isEmpty ? -1 : 0)
        self.showMatch()
      }
    }
  }

  private func showMatch() {
    if shown >= 0 && shown < matches.count, let doc = pdf.document {
      let here = matches[shown]
      let page = here.pages.first.map { doc.index(for: $0) } ?? 0
      // Marked: the place shown, and the others on its page and the pages beside it.
      var marks: [PDFSelection] = []
      for (i, m) in matches.enumerated() {
        guard let p = m.pages.first else { continue }
        let n = doc.index(for: p)
        if n >= page - 1 && n <= page + 1 {
          m.color = i == shown ? UIColor(red: 1, green: 0.6, blue: 0, alpha: 0.6) : UIColor(red: 1, green: 0.88, blue: 0.51, alpha: 0.4)
          marks.append(m)
        }
      }
      pdf.highlightedSelections = marks
      pdf.go(to: here)
    } else {
      pdf.highlightedSelections = nil
    }
    onPdfFind?(["count": matches.count, "index": shown + 1])
  }
}

@objc(MihrabPdfViewManager)
class MihrabPdfViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    MihrabPdfReaderView(frame: .zero)
  }
}
