# Windows

Same engine, same widgets, same Room and Music code. Only a thin platform layer differs, so the Mac app is untouched.

| Piece | Mac | Windows |
|:--|:--|:--|
| Dock shape | Around the hardware notch | Small pill at the top centre of the primary display |
| Layout | `styles.css` | `styles.css` + `src/renderer/platform-win.css` (loaded only on Windows) |
| Menu avoidance | `native/menubar-watch.m` | Not needed, not built |
| Tray icon | Template icon, dot title | Coloured `assets/tray-win.png` |
| Package | DMG + zip, ad-hoc signed | NSIS per-user installer `Notch-Porch-Setup-x64.exe`, unsigned |
| Updates | Swap the `.app`, relaunch | Run the downloaded installer silently (`/S --updated --force-run`) |

`src/main/platform.js` is the single switch. `NOTCH_PLATFORM=win32 npm start` runs the Windows paths on a Mac for layout checks.

**Install:** `irm https://raw.githubusercontent.com/shubhamcodess/notch-porch/main/scripts/install.ps1 | iex`, or download the setup exe from Releases. SmartScreen may warn because the app is unsigned: More info, Run anyway.

**Build:** `npm run dist:win` on Windows (CI does this on `v*` tags).
