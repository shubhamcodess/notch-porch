# Configuration

Settings are stored in `~/Library/Application Support/notch-porch/settings.json`. Most of them are also in the menu-bar menu, and the app writes this file for you. Quit Notch Porch before editing it by hand.

## Menu-bar menu

| Entry | What it controls |
|---|---|
| **Running normally / Using significant resources** | A leaf and a one-line summary of CPU and memory |
| **Music ▸** | Open the YouTube Music window; also show lyrics under the notch; sleep timer; re-import cookies; open the data folder |
| **Theme ▸** | Dark, Liquid glass, Album colors |
| **Update to vX.Y.Z** | Appears at the top (with a dot beside the icon) when a newer release exists. One tap downloads, verifies and installs it |
| **Settings ▸** | Check for updates; notify me of new versions (a daily check that only tells you, never installs); make room for app menus; launch at login |
| **Reload dock**, **Quit** | |

## settings.json

| Key | Default | Meaning |
|---|---|---|
| `theme` | `"dark"` | `dark`, `glass` or `art` (Album colors) |
| `accent` | `"#ff375f"` | Accent colour |
| `lyrics` | `false` | Master switch for synced lyrics (the button in the card) |
| `lyricsSubtitle` | `false` | Also show lyrics as a caption under the notch (needs `lyrics` on) |
| `sleepMinutes` | `5` | Minutes paused before sleep mode. `0` means never |
| `autoUpdateCheck` | `true` | Check GitHub for a new release about once a day |
| `menuAvoid` | `true` | Roll the side items behind the notch when menus or status icons crowd it |
| `adblock` | `true` | Block ads and trackers in the player |
| `notchWidth` | `200` | Fallback notch width in px; the real size is detected |
| `recentSearches` | `[]` | Your last searches shown in Discover |
| `genreTaps` | `{}` | How often you open each genre; the most used show first |
| `lastWidget`, `lastStartedId`, `menuAvoidAsked`, `lastUpdateCheck`, `updateInfo`, `notifiedVersion` | | Internal bookkeeping |

## Files

| Path | What |
|---|---|
| `settings.json` | The settings above |
| `cookies.json` | Optional: cookies to import if sign-in is refused (see [Troubleshooting](TROUBLESHOOTING.md)) |
| `lyrics/` | Cached lyric lookups. Safe to delete |
| `Partitions/ytmusic/` | The player's session (your sign-in) |

## Environment

| Variable | Effect |
|---|---|
| `NOTCH_DEBUG=1` | Enables a test hook that simulates a crowded menu bar and prints the tray menu structure |
| `NOTCH_FAKE_VERSION=1.0.0` | Pretends to be that version, to exercise the update flow |
