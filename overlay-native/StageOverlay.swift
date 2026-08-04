/* stage-overlay: transparent, click-through, always-on-top shell around
   WKWebView. Reuses ui-side overlay.html; answers come from the node MCP
   server's loopback "brain" port. Claude window found via CGWindowList
   (bounds + owner name need no permissions). Build:
     swiftc -O -framework Cocoa -framework WebKit -o stage-overlay StageOverlay.swift */
import Cocoa
import WebKit

let args = CommandLine.arguments
func argValue(_ name: String) -> String? {
  if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }
  return nil
}

func claudeWindowBounds() -> CGRect? {
  /* match by bundle id first (robust to display-name changes), fall back to owner name.
     CGWindowList returns front-to-back, so the first hit is the frontmost Claude window. */
  let claudePids = Set(NSWorkspace.shared.runningApplications
    .filter { ($0.bundleIdentifier ?? "").lowercased().contains("claude") }
    .map { Int($0.processIdentifier) })
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
  for w in list {
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    guard claudePids.contains(pid) || owner == "Claude",
          let layer = w[kCGWindowLayer as String] as? Int, layer == 0,
          let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
    let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
    if r.width < 300 || r.height < 200 { continue }
    /* a Claude window on another display is off the stage; keep looking */
    if !CGDisplayBounds(CGMainDisplayID()).intersects(r) { continue }
    return r
  }
  return nil
}

