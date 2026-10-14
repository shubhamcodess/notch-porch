// Notch Porch — main process.
// Owns the transparent notch window, discovers widgets in ./widgets, and
// gives each widget's optional main-side module a small, namespaced API.

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor, Notification } = require('electron');
const os = require('os');
const { EventEmitter } = require('events');
const updater = require('./updater');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { isMac, isWin } = require('./platform');
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
// a tiny message bus so widgets can cooperate without importing each other (a widget that nobody listens to is inert)
const bus = new EventEmitter();
bus.setMaxListeners(50);
let holdFocus = false;
const quitHooks = [];
let menuProc = null;
let menuTrusted = true;   // false while the helper reports missing Accessibility access
let lastMenuRight = null;
let lastStatusLeft = null;
let rebuildTray = () => {};
let menuOpen = false, menuDirty = false;
let resourceStats = '';
let resourceHeavy = false;

// ---------- settings (persisted in ~/Library/Application Support/notch-porch) ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { theme: 'dark', accent: '#ff375f', notchWidth: 200, adblock: true, sleepMinutes: 5, menuAvoid: true, menuAvoidAsked: false, lyrics: false, lyricsSubtitle: false, autoUpdateCheck: true, roomsEnabled: true, lastUpdateCheck: 0, updateInfo: null, notifiedVersion: null, lastWidget: null };
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
    .filter((w) => w.enabled !== false && (!w.setting || settings[w.setting] !== false))   // "setting": a settings key that switches the widget on/off
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

async function setupWidgetMains(widgets) {
  // all widgets start together: one slow setup (the music player's ad blocker download, say) must not hold back
  // another widget's handlers, or its page would sit waiting
  await Promise.all(widgets.map(async (w) => {
    if (!w.main) return;
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
      bus: { emit: (name, data) => bus.emit(name, data), on: (name, fn) => bus.on(name, fn) },   // cross-widget events
      menuItems: [], // static tray items (shown in the widget's submenu)
      menu: (fn) => { w._menuFn = fn; },            // dynamic items: fn() is called every time the tray menu is rebuilt
      rebuildMenu: () => rebuildTray(),
      setSetting: (key, value) => { settings[key] = value; saveSettings(); shell?.webContents.send('shell:settings', settings); rebuildTray(); }
    };
    try {
      await mod.setup(ctx);
      w._menu = ctx.menuItems;
    } catch (e) {
      console.error(`[widget ${w.id}] setup failed:`, e);
    }
  }));
}

// ---------- notch geometry ----------
// Exact hardware notch size (points) from the native helper; null on Macs without a notch or without the helper.
let detectedNotch = null;
function detectNotch() {
  if (!isMac) { detectedNotch = null; return; }
  try {
    const j = JSON.parse(execFileSync(menuBin(), ['--notch'], { timeout: 2000 }).toString());
    detectedNotch = j.notchWidth > 0 ? { w: j.notchWidth, h: j.notchHeight } : null;
  } catch { detectedNotch = null; }
}

