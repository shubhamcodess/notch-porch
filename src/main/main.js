// Notch Porch — main process.
// Owns the transparent notch window, discovers widgets in ./widgets, and
// gives each widget's optional main-side module a small, namespaced API.

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const WIDGETS_DIR = path.join(ROOT, 'widgets');

// Fixed data folder (same in dev and packaged builds). Migrate from the pre-rename "notch-dock" folder once.
const dataDir = path.join(app.getPath('appData'), 'notch-porch');
const legacyDir = path.join(app.getPath('appData'), 'notch-dock');
if (!fs.existsSync(dataDir) && fs.existsSync(legacyDir)) { try { fs.renameSync(legacyDir, dataDir); } catch { /* keep going with a fresh folder */ } }
app.setPath('userData', dataDir);
const WIN_W = 620;   // window is bigger than the pill; the empty area is click-through
const WIN_H = 320;

let shell = null;
let tray = null;
let quitting = false;
let holdFocus = false;
const quitHooks = [];
let menuProc = null;
let menuTrusted = true;   // false while the helper reports missing Accessibility access
let lastMenuRight = null;
let lastStatusLeft = null;
let rebuildTray = () => {};
let resourceStats = '';
let resourceHeavy = false;

// ---------- settings (persisted in ~/Library/Application Support/notch-porch) ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { theme: 'dark', accent: '#ff375f', notchWidth: 200, adblock: true, sleepMinutes: 5, menuAvoid: true, menuAvoidAsked: false, lyrics: false, lyricsSubtitle: false, lastWidget: null };
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; } catch { /* first run */ }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