final class Delegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var hotRects: [CGRect] = []   /* CSS top-left coords */
  var timer: Timer?

  let stateDir = NSHomeDirectory() + "/.eap-stage"
  var pidFile: String { stateDir + "/overlay.pid" }
  var cmdFile: String { stateDir + "/overlay.cmd" }

  func applicationDidFinishLaunching(_ n: Notification) {
    try? FileManager.default.createDirectory(atPath: stateDir, withIntermediateDirectories: true)
    try? String(ProcessInfo.processInfo.processIdentifier).write(toFile: pidFile, atomically: true, encoding: .utf8)
    /* the stage is the primary display: window-server coordinates are anchored
       there, and NSScreen.main (the focused screen) may be a different monitor */
    let screen = (NSScreen.screens.first ?? NSScreen.main!).frame
    window = NSWindow(contentRect: screen, styleMask: [.borderless], backing: .buffered, defer: false)
    window.isOpaque = false
    window.backgroundColor = .clear
    window.hasShadow = false
    window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    window.ignoresMouseEvents = true
    window.setFrame(screen, display: true)  /* re-assert after level permits covering the menu bar */

    let conf = WKWebViewConfiguration()
    conf.userContentController.add(self, name: "rects")
    conf.userContentController.add(self, name: "quit")
    conf.userContentController.add(self, name: "openurl")
    conf.userContentController.add(self, name: "openstage")
    var cfg = "window.__STAGE={screenW:\(Int(screen.width)),screenH:\(Int(screen.height))"
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

    _ = screen.height
    lastClaude = claudeWindowBounds()
    Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      guard let r = claudeWindowBounds() else { return }
      if let l = self.lastClaude,
         abs(l.origin.x - r.origin.x) < 24, abs(l.origin.y - r.origin.y) < 24,
         abs(l.width - r.width) < 24, abs(l.height - r.height) < 24 { return }
      self.lastClaude = r
      self.pushClaude(r)
    }
    timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      let m = NSEvent.mouseLocation                 /* bottom-left origin */
      let f = self.window.frame
      let css = CGPoint(x: m.x - f.origin.x, y: (f.origin.y + f.height) - m.y)
      let hit = self.hotRects.contains { $0.contains(css) }
      if CommandLine.arguments.contains("--debug") {
        try? "cursor \(Int(css.x)),\(Int(css.y)) hit \(hit) rects \(self.hotRects.count)".write(toFile: self.stateDir + "/cursor.dbg", atomically: true, encoding: .utf8)
      }
      if self.window.ignoresMouseEvents == hit { self.window.ignoresMouseEvents = !hit }
      if FileManager.default.fileExists(atPath: self.cmdFile),
         let cmd = try? String(contentsOfFile: self.cmdFile, encoding: .utf8), !cmd.isEmpty {
        try? FileManager.default.removeItem(atPath: self.cmdFile)
        if cmd.contains("gohome") { self.web.evaluateJavaScript("window.__gohome && window.__gohome()") }
        else { self.web.evaluateJavaScript("window.__retire && window.__retire()") }
      }
    }
  }

  var lastClaude: CGRect? = nil
  func pushClaude(_ r: CGRect) {
    let js = "window.__reseat && window.__reseat({x:\(Int(r.origin.x)),y:\(Int(r.origin.y)),w:\(Int(r.width)),h:\(Int(r.height))})"
    web.evaluateJavaScript(js)
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
    if m.name == "openurl", let s = m.body as? String, let url = URL(string: s),
       s.hasPrefix("http://127.0.0.1") || s.hasPrefix("http://localhost") {
      NSWorkspace.shared.open(url); return
    }
    if m.name == "openstage", let s = m.body as? String,
       s.hasPrefix("http://127.0.0.1") || s.hasPrefix("http://localhost") {
      let scr = NSScreen.main!.frame
      let w = Int(scr.width * 0.46), h = Int(scr.height * 0.62)
      let x = Int(scr.width) - w - 40, y = 80
      let esc = s.replacingOccurrences(of: "\"", with: "")
      let script = """
      tell application \"Google Chrome\"
        make new window
        set bounds of front window to {\(x), \(y), \(x + w), \(y + h)}
        set URL of active tab of front window to \"\(esc)\"
        activate
      end tell
      """
      DispatchQueue.global().async {
        var err: NSDictionary?
        let ok = NSAppleScript(source: script)?.executeAndReturnError(&err)
        if ok == nil, let url = URL(string: s) {
          DispatchQueue.main.async { NSWorkspace.shared.open(url) }
        }
      }
      return
    }
    if m.name == "rects", let arr = m.body as? [[String: Any]] {
      hotRects = arr.map { d in
        func num(_ k: String) -> CGFloat { CGFloat((d[k] as? NSNumber)?.doubleValue ?? 0) }
        return CGRect(x: num("x"), y: num("y"), width: num("w"), height: num("h"))
      }
      if CommandLine.arguments.contains("--debug") {
        let s = hotRects.map { "\(Int($0.origin.x)),\(Int($0.origin.y)),\(Int($0.width)),\(Int($0.height))" }.joined(separator: " ")
        try? s.write(toFile: stateDir + "/rects.dbg", atomically: true, encoding: .utf8)
      }
    }
  }
}

if CommandLine.arguments.contains("--list-windows") {
  var out: [[String: Any]] = []
  let stage = CGDisplayBounds(CGMainDisplayID())
  if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
    for w in list {
      guard let layer = w[kCGWindowLayer as String] as? Int, layer == 0,
            let b = w[kCGWindowBounds as String] as? [String: CGFloat],
            let bw = b["Width"], let bh = b["Height"], bw >= 200, bh >= 150 else { continue }
      /* the overlay is a stage on the main display only: a window on another
         screen is a target the actor cannot reach, so it is not offered */
      let rect = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: bw, height: bh)
      guard stage.intersects(rect) else { continue }
      var item: [String: Any] = [
        "app": w[kCGWindowOwnerName as String] as? String ?? "?",
        "x": Int(b["X"] ?? 0), "y": Int(b["Y"] ?? 0), "w": Int(bw), "h": Int(bh)
      ]
      if let name = w[kCGWindowName as String] as? String, !name.isEmpty { item["title"] = name }
      out.append(item)
    }
  }
  let data = try! JSONSerialization.data(withJSONObject: out)
  print(String(data: data, encoding: .utf8)!)
  exit(0)
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.run()
