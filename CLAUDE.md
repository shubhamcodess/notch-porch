# CLAUDE.md — Notch Porch

## What this is
A macOS menu-bar app (Electron) that lives in the MacBook notch as a widget dock. Collapsed, the active widget shows two small items beside the notch. Hovering opens a card, with one page per widget. The first widget is a YouTube Music player (hidden Chromium window + ad blocker + in-notch search). Public, MIT-licensed, distributed as an unsigned ad-hoc-signed arm64 DMG/zip via GitHub Releases.

## Run / build
```bash
npm install
npm start        # menu-bar pill icon, no Dock icon
npm run dist     # dist/Notch-Porch-arm64.dmg + .zip (ad-hoc signed by scripts/adhoc-sign.js)
```
Release: bump `version` in package.json, `git tag vX.Y.Z && git push --tags` — `.github/workflows/release.yml` builds on macos-14 and publishes the assets. Asset names are versionless on purpose (`releases/latest/download/…` URLs and scripts/install.sh depend on them).

## Layout
```
src/main/main.js      shell window, tray menu, resource monitor, settings, widget discovery
src/main/preload.js   contextBridge `window.notch` — only "shell:*" and "w:<id>:*" channels
src/renderer/         index.html, styles.css (tokens, themes dark/glass/art), renderer.js (hover, pages, click-through)
widgets/<id>/         manifest.json { name, order, renderer, main?, enabled? }, widget.js, optional main.js
widgets/_example/     starter widget (clock); folders starting with "_" are ignored
assets/               tray leaf icons    build/  app icon (.icns)    scripts/  install.sh, adhoc-sign.js
```
User data: `~/Library/Application Support/notch-porch/` (settings.json, `persist:ytmusic` session, optional cookies.json). Migrated once from the old `notch-dock` folder.

## Widget contract (don't break it)
- Renderer `api`: `invoke`, `on` (auto-namespaced `w:<id>:*`), `setActivity(bool)`, `setPalette(colors|null)`, `hold(bool)`, `setHeight(px|null)`, `settings`, `open()`.
- Main `ctx`: `handle`, `send`, `settings`, `userData`, `quitting()`, `onQuit(fn)`, `menuItems[]`.
- Adding a widget = adding a folder, no core changes.

## Key mechanics
- 620×320 transparent `type:'panel'` window, always-on-top at `screen-saver` level, all Spaces, top centre of primary display. Click-through via `setIgnoreMouseEvents(true,{forward:true})`; the renderer hit-tests the pill and sends `shell:interactive`.
- Notch detected from menu-bar height (>= 32px). Width from `notchWidth` setting (default 200).
- Re-inserting DOM nodes restarts CSS animations — `renderCompact` and `setActivity` are guarded for that reason (album art spin).
- Music: hidden `BrowserWindow` on `persist:ytmusic` with a Chrome UA; state polled 1/s via `executeJavaScript` (mediaSession + DOM selectors). Search uses the `youtubei/v1/search` web API from the main process; playing a result loads `watch?v=ID` (needs `will-prevent-unload` handled and `autoplayPolicy: 'no-user-gesture-required'`).
- Signing: `mac.identity: null` + `scripts/adhoc-sign.js` (afterPack). Never sign with a keychain identity; Apple Silicon needs the ad-hoc seal or the app won't launch.

## Design language (keep it)
System font (`-apple-system`), Apple-style compact controls, easing `cubic-bezier(.32,.72,0,1)`, accent `#ff375f`. Every theme fades to pure black at the top so the card merges with the notch. No emoji in the UI; inline stroke/fill SVG icons.

## Rules
- Keep `contextIsolation: true`, `nodeIntegration: false`, and the IPC allow-list in preload.js.
- No secrets, cookies or `cookies.json` in git.
- Don't add signing/notarization work unless the owner has an Apple Developer account and asks.
