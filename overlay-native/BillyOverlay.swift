/* billy-overlay: transparent, click-through, always-on-top shell around
   WKWebView. Reuses ui-side overlay.html; answers come from the node MCP
   server's loopback "brain" port. Claude window found via CGWindowList
   (bounds + owner name need no permissions). Build:
     swiftc -O -framework Cocoa -framework WebKit -o billy-overlay BillyOverlay.swift */
import Cocoa
import WebKit

let args = CommandLine.arguments
func argValue(_ name: String) -> String? {
  if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }
  return nil
}

func claudeWindowBounds() -> CGRect? {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
  var best: CGRect? = nil
  for w in list {
    guard let owner = w[kCGWindowOwnerName as String] as? String, owner == "Claude",
          let layer = w[kCGWindowLayer as String] as? Int, layer == 0,
          let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
    let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
    if r.width < 300 || r.height < 200 { continue }
    if best == nil || r.width * r.height > best!.width * best!.height { best = r }
  }
  return best
}

final class Delegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var hotRects: [CGRect] = []   /* CSS top-left coords */
  var timer: Timer?

  let stateDir = NSHomeDirectory() + "/.hire-billy"
  var pidFile: String { stateDir + "/overlay.pid" }
  var cmdFile: String { stateDir + "/overlay.cmd" }

  func applicationDidFinishLaunching(_ n: Notification) {
    try? FileManager.default.createDirectory(atPath: stateDir, withIntermediateDirectories: true)
    try? String(ProcessInfo.processInfo.processIdentifier).write(toFile: pidFile, atomically: true, encoding: .utf8)
    let screen = NSScreen.main!.frame
    window = NSWindow(contentRect: screen, styleMask: [.borderless], backing: .buffered, defer: false)
    window.isOpaque = false
    window.backgroundColor = .clear
    window.hasShadow = false
    window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    window.ignoresMouseEvents = true

    let conf = WKWebViewConfiguration()
    conf.userContentController.add(self, name: "rects")
    conf.userContentController.add(self, name: "quit")
    var cfg = "window.__BILLY={screenW:\(Int(screen.width)),screenH:\(Int(screen.height))"
    if let brain = argValue("--brain") { cfg += ",brain:'\(brain)'" }
    if let token = argValue("--token") { cfg += ",token:'\(token)'" }
    if let c = claudeWindowBounds() {
      cfg += ",claude:{x:\(Int(c.origin.x)),y:\(Int(c.origin.y)),w:\(Int(c.width)),h:\(Int(c.height))}"
    }
    cfg += "};"
    conf.userContentController.addUserScript(
      WKUserScript(source: cfg, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: screen, configuration: conf)
    web.setValue(false, forKey: "drawsBackground")
    web.loadFileURL(htmlURL(), allowingReadAccessTo: htmlURL().deletingLastPathComponent())
    window.contentView = web
    window.makeKeyAndOrderFront(nil)
    NSApp.setActivationPolicy(.accessory)

    let screenH = screen.height
    timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      let m = NSEvent.mouseLocation                 /* bottom-left origin */
      let css = CGPoint(x: m.x, y: screenH - m.y)   /* top-left origin */
      let hit = self.hotRects.contains { $0.contains(css) }
      if self.window.ignoresMouseEvents == hit { self.window.ignoresMouseEvents = !hit }
      if FileManager.default.fileExists(atPath: self.cmdFile),
         let cmd = try? String(contentsOfFile: self.cmdFile, encoding: .utf8), cmd.contains("retire") {
        try? FileManager.default.removeItem(atPath: self.cmdFile)
        self.web.evaluateJavaScript("window.__retire && window.__retire()")
      }
    }
  }

  func applicationWillTerminate(_ n: Notification) {
    try? FileManager.default.removeItem(atPath: pidFile)
  }

  func htmlURL() -> URL {
    let bin = URL(fileURLWithPath: args[0]).resolvingSymlinksInPath()
    return bin.deletingLastPathComponent().appendingPathComponent("overlay.html")
  }

  func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
    if m.name == "quit" { NSApp.terminate(nil); return }
    if m.name == "rects", let arr = m.body as? [[String: Double]] {
      hotRects = arr.map { CGRect(x: $0["x"] ?? 0, y: $0["y"] ?? 0, width: $0["w"] ?? 0, height: $0["h"] ?? 0) }
    }
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.run()