// ---------- widget discovery ----------
function listWidgets() {
  return fs.readdirSync(WIDGETS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(WIDGETS_DIR, d.name, 'manifest.json')))
    .map((d) => ({ ...JSON.parse(fs.readFileSync(path.join(WIDGETS_DIR, d.name, 'manifest.json'), 'utf8')), id: d.name }))
    .filter((w) => w.enabled !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

async function setupWidgetMains(widgets) {
  for (const w of widgets) {
    if (!w.main) continue;
    const mod = require(path.join(WIDGETS_DIR, w.id, w.main));
    const ns = `w:${w.id}:`;
    const ctx = {
      id: w.id,
      settings,
      userData: app.getPath('userData'),
      quitting: () => quitting,
      onQuit: (fn) => quitHooks.push(fn),
      handle: (name, fn) => ipcMain.handle(ns + name, (_e, ...args) => fn(...args)),
      send: (name, data) => { if (shell && !shell.isDestroyed()) shell.webContents.send(ns + name, data); },
      menuItems: [], // static tray items (shown in the widget's submenu)
      menu: (fn) => { w._menuFn = fn; },            // dynamic items: fn() is called every time the tray menu is rebuilt
      setSetting: (key, value) => { settings[key] = value; saveSettings(); shell?.webContents.send('shell:settings', settings); rebuildTray(); }
    };
    try {
      await mod.setup(ctx);
      w._menu = ctx.menuItems;
    } catch (e) {
      console.error(`[widget ${w.id}] setup failed:`, e);
    }
  }
}

// ---------- notch geometry ----------
// Exact hardware notch size (points) from the native helper; null on Macs without a notch or without the helper.
let detectedNotch = null;
function detectNotch() {
  try {
    const j = JSON.parse(execFileSync(menuBin(), ['--notch'], { timeout: 2000 }).toString());
    detectedNotch = j.notchWidth > 0 ? { w: j.notchWidth, h: j.notchHeight } : null;
  } catch { detectedNotch = null; }
}

function geometry() {
  const d = screen.getPrimaryDisplay();
  const menuBar = d.workArea.y - d.bounds.y;          // ~37–38px on notched Macs, ~24–25 otherwise
  const hasNotch = menuBar >= 32;
  return {
    display: d,
    x: d.bounds.x + Math.round((d.bounds.width - WIN_W) / 2),
    y: d.bounds.y,
    notch: { hasNotch, width: hasNotch ? (detectedNotch?.w ?? settings.notchWidth) : 0, height: hasNotch ? (detectedNotch?.h ?? menuBar) : 0, menuBar }
  };
}

function createShell() {
  const g = geometry();
  shell = new BrowserWindow({
    x: g.x, y: g.y, width: WIN_W, height: WIN_H,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, skipTaskbar: true, alwaysOnTop: true, enableLargerThanScreen: true,
    type: 'panel',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  shell.setAlwaysOnTop(true, 'screen-saver');            // above the menu bar
  shell.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  shell.setPosition(g.x, g.y);                            // re-assert: macOS may push it under the menu bar
  shell.setIgnoreMouseEvents(true, { forward: true });    // click-through until the cursor is on the pill
  shell.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  shell.on('closed', () => { shell = null; });
  shell.webContents.on('render-process-gone', (_e, d) => console.error('[shell] renderer gone:', d.reason));

  const reposition = () => { if (!shell || shell.isDestroyed()) return; detectNotch(); const n = geometry(); shell.setPosition(n.x, n.y); shell.webContents.send('shell:geometry', n.notch); sendMenubar(); };
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
}

// ---------- tray (the app has no Dock icon) ----------
function buildTray(widgets) {
  const icon = (n) => nativeImage.createFromPath(path.join(ROOT, 'assets', `leaf-${n}.png`));
  const leaves = { green: icon('green'), yellow: icon('yellow') };
  const trayIcon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'trayTemplate.png'));
  trayIcon.setTemplateImage(true); // macOS tints it for light/dark menu bars
  tray = new Tray(trayIcon);
  const rebuild = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setToolTip(`Notch Porch — ${resourceHeavy ? 'using significant resources' : 'running normally'}`);
    const save = () => { saveSettings(); shell?.webContents.send('shell:settings', settings); };
    // every widget gets its own submenu named after it
    const widgetMenus = widgets.map((w) => ({ label: w.name, submenu: [...(w._menu || []), ...(w._menuFn ? w._menuFn() : [])] })).filter((m) => m.submenu.length);
    const grantAccess = () => { startMenuWatch(true); require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); };
    const template = [
      { label: resourceHeavy ? 'Using significant resources' : 'Running normally', sublabel: resourceStats, enabled: false, icon: resourceHeavy ? leaves.yellow : leaves.green },
      { type: 'separator' },
      ...widgetMenus,
      {
        label: 'Theme', submenu: ['dark', 'glass', 'art'].map((t) => ({
          label: { dark: 'Dark', glass: 'Liquid glass', art: 'Album colors' }[t], type: 'radio', checked: settings.theme === t,
          click: () => { settings.theme = t; save(); }
        }))
      },
      {
        label: 'Settings', submenu: [
          {
            label: 'Make room for app menus', type: 'checkbox', checked: settings.menuAvoid !== false,
            click: (item) => {
              settings.menuAvoid = item.checked; save();
              if (item.checked) startMenuWatch(true); else { stopMenuWatch(); sendMenubar(null); }
              rebuild();
            }
          },
          ...(settings.menuAvoid !== false && !menuTrusted ? [{ label: 'Allow Accessibility access…', click: grantAccess }] : []),
          { label: 'Launch at login', type: 'checkbox', checked: login, click: () => { app.setLoginItemSettings({ openAtLogin: !login }); rebuild(); } }
        ]
      },
      { type: 'separator' },
      { label: 'Reload dock', click: () => { if (!shell || shell.isDestroyed()) createShell(); else shell.reload(); } },
      { label: 'Quit Notch Porch', click: () => app.quit() }
    ];
    if (process.env.NOTCH_DEBUG) { const tree = (m) => m.map((i) => i.type === 'separator' ? '---' : i.label + (i.checked ? ' [x]' : '') + (i.submenu ? ' > (' + tree(i.submenu).join(' | ') + ')' : '')); console.log('[menu]', tree(template).join('\n       ')); }
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };
  rebuildTray = rebuild;
  rebuild();
  startResourceMonitor(rebuild);
}

