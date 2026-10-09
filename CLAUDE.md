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
- Main `ctx`: `handle`, `send`, `settings`, `userData`, `quitting()`, `onQuit(fn)`, `menu(fn)` (dynamic tray items: every widget gets its own tray submenu named after its manifest; `fn` is re-run on each rebuild so checkmarks stay current), `menuItems[]` (static items), `setSetting(key, value)` (persist + broadcast).
- Adding a widget = adding a folder, no core changes.

## Key mechanics
- 620×320 transparent `type:'panel'` window, always-on-top at `screen-saver` level, all Spaces, top centre of primary display. Click-through via `setIgnoreMouseEvents(true,{forward:true})`; the renderer hit-tests the pill and sends `shell:interactive`.
- Notch detected from menu-bar height (>= 32px). Exact size comes from `menubar-watch --notch` (NSScreen auxiliary areas: 185×32 on a 16" MBP); `notchWidth` setting is only a fallback. We draw NO black notch shape — the hardware notch is already black and anything we draw there overhangs it.
- Re-inserting DOM nodes restarts CSS animations — `renderCompact` and `setActivity` are guarded for that reason (album art spin).
- Music: hidden `BrowserWindow` on `persist:ytmusic` with a Chrome UA; state polled 1/s via `executeJavaScript` (mediaSession + DOM selectors). Search uses the `youtubei/v1/search` web API from the main process; playing a result loads `watch?v=ID` (needs `will-prevent-unload` handled and `autoplayPolicy: 'no-user-gesture-required'`).
- Live equalizer: `widgets/music/audio-probe.js` is injected into the hidden page and taps the `<video>` with a Web Audio analyser (`window.__notchBands()` → 4 band levels). Main polls it every 70 ms only while playing and sends `levels`; the widget drives the bars (`--lv`) and `api.setBeat()` (`--beat`). Taps on MediaStream-backed elements return silence in Chrome, which is fine for YT Music (MSE/blob). Sleep mode (`sleepMinutes` setting) lives in the widget and uses `api.onOpen`.
- App-menu collision: `native/menubar-watch.m` (clang, built by `npm run build:native`, auto on `npm start`/`dist`, shipped via extraResources) prints the right edge of the frontmost app's menu titles using the AX API. Main converts it to `gap` px before the notch and sends `shell:menubar`; the renderer adds `.tuck-left` (left slot rolls into the notch area, where the hardware hides it) with hysteresis, and `inside()` ignores the strip left of the notch while tucked so clicks reach the menu bar. Needs Accessibility; asked once (`menuAvoidAsked`). `NOTCH_DEBUG=1` enables `shell:menubar-debug` to simulate gaps. Swift can't be used here: this machine's CLT has a duplicate SwiftBridging modulemap.
- Right side: the helper also prints `{"statusLeft":x}` (leftmost status-item window, layer 25, no permission needed). Main sends `{gap, gapR}`; renderer toggles `.tuck-left` / `.tuck-right` independently. Both tucked + `api.setPlaying(true)` → `body.line-on` shows `.pulse-line` (colour `--art-vivid` from the cover palette, 3rd palette entry).
- Lyrics: `widgets/music/lyrics.js` (main process) searches LRCLIB fuzzily and accepts a result only if title similarity ≥ .6, duration within 6 s, and an artist overlap (or near-identical title + duration), and the version words (remix/slowed/acoustic/live…) must match exactly — wrong lyrics are worse than none. Candidates written in Latin letters are preferred (`latinShare`); no transliteration package on purpose (owner wants lyrics straight from LRCLIB). Cache key is versioned (`v5|`): bump it when matching rules change. The widget gets the exact `video.currentTime` ~14×/s via the `levels` event, so lyrics stay in sync through seeks. Cache in `userData/lyrics/`. The widget fetches once the duration is known, syncs lines against `state.t` + a local clock, swaps the artist line (`lyrics` setting) and/or calls `api.setCaption()` (`lyricsSubtitle`, shell-owned pill under the notch, hidden while the card is open and during instrumental gaps).
- Signing: `mac.identity: null` + `scripts/adhoc-sign.js` (afterPack). Never sign with a keychain identity; Apple Silicon needs the ad-hoc seal or the app won't launch.

## Design language (keep it)
System font (`-apple-system`), Apple-style compact controls, easing `cubic-bezier(.32,.72,0,1)`, accent `#ff375f`. Every theme fades to pure black at the top so the card merges with the notch. No emoji in the UI; inline stroke/fill SVG icons.

## Rules
- Keep `contextIsolation: true`, `nodeIntegration: false`, and the IPC allow-list in preload.js.
- No secrets, cookies or `cookies.json` in git.
- Don't add signing/notarization work unless the owner has an Apple Developer account and asks.
