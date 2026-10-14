# How Notch Porch works

A short tour of the moving parts. For the visual language see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); for adding a page to the dock see [WIDGETS.md](WIDGETS.md).

## The idea in one picture

```
                    ┌────────────────────────── your screen ──────────────────────────┐
                    │              hardware notch                                      │
                    │   ( disc )  ▐█████████▌  ( bars )     ← collapsed: two items     │
                    │      ┌──────────────────────────┐                                │
   hover ───────►   │      │   card: title, lyrics,   │      ← opens on hover          │
                    │      │   progress, controls     │                                │
                    └──────┴──────────────────────────┴────────────────────────────────┘

  Electron main process ── owns the window, tray menu, settings, native helper
        │
        ├── shell window (transparent, click-through) ── renders the card UI
        └── hidden YouTube Music window ── the real player, controlled by script
```

Notch Porch is an Electron app. There are no Dock icon and no visible browser: one transparent window draws the card, and a second, hidden window runs YouTube Music.

## Folder structure

```
notch-porch/
├── src/
│   ├── main/
│   │   ├── main.js          window, tray menu, settings, resource monitor, widget loading
│   │   └── preload.js       the only bridge between the UI and the main process (an allow-list)
│   └── renderer/
│       ├── index.html       card markup: skin, side slots, pages, caption, pulse line
│       ├── styles.css       design tokens, themes, layout
│       └── renderer.js      hover, open/close, page switching, tucking, caption
├── widgets/
│   ├── music/               the YouTube Music widget
│   │   ├── widget.js        UI inside the card (renderer side)
│   │   ├── main.js          the hidden player, search, discover, shuffle (main side)
│   │   ├── discover.js      live moods, genres, quick picks
│   │   ├── lyrics.js        synced lyrics lookup and matching
│   │   └── audio-probe.js   injected into the player to read the audio levels
│   └── _example/            a starter widget (folders starting with _ are ignored)
├── native/menubar-watch.m   small helper: notch size, app-menu extent, status icons
├── scripts/                 install.sh, signing hook, banner generator
├── build/  assets/          app icon, tray icons
└── docs/                    these documents and the README images
```

## Two windows

- **The shell** is a 620 × 320 transparent panel pinned to the top centre of the primary display, above the menu bar and on every Space. Everything the user sees is drawn here. It ignores the mouse except while the cursor is over the pill, which is how the menu bar underneath stays clickable.
- **The player** is a normal hidden window on a persistent session, so a sign-in survives restarts. It uses a regular Chrome user agent, has an ad blocker attached, and is controlled by running small scripts in the page.

## Hover, open and close

The renderer hit-tests the pill on every mouse move and tells the main process whether the mouse is "interactive". Entering opens the card; leaving closes it after a short grace (a little longer while typing in search). While search is open the card holds keyboard focus; losing focus or leaving the pill folds it back.

## Finding the notch

The exact notch size comes from the native helper (`menubar-watch --notch`, which reads the screen's auxiliary areas), so 13", 14" and 16" models fit exactly. No black shape is drawn there: the hardware notch is already black, and anything drawn would overhang it.

## Getting out of the way

The same helper watches two things:

- **App menus.** With Accessibility permission it reads where the frontmost app's menu titles end. When they get close to the left item, that item rolls into the notch area (where the hardware hides it) and rolls back when there's room.
- **Status icons.** The leftmost status item on the right needs no permission. When it nears the notch, the right item rolls away too.

While an item is tucked, the strip it left is excluded from hover so clicks reach the real menu bar. With both sides tucked and music playing, a hairline under the notch pulses in the cover's colour so you still know something is playing.

## The music widget

| Piece | How |
|---|---|
| **State** | The main side polls the hidden page once a second (media session metadata, the video element, a few DOM selectors) and sends it to the card |
| **Equalizer** | A script injected into the page taps the `<video>` with a Web Audio analyser and returns four bands about 14 times a second, along with the exact playback time |
| **Search** | YouTube Music's own web API from the main process, results shown in the card |
| **Discover** | Moods and genres, the home page's first song shelf and a genre's playlists, read live and cached for 10 minutes. Nothing is hardcoded |
| **Playing** | A song loads `watch?v=ID` with its auto-mix; a playlist loads `watch?list=ID`. With nothing loaded, play starts a random quick pick |
| **Shuffle** | Clicks the player's own shuffle control, so it works on the current queue or playlist |
| **Lyrics** | See below |
| **Sleep** | After a configurable pause the disc and bars fade to a dim note until you hover or play |

### Lyrics, in short

Lyrics come from LRCLIB, searched fuzzily from several query variants. An entry is accepted only when its title, version (remix, slowed, acoustic…), length and artist all agree, and its last line is not sung after the track ends (entries are often timed for a longer cut). English-letter entries are preferred. If nothing passes, the card just shows the artist name. The line is chosen from the exact playback time, so it stays in sync through seeks.

## Resource monitor

The tray menu shows a leaf: green when the app uses a normal amount of CPU and memory, yellow with a short explanation when it doesn't (high CPU, a lot of memory, or moderate CPU while on battery).

## Updates

`src/main/updater.js` reads the latest GitHub release, compares its tag with the running version, and (on request) downloads `Notch-Porch-arm64.zip`. It checks the size and the published SHA-256, unpacks it, and refuses anything that isn't an intact Notch Porch bundle at the expected version. The app then quits and a tiny detached script swaps the bundle in place (keeping the old one until the move worked, and rolling back if it didn't) and reopens it. Dev runs and folders the app can't write to open the release page instead.

## Packaging and releases

`npm run dist` builds an Apple Silicon DMG and zip with electron-builder. The app is signed ad hoc (no certificate) by `scripts/adhoc-sign.js`, which Apple Silicon needs in order to launch it. Pushing a `v*` tag runs the release workflow, which builds on a macOS runner and attaches the files to a GitHub release under fixed names, so the "latest" download URLs and the install script keep working.
