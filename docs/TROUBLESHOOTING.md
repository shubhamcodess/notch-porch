# Troubleshooting

## macOS says it can't verify the app

Notch Porch isn't signed with a paid Apple Developer certificate. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**. Or, once, in Terminal:

```bash
xattr -cr "/Applications/Notch Porch.app"
```

## The pill doesn't line up with my notch

The size is detected automatically. If you built from source without the Xcode command line tools, the fallback width is used; install them (`xcode-select --install`) and run `npm run build:native`, or set `notchWidth` in [settings.json](CONFIGURATION.md).

## Items don't move out of the way of app menus

That feature needs Accessibility permission. Turn it on in **System Settings → Privacy & Security → Accessibility**, or use **menu-bar icon → Settings → Allow Accessibility access…**.

## Google refuses the sign-in

Sign-in is optional. If you want it and Google says "this browser may not be secure", import your cookies instead:

1. Export your `youtube.com` and `google.com` cookies as JSON (the Cookie-Editor extension's export works).
2. **Menu-bar icon → Music → Show data folder**, and save the file there as `cookies.json`.
3. **Menu-bar icon → Music → Re-import cookies.json**.

`cookies.json` stays on your Mac and is git-ignored. Treat it like a password.

## No lyrics for a song

That's by design when there's no reliable match. Lyrics are shown only when the title, version, length and artist all agree, and they aren't sung past the end of your track. Slowed, sped-up and edited versions often have none; the card then keeps showing the artist name.

## Nothing plays, or it keeps pausing

Choose **Reload dock** from the menu. If it persists, open **Music → Open YouTube Music window** and check whether the page is asking something (a prompt, an ad, a region message), then please [open an issue](https://github.com/shubhamcodess/notch-porch/issues) with what you see.

## It feels heavy

The leaf in the menu says when usage is high. The hidden YouTube Music page is the biggest part. Quitting from the menu closes it completely.
