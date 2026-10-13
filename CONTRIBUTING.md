# Contributing

Thanks for wanting to help. Notch Porch is a small, personal-scale project, so the process is light.

## Set up

You need a Mac, Node 20+ and Xcode's command line tools (`xcode-select --install`).

```bash
git clone https://github.com/shubhamcodess/notch-porch.git
cd notch-porch
npm install
npm start            # runs the app; build the native helper automatically
```

`npm run dist` builds the DMG and zip into `dist/`.

## Find your way around

Read [How it works](docs/HOW_IT_WORKS.md) first, and [Writing a widget](docs/WIDGETS.md) if you're adding a page. New UI should follow the [design system](docs/DESIGN_SYSTEM.md).

## Making changes

- **Small, focused pull requests** are easier to review than big ones.
- **Test what you change.** `NOTCH_DEBUG=1 npm start -- --remote-debugging-port=9333` opens a debug port so you can drive the card from a script, and the debug hook can simulate a crowded menu bar.
- **Keep the safety rails.** `contextIsolation: true`, `nodeIntegration: false`, and the channel allow-list in `src/main/preload.js` stay as they are.
- **No secrets.** Never commit cookies, tokens or `cookies.json`.
- **No new background polling** without a reason; the app should stay light.
- **Match the look.** System font, shared easing, no blur in animations.

## Reporting a bug or idea

[Open an issue](https://github.com/shubhamcodess/notch-porch/issues) with your Mac model, macOS version, the Notch Porch version (from the release you installed), and what you expected. A screen recording of just the notch helps a lot.

## Releasing (maintainers)

Bump `version` in `package.json` and the lockfile, commit, then `git tag vX.Y.Z && git push --tags`. The release workflow builds the DMG and zip and publishes them under fixed names.

## Licence

By contributing you agree your work is released under the [MIT licence](LICENSE).
