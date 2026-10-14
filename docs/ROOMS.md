# Rooms: listen together

One person hosts a room and shares its ID. Others join, and everyone hears the same song at the same moment, each through their own Notch Porch. Only tiny sync messages travel between you; the audio never leaves anyone's Mac.

## Using it

1. Flip to the **Room** card (swipe, or tap the people icon under the card). The top row has your profile on the left: an auto-assigned friendly name and avatar (tap the avatar for a new one). Under it, on one line, are a **Host** button and a **Room ID** bar with a **Join** button at its end. Tap **Host**; the rows turn into your room's ID, like `Happy-Otter-47`, with a copy button and a **Close** button, and the member list sits below (the card grows so three members show before it scrolls).
2. A friend opens their Room card, types the ID into the bar and taps **Join**.
3. The music card follows the host from then on. As a guest you can't play, pause, skip or change songs. You can still search and **request** a song; the host sees it on the Room card and taps ✓ or ✗. Accepted songs play after the current one.
4. Leave any time with the door icon. Music carries on normally on your own.

Everyone has a friendly random name (`Sleepy-Panda`) that sticks between sessions, and the host's name plus two digits is the room ID. Avatars are free generated faces from [DiceBear](https://www.dicebear.com) ("fun-emoji"), drawn from the name alone so everyone sees the same face; initials show while they load or offline. There are no accounts. Up to 10 people fit in a room.

## How it works

```
 host app ──┐                              ┌── guest app
            │   encrypted state messages   │
            └──►  free public MQTT relays ◄┘     (HiveMQ, EMQX, Mosquitto; used all at once)
```

- **Transport.** Every app connects outward over a WebSocket to three public relays at once and de-duplicates messages, so it works through home routers and survives one relay being down.
- **Privacy.** The room ID derives both the channel name and an AES-256-GCM key. A relay only ever sees scrambled bytes, and it can't forge or alter messages. (Because of that, the relay connection doesn't depend on TLS identity, which also keeps it working on networks that re-sign TLS.)
- **Sync.** The host sends `{track, playing, position}` on every change and every few seconds. Guests estimate the clock difference with a ping/pong, then seek only if they drift more than about 1.5 s.
- **Requests.** A guest sends a song request; the host accepts or declines, and everyone sees the verdict. Accepted songs are queued locally by the host's player.

Each person's player still resolves the song itself, so ads (signed out), region blocks and account differences can make guests briefly differ. The next state message puts everyone back in step.

## How it's built, and how to remove it

Rooms is an ordinary widget, `widgets/room/`, using the same contract as any other:

| File | Role |
|---|---|
| `manifest.json` | A page named Room, `"transient": true` (the dock returns to Music when it closes), `"setting": "roomsEnabled"` |
| `room-core.js` | Transport, crypto and protocol. No Electron, so it can be tested alone (`node scripts/room-selftest.js`) |
| `main.js` | Glue: the room, the cross-widget bus, the tray submenu |
| `widget.js` | The Room page |
| `names.js`, `names-ui.js` | Friendly names, avatars |

It talks to the Music widget only through the **bus**, with these generic events:

| Event | From → to | Meaning |
|---|---|---|
| `music:state` | Music → anyone | The current track and position (about 1 per second) |
| `music:lock` | Room → Music | Lock the local controls (a host decides) |
| `music:apply` | Room → Music | Follow this track, position and play state |
| `music:enqueue` | Room → Music | Play this song after the current one |
| `music:request` | Music → Room | A locked user asked for a song |

Nothing in Music depends on rooms: those hooks are inert when no controller is present.

**To remove the feature:** delete `widgets/room/` and remove `mqtt` from `package.json`. The Room page, its dot and its menu disappear and music behaves exactly as before. To keep the code but hide it, set `"enabled": false` in its manifest, or choose **Room ▸ Turn off rooms** from the menu and reload the dock.
