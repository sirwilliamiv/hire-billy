/* hire-billy overlay: a transparent, click-through, always-on-top window.
   The figure walks across the actual desktop, finds the Claude window via
   System Events (graceful fallback: bottom of screen), and sits on it. */
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');

function claudeBounds(cb) {
  execFile('osascript', ['-e',
    'tell application "System Events" to tell (first process whose name is "Claude") to get {position, size} of window 1'],
    { timeout: 4000 },
    (err, out) => {
      if (err) return cb(null);
      const n = String(out).match(/-?\d+/g);
      if (!n || n.length < 4) return cb(null);
      cb({ x: +n[0], y: +n[1], w: +n[2], h: +n[3] });
    });
}

app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    transparent: true, frame: false, resizable: false, movable: false,
    hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  /* interactivity: renderer reports hot rects; main polls the cursor and
     flips click-through off only while the cursor is inside one */
  let rects = [];
  ipcMain.on('rects', (e, r) => { rects = r || []; });
  let interactive = false;
  setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const hit = rects.some(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (hit !== interactive) {
      interactive = hit;
      win.setIgnoreMouseEvents(!hit, { forward: true });
    }
  }, 120);

  ipcMain.on('quit', () => app.quit());

  /* answers come from the shared pipeline, in this very process */
  ipcMain.handle('ask', async (e, q) => {
    const { runPipeline } = await import('../core/pipeline.js');
    const r = await runPipeline(String(q || ''));
    const { kind, lede, rest, sources, flags, struck, receipt, trace } = r;
    return { kind, lede, rest, sources, flags, struck, receipt, trace };
  });

  win.webContents.on('console-message', (e, level, msg) => console.log('[renderer]', msg));
  win.webContents.on('did-fail-load', (e, code, desc) => console.log('[fail-load]', code, desc));
  win.webContents.on('did-finish-load', () => console.log('[loaded] bounds', JSON.stringify(d.bounds)));
  claudeBounds(b => {
    console.log('[claude window]', JSON.stringify(b));
    const q = { screenW: String(d.bounds.width), screenH: String(d.bounds.height) };
    if (b) q.claude = JSON.stringify(b);
    win.loadFile('overlay.html', { query: q });
  });
});
app.on('window-all-closed', () => app.quit());
