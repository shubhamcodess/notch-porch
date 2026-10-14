// Update checking and in-place installing, straight from the project's GitHub releases.
// Check -> download the release zip -> verify it -> swap the app bundle after quitting -> relaunch.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const REPO = 'shubhamcodess/notch-porch';
const { isWin } = require('./platform');
const ASSET = isWin ? 'Notch-Porch-Setup-x64.exe' : 'Notch-Porch-arm64.zip';
const APP_ID = 'com.shubhamcodess.notchporch';
const UA = 'NotchPorch-Updater (+https://github.com/shubhamcodess/notch-porch)';

const parse = (v) => String(v).replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
function isNewer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
}

async function fetchLatest() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const r = await res.json();
  const a = (r.assets || []).find((x) => x.name === ASSET);
  return {
    version: String(r.tag_name || '').replace(/^v/i, ''),
    page: r.html_url,
    asset: a ? { url: a.browser_download_url, size: a.size, digest: a.digest || null } : null
  };
}

async function download(asset, dest, onProgress) {
  const res = await fetch(asset.url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = asset.size || Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(dest);
  let got = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (total) onProgress?.(Math.min(1, got / total));
  }
  await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve); });
  if (asset.size && got !== asset.size) throw new Error('The download was incomplete');
  if (asset.digest && asset.digest.startsWith('sha256:') && asset.digest.slice(7) !== hash.digest('hex')) {
    throw new Error('The download did not match its published checksum');
  }
}

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, (e, so, se) => (e ? reject(new Error((se || e.message).trim())) : resolve(so))));

// unpack and check that this really is the app we expect, at the version we expect, with an intact seal
async function prepare(zip, workDir, expectVersion) {
  if (isWin) {                      // the installer was already checked against its published size + sha256 by download()
    if (!fs.existsSync(zip) || fs.statSync(zip).size < 1e6) throw new Error('The installer did not download properly');
    return zip;
  }
  const out = path.join(workDir, 'extracted');
  fs.mkdirSync(out, { recursive: true });
  await run('/usr/bin/ditto', ['-x', '-k', zip, out]);
  const app = path.join(out, 'Notch Porch.app');
  if (!fs.existsSync(app)) throw new Error('The update did not contain the app');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const plist = path.join(app, 'Contents', 'Info.plist');
  const read = async (key) => (await run('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, plist])).trim();
  if ((await read('CFBundleIdentifier')) !== APP_ID) throw new Error('The update is not Notch Porch');
  if ((await read('CFBundleShortVersionString')) !== expectVersion) throw new Error('The update has an unexpected version');
  return app;
}

// after we quit: move the new bundle into place (keeping the old one until it worked), then open it
function swapAndRelaunch(newApp, destApp, workDir) {
  if (isWin) {                      // silent per-user install over the old one; --force-run reopens the app afterwards
    const script = path.join(workDir, 'swap.cmd');
    fs.writeFileSync(script, `@echo off\r\nping -n 3 127.0.0.1 >nul\r\n"${newApp}" /S --updated --force-run\r\n`);
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  const script = path.join(workDir, 'swap.sh');
  fs.writeFileSync(script, `#!/bin/bash
PID="$1"; NEW="$2"; DEST="$3"; BACKUP="$DEST.previous"
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
rm -rf "$BACKUP"
if mv "$DEST" "$BACKUP" && mv "$NEW" "$DEST"; then
  xattr -cr "$DEST" 2>/dev/null
  rm -rf "$BACKUP"
else
  rm -rf "$DEST" 2>/dev/null
  [ -d "$BACKUP" ] && mv "$BACKUP" "$DEST"
fi
open "$DEST"
`, { mode: 0o755 });
  spawn('/bin/bash', [script, String(process.pid), newApp, destApp], { detached: true, stdio: 'ignore' }).unref();
}

module.exports = { fetchLatest, isNewer, download, prepare, swapAndRelaunch, ASSET };