function geometry() {
  const d = screen.getPrimaryDisplay();
  const menuBar = d.workArea.y - d.bounds.y;          // ~37–38px on notched Macs, ~24–25 otherwise
  const hasNotch = isMac && menuBar >= 32;      // Windows/Linux have no notch: the dock is a small pill
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
    ...(isMac ? { type: 'panel' } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  shell.setAlwaysOnTop(true, 'screen-saver');            // above the menu bar
  if (isMac) shell.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  shell.setPosition(g.x, g.y);                            // re-assert: macOS may push it under the menu bar
  shell.setIgnoreMouseEvents(true, { forward: true });    // click-through until the cursor is on the pill
  shell.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  shell.on('closed', () => { shell = null; });
  // while a widget holds the card open (typing in search), a click anywhere else takes focus away: let the card close
  shell.on('blur', () => { if (holdFocus) { holdFocus = false; shell.webContents.send('shell:blur'); } });
  shell.webContents.on('render-process-gone', (_e, d) => console.error('[shell] renderer gone:', d.reason));

  const reposition = () => { if (!shell || shell.isDestroyed()) return; detectNotch(); const n = geometry(); shell.setPosition(n.x, n.y); shell.webContents.send('shell:geometry', n.notch); sendMenubar(); };
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
}

// ---------- tray (the app has no Dock icon) ----------
// ---------- updates ----------
const upd = { phase: 'idle', info: null, progress: 0, error: null };   // idle | checking | available | downloading | installing | error
const currentVersion = () => process.env.NOTCH_FAKE_VERSION || app.getVersion();
const DAY = 24 * 3600 * 1000;

async function checkForUpdates(manual = false) {
  if (['checking', 'downloading', 'installing'].includes(upd.phase)) return;
  upd.phase = 'checking'; upd.error = null; rebuildTray();
  try {
    const latest = await updater.fetchLatest();
    settings.lastUpdateCheck = Date.now();
    if (latest.version && updater.isNewer(latest.version, currentVersion())) {
      upd.info = latest; upd.phase = 'available';
      settings.updateInfo = latest;
      if (settings.notifiedVersion !== latest.version) {            // tell the user once per version
        settings.notifiedVersion = latest.version;
        if (!manual) notify('Update available', `Notch Porch v${latest.version} is ready. Open the menu-bar icon to update.`);   // a manual check reports below
      }
    } else { upd.info = null; upd.phase = 'idle'; settings.updateInfo = null; }
    saveSettings();
  } catch (e) {
    upd.phase = manual ? 'error' : 'idle';
    upd.error = e.message;
  }
  rebuildTray();
  if (manual) await showCheckResult();
}

const notify = (title, body) => { try { new Notification({ title, body, silent: true }).show(); } catch { /* notifications are optional */ } };

// the menu closes when you click "Check for updates", so say what happened (a quiet banner, not a dialog)
async function showCheckResult() {
  if (upd.phase === 'available') notify('Update available', `Notch Porch v${upd.info.version} is ready. Open the menu-bar icon to update.`);
  else if (upd.phase === 'error') notify("Couldn't check for updates", upd.error || 'Please try again in a moment.');
  else notify("You're up to date", `Notch Porch v${currentVersion()} is the latest version.`);
}

async function installUpdate() {
  const info = upd.info;
  if (!info || ['downloading', 'installing', 'checking'].includes(upd.phase)) return;
  const dest = path.resolve(process.execPath, '..', '..', '..');
  // a dev run, or a folder we can't write to: open the release page instead of half-installing
  let writable = false;
  try { fs.accessSync(path.dirname(dest), fs.constants.W_OK); writable = true; } catch { /* needs admin */ }
  const installable = isWin ? true : (writable && dest.endsWith('.app'));   // Windows: the per-user installer needs no admin
  if (!app.isPackaged || !info.asset || !installable) {
    require('electron').shell.openExternal(info.page || 'https://github.com/shubhamcodess/notch-porch/releases/latest');
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-porch-update-'));
  try {
    upd.phase = 'downloading'; upd.progress = 0; rebuildTray();
    const zip = path.join(work, updater.ASSET);
    let last = 0;
    await updater.download(info.asset, zip, (p) => { if (p - last >= 0.02) { last = p; upd.progress = p; rebuildTray(); } });
    upd.phase = 'installing'; rebuildTray();
    const fresh = await updater.prepare(zip, work, info.version);
    updater.swapAndRelaunch(fresh, dest, work);
    app.quit();                                                  // the swap script waits for us to exit, then relaunches
  } catch (e) {
    upd.phase = 'error'; upd.error = e.message; rebuildTray();
    fs.rmSync(work, { recursive: true, force: true });
    notify('The update could not be installed', `${e.message}. Your current version is untouched.`);
  }
}

// the entry that reflects where the update flow is; reused at the top level and in Settings
function updateItem() {
  const ver = upd.info?.version;
  switch (upd.phase) {
    case 'checking': return { label: 'Checking…', enabled: false };
    case 'available': return { label: `Update to v${ver}`, sublabel: `Installs and restarts`, click: installUpdate };
    case 'downloading': return { label: `Downloading v${ver}… ${Math.round(upd.progress * 100)}%`, enabled: false };
    case 'installing': return { label: 'Installing…', enabled: false };
    case 'error': return { label: 'Update failed', sublabel: 'Tap to retry', click: () => checkForUpdates(true) };
    default: return { label: 'Check for updates', sublabel: settings.lastUpdateCheck ? `v${currentVersion()} · up to date` : `v${currentVersion()}`, click: () => checkForUpdates(true) };
  }
}

function startUpdateSchedule() {
  if (settings.updateInfo && updater.isNewer(settings.updateInfo.version, currentVersion())) { upd.info = settings.updateInfo; upd.phase = 'available'; rebuildTray(); }
  else settings.updateInfo = null;
  const due = () => settings.autoUpdateCheck !== false && Date.now() - (settings.lastUpdateCheck || 0) > DAY;
  setTimeout(() => { if (due()) checkForUpdates(false); }, 20000);   // a little after launch, not during it
  setInterval(() => { if (due()) checkForUpdates(false); }, 3600 * 1000);
}

function buildTray(widgets) {
  const icon = (n) => nativeImage.createFromPath(path.join(ROOT, 'assets', `leaf-${n}.png`));
  const leaves = { green: icon('green'), yellow: icon('yellow') };
  const trayIcon = nativeImage.createFromPath(path.join(ROOT, 'assets', isWin ? 'tray-win.png' : 'trayTemplate.png'));
  if (isMac) trayIcon.setTemplateImage(true); // macOS tints it for light/dark menu bars
  tray = new Tray(trayIcon);
  const rebuild = () => {
    if (menuOpen) { menuDirty = true; return; }       // replacing a menu under the user's cursor makes it collapse
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setToolTip(`Notch Porch — ${resourceHeavy ? 'using significant resources' : 'running normally'}${upd.phase === 'available' ? ` · update v${upd.info.version} available` : ''}`);
    const wantTitle = upd.phase === 'available' ? ' •' : '';   // a small dot next to the icon when there is an update
    if (isMac && tray.getTitle() !== wantTitle) tray.setTitle(wantTitle);
    const save = () => { saveSettings(); shell?.webContents.send('shell:settings', settings); };
    // every widget gets its own submenu named after it
    const widgetMenus = widgets.map((w) => ({ label: w.name, submenu: [...(w._menu || []), ...(w._menuFn ? w._menuFn() : [])] })).filter((m) => m.submenu.length);
    const grantAccess = () => { startMenuWatch(true); require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); };
    const template = [
      { label: resourceHeavy ? 'Using significant resources' : 'Running normally', sublabel: resourceStats, enabled: false, icon: resourceHeavy ? leaves.yellow : leaves.green },
      { type: 'separator' },
      ...(['available', 'downloading', 'installing'].includes(upd.phase) ? [updateItem(), { type: 'separator' }] : []),
      ...widgetMenus,
      {
        label: 'Theme', submenu: ['dark', 'glass', 'art'].map((t) => ({
          label: { dark: 'Dark', glass: 'Liquid glass', art: 'Album colors' }[t], type: 'radio', checked: settings.theme === t,
          click: () => { settings.theme = t; save(); }
        }))
      },
      {
        label: 'Settings', submenu: [
          updateItem(),
          { label: 'Notify me of new versions', type: 'checkbox', checked: settings.autoUpdateCheck !== false, click: (item) => { settings.autoUpdateCheck = item.checked; save(); } },
          { type: 'separator' },
          ...(isMac ? [
          {
            label: 'Make room for app menus', type: 'checkbox', checked: settings.menuAvoid !== false,
            click: (item) => {
              settings.menuAvoid = item.checked; save();
              if (item.checked) startMenuWatch(true); else { stopMenuWatch(); sendMenubar(null); }
              rebuild();
            }
          },
          ...(settings.menuAvoid !== false && !menuTrusted ? [{ label: 'Allow Accessibility access…', click: grantAccess }] : []),
          ] : []),
          { label: 'Launch at login', type: 'checkbox', checked: login, click: () => { app.setLoginItemSettings({ openAtLogin: !login }); rebuild(); } }
        ]
      },
      { type: 'separator' },
      { label: 'Reload dock', click: () => { if (!shell || shell.isDestroyed()) createShell(); else shell.reload(); } },
      { label: 'Quit Notch Porch', click: () => app.quit() }
    ];
    if (process.env.NOTCH_DEBUG) { const tree = (m) => m.map((i) => i.type === 'separator' ? '---' : i.label + (i.checked ? ' [x]' : '') + (i.submenu ? ' > (' + tree(i.submenu).join(' | ') + ')' : '')); console.log('[menu]', tree(template).join('\n       ')); }
    if (!isMac) {                                     // sublabels are macOS-only: fold them into the label elsewhere
      const fold = (items) => items.forEach((i) => { if (i.sublabel) { i.label = `${i.label} (${i.sublabel})`; delete i.sublabel; } if (Array.isArray(i.submenu)) fold(i.submenu); });
      fold(template);
    }
    const menu = Menu.buildFromTemplate(template);
    menu.on('menu-will-show', () => { menuOpen = true; });
    menu.on('menu-will-close', () => { menuOpen = false; if (menuDirty) { menuDirty = false; setTimeout(rebuild, 150); } });
    tray.setContextMenu(menu);
  };
  rebuildTray = rebuild;
  rebuild();
  if (isWin) tray.on('click', () => tray.popUpContextMenu());   // Windows only opens the menu on right-click otherwise
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
  if (!isMac || settings.menuAvoid === false || !fs.existsSync(menuBin())) return;
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

// ---------- cursor watch (Windows/Linux) ----------
// A click-through window only gets forwarded mouse events while the OS cooperates; on Windows they stop after a
// while (focus moved elsewhere, fast exits) and mouseleave often never fires, so the card would stay open. Read
// the real cursor instead and hand it to the renderer, which runs the same hover logic on it. macOS is untouched.
let cursorTimer = null, lastCursor = '';
function startCursorWatch() {
  if (isMac || cursorTimer) return;
  cursorTimer = setInterval(() => {
    if (!shell || shell.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = shell.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    const inWin = x >= 0 && y >= 0 && x < b.width && y < b.height;
    const key = inWin ? `${x},${y}` : 'out';
    if (key === lastCursor) return;              // only on change: no traffic while the mouse is still or elsewhere
    lastCursor = key;
    shell.webContents.send('shell:cursor', inWin ? { x, y } : null);
  }, 60);
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
ipcMain.handle('shell:config', () => ({ widgets: listWidgets(), notch: geometry().notch, settings, platform: isWin ? 'win' : isMac ? 'mac' : 'linux' }));
ipcMain.handle('shell:setSetting', (_e, key, value) => { settings[key] = value; saveSettings(); return settings; });

// ---------- lifecycle ----------
// Windows: GPU compositing of a transparent, click-through window can paint it as an opaque white bar on some drivers
// (confirmed with --disable-gpu). Software rendering is plenty for this UI. NOTCH_GPU=1 opts back in.
if (isWin && !process.env.NOTCH_GPU) app.disableHardwareAcceleration();

const gotLock = app.requestSingleInstanceLock();           // a second launch (double-click, update relaunch) just exits
if (!gotLock) app.quit();

app.whenReady().then(async () => {
  if (!gotLock) return;
  if (isMac) app.dock.hide();
  loadSettings();
  detectNotch();
  const widgets = listWidgets();
  createShell();
  await setupWidgetMains(widgets);
  buildTray(widgets);
  startUpdateSchedule();
  startCursorWatch();
  if (isMac && settings.menuAvoid !== false) {
    const first = !settings.menuAvoidAsked;           // show the macOS permission dialog once
    if (first) { settings.menuAvoidAsked = true; saveSettings(); }
    startMenuWatch(first);
  }
});
app.on('before-quit', () => { quitting = true; stopMenuWatch(); for (const fn of quitHooks) { try { fn(); } catch { /* ignore */ } } });
app.on('window-all-closed', (e) => e.preventDefault()); // stay alive as a menu-bar app
