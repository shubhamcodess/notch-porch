// Notch Porch — main process.
// Owns the transparent notch window, discovers widgets in ./widgets, and
// gives each widget's optional main-side module a small, namespaced API.

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
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
let resourceLabel = 'Normal';
let resourceHeavy = false;

// ---------- settings (persisted in ~/Library/Application Support/notch-porch) ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { theme: 'dark', accent: '#ff375f', notchWidth: 200, adblock: true, lastWidget: null };
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
      menuItems: [] // widgets can push tray menu items here
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
function geometry() {
  const d = screen.getPrimaryDisplay();
  const menuBar = d.workArea.y - d.bounds.y;          // ~37–38px on notched Macs, ~24–25 otherwise
  const hasNotch = menuBar >= 32;
  return {
    display: d,
    x: d.bounds.x + Math.round((d.bounds.width - WIN_W) / 2),
    y: d.bounds.y,
    notch: { hasNotch, width: hasNotch ? settings.notchWidth : 0, height: hasNotch ? menuBar : 0, menuBar }
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

  const reposition = () => { if (!shell || shell.isDestroyed()) return; const n = geometry(); shell.setPosition(n.x, n.y); shell.webContents.send('shell:geometry', n.notch); };
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
}

// ---------- tray (the app has no Dock icon) ----------
function buildTray(widgets) {
  const icon = (n) => nativeImage.createFromPath(path.join(ROOT, 'assets', `leaf-${n}.png`));
  const leaves = { green: icon('green'), yellow: icon('yellow') };
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('◐');
  const rebuild = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setToolTip(`Notch Porch — ${resourceLabel}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: resourceLabel, enabled: false, icon: resourceHeavy ? leaves.yellow : leaves.green },
      { type: 'separator' },
      ...widgets.flatMap((w) => (w._menu?.length ? [{ label: w.name, enabled: false }, ...w._menu, { type: 'separator' }] : [])),
      {
        label: 'Theme', submenu: ['dark', 'glass', 'art'].map((t) => ({
          label: { dark: 'Dark', glass: 'Liquid glass', art: 'Album colors' }[t], type: 'radio', checked: settings.theme === t,
          click: () => { settings.theme = t; saveSettings(); shell?.webContents.send('shell:settings', settings); }
        }))
      },
      { label: 'Launch at login', type: 'checkbox', checked: login, click: () => { app.setLoginItemSettings({ openAtLogin: !login }); rebuild(); } },
      { type: 'separator' },
      { label: 'Reload dock', click: () => { if (!shell || shell.isDestroyed()) createShell(); else shell.reload(); } },
      { label: 'Quit Notch Porch', click: () => app.quit() }
    ]));
  };
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
    resourceLabel = heavy ? `Using significant resources — ${stats}` : `Normal — ${stats}`;
    rebuild();
  };
  tick();
  setInterval(tick, 5000);
}

// ---------- shell IPC ----------
ipcMain.on('shell:interactive', (_e, on) => {
  if (!shell) return;
  shell.setIgnoreMouseEvents(!on, { forward: true });
  if (!on && shell.isFocused() && !holdFocus) shell.blur();
});
ipcMain.handle('shell:hold', (_e, on) => { holdFocus = !!on; if (on && shell && !shell.isDestroyed()) { app.focus({ steal: true }); shell.focus(); } });
ipcMain.handle('shell:config', () => ({ widgets: listWidgets(), notch: geometry().notch, settings }));
ipcMain.handle('shell:setSetting', (_e, key, value) => { settings[key] = value; saveSettings(); return settings; });

// ---------- lifecycle ----------
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  const widgets = listWidgets();
  createShell();
  await setupWidgetMains(widgets);
  buildTray(widgets);
});
app.on('before-quit', () => { quitting = true; for (const fn of quitHooks) { try { fn(); } catch { /* ignore */ } } });
app.on('window-all-closed', (e) => e.preventDefault()); // stay alive as a menu-bar app
