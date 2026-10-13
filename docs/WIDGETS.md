# Writing a widget

A widget is a folder in `widgets/`. Adding one needs no change to the core: it appears as a new page in the dock, with its own submenu in the menu-bar menu.

```
widgets/my-widget/
├── manifest.json   name, order, which files to load
├── widget.js       the UI (runs in the card)
└── main.js         optional: runs in the main process
```

Folders starting with `_` are ignored. `widgets/_example` is a small clock to copy.

## manifest.json

```json
{ "name": "My widget", "order": 3, "renderer": "widget.js", "main": "main.js" }
```

`name` labels the page and its menu. `order` sorts the pages. `main` is optional. Add `"enabled": false` to hide a widget.

## widget.js (the card)

```js
export default {
  mount({ page, compact: { left, right }, api }) {
    page.innerHTML = '<div>Hello from the porch</div>';   // the open card
    left.textContent = '●';                                 // beside the notch, collapsed
  },
  onShow(visible) {}                                        // optional: page switched
};
```

### `api`

| Call | What it does |
|---|---|
| `api.invoke(name, ...args)` | Call a handler in your `main.js` (namespaced for you) |
| `api.on(name, cb)` | Listen to events your `main.js` sends |
| `api.settings` | The current settings object (read it each time; it's replaced on change) |
| `api.setSetting(key, value)` | Persist a setting |
| `api.setActivity(bool)` | Claim the collapsed side items while you have something live |
| `api.setPalette([a, b, vivid])` | Tint the Album colors theme and the pulse line |
| `api.setBeat(0..1)` | Drive beat-reactive effects (`--beat` in CSS) |
| `api.setPlaying(bool)` | Show the pulse line when the sides are tucked |
| `api.setCaption(text \| null)` | A one-line caption under the notch (hidden while the card is open) |
| `api.setHeight(px \| null)` | Make the open card taller (for example, a list) |
| `api.hold(bool)` | Take keyboard focus for typing; the card still folds back when the mouse leaves |
| `api.onOpen(cb)` | Called with `true` / `false` as the card opens and closes |
| `api.open()` | Open the card from code |

## main.js (the main process)

```js
exports.setup = async (ctx) => {
  ctx.handle('ping', (name) => `pong ${name}`);          // api.invoke('ping', 'x')
  ctx.send('tick', { at: Date.now() });                   // api.on('tick', cb)
  ctx.menu(() => [                                         // rebuilt every time the tray menu is
    { label: 'Do a thing', click: () => {} },
    { label: 'Enabled', type: 'checkbox', checked: !!ctx.settings.myFlag,
      click: (item) => ctx.setSetting('myFlag', item.checked) }
  ]);
  ctx.onQuit(() => { /* clean up */ });
};
```

| `ctx` | |
|---|---|
| `handle(name, fn)` / `send(name, data)` | Two-way messages with your `widget.js` |
| `settings` | The live settings object |
| `setSetting(key, value)` | Persist and broadcast a setting |
| `userData` | The app's data folder |
| `menu(fn)` / `menuItems[]` | Items for your widget's submenu |
| `onQuit(fn)` / `quitting()` | Shutdown hooks |

## Rules of the road

- Keep to the [design system](DESIGN_SYSTEM.md): system font, the shared easing, no blur in animations.
- The UI talks to the main process only through `api`. The allow-list in `src/main/preload.js` must stay intact.
- Don't put secrets or personal data in the repo.