// ---------- resource monitor (leaf icon: green = normal, yellow = heavy) ----------
function startResourceMonitor(rebuild) {
  const samples = [];
  const tick = () => {
    const m = app.getAppMetrics();
    const cpu = m.reduce((a, p) => a + (p.cpu?.percentCPUUsage || 0), 0);
    const memMB = m.reduce((a, p) => a + (p.memory?.workingSetSize || 0), 0) / 1024;
    samples.push(cpu); if (samples.length > 6) samples.shift();
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    let onBattery = false;
    try { onBattery = powerMonitor.isOnBatteryPower(); } catch { /* unsupported */ }
    const heavy = avg > 20 || memMB > 1200 || (onBattery && avg > 10);
    const mem = memMB >= 1024 ? `${(memMB / 1024).toFixed(1)} GB` : `${Math.round(memMB)} MB`;
    const stats = `${mem} · CPU ${Math.round(avg)}%${onBattery ? ' · on battery' : ''}`;
    resourceHeavy = heavy;
    resourceStats = stats;
    rebuild();
  };
  tick();
  setInterval(tick, 5000);
}

// ---------- app-menu collision (native helper reads the frontmost app's menu extent) ----------
const menuBin = () => (app.isPackaged ? path.join(process.resourcesPath, 'menubar-watch') : path.join(ROOT, 'build', 'menubar-watch'));

function sendMenubar(right, status) {
  if (right !== undefined) lastMenuRight = right;
  if (status !== undefined) lastStatusLeft = status;
  if (!shell || shell.isDestroyed()) return;
  const g = geometry();
  if (!g.notch.hasNotch) return void shell.webContents.send('shell:menubar', { gap: null, gapR: null });
  const cx = g.display.bounds.x + g.display.bounds.width / 2, half = g.notch.width / 2;
  shell.webContents.send('shell:menubar', {
    gap: lastMenuRight == null ? null : cx - half - lastMenuRight,     // free px between app menus and the notch
    gapR: lastStatusLeft == null ? null : lastStatusLeft - (cx + half)  // free px between the notch and the status icons
  });
}
function stopMenuWatch() { if (menuProc) { menuProc.kill(); menuProc = null; } }
function startMenuWatch(prompt = false) {
  stopMenuWatch();
  if (settings.menuAvoid === false || !fs.existsSync(menuBin())) return;
  const proc = spawn(menuBin(), prompt ? ['--prompt'] : []);
  menuProc = proc;
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        if ('statusLeft' in m) { sendMenubar(undefined, m.statusLeft); continue; }
        const was = menuTrusted;
        menuTrusted = !('trusted' in m);
        sendMenubar(menuTrusted ? m.right : null);
        if (was !== menuTrusted) rebuildTray();
      } catch { /* ignore partial lines */ }
    }
  });
  proc.on('error', () => { menuProc = null; });
  proc.on('exit', () => { if (menuProc === proc) menuProc = null; });
}

// ---------- shell IPC ----------
ipcMain.on('shell:interactive', (_e, on) => {
  if (!shell) return;
  shell.setIgnoreMouseEvents(!on, { forward: true });
  if (!on && shell.isFocused() && !holdFocus) shell.blur();
});
ipcMain.handle('shell:hold', (_e, on) => { holdFocus = !!on; if (on && shell && !shell.isDestroyed()) { app.focus({ steal: true }); shell.focus(); } });
// test hook: lets a debugger simulate an app whose menus reach `gap` px short of the notch
ipcMain.handle('shell:menubar-debug', (_e, m) => { if (process.env.NOTCH_DEBUG && shell) shell.webContents.send('shell:menubar', m); });
ipcMain.handle('shell:config', () => ({ widgets: listWidgets(), notch: geometry().notch, settings }));
ipcMain.handle('shell:setSetting', (_e, key, value) => { settings[key] = value; saveSettings(); return settings; });

// ---------- lifecycle ----------
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  detectNotch();
  const widgets = listWidgets();
  createShell();
  await setupWidgetMains(widgets);
  buildTray(widgets);
  if (settings.menuAvoid !== false) {
    const first = !settings.menuAvoidAsked;           // show the macOS permission dialog once
    if (first) { settings.menuAvoidAsked = true; saveSettings(); }
    startMenuWatch(first);
  }
});
app.on('before-quit', () => { quitting = true; stopMenuWatch(); for (const fn of quitHooks) { try { fn(); } catch { /* ignore */ } } });
app.on('window-all-closed', (e) => e.preventDefault()); // stay alive as a menu-bar app
