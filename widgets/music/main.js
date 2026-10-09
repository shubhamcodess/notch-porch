// Music widget — main side.
// Runs music.youtube.com in a hidden Chromium window with its own persistent
// session (your login stays), an ad/tracker blocker, and an ad-skip script.
// The notch UI controls it through the handlers below.

const { BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const HOME = 'https://music.youtube.com/';
// A plain Chrome UA (without "Electron") keeps Google sign-in and YT Music happy.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Runs inside the YT Music page: mutes + fast-forwards any video ad and clicks "Skip".
const AD_SKIP = `
(() => {
  if (window.__notchAdSkip) return;
  window.__notchAdSkip = setInterval(() => {
    const v = document.querySelector('video');
    const ad = document.querySelector('.ad-showing, .ad-interrupting');
    if (v && ad) {
      if (!v.muted) { v.muted = true; window.__notchMutedForAd = true; }
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
    } else if (v && window.__notchMutedForAd) {
      v.muted = false; window.__notchMutedForAd = false;
    }
    document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')?.click();
  }, 400);
})();`;

const { getLyrics } = require('./lyrics');
const AUDIO = fs.readFileSync(path.join(__dirname, 'audio-probe.js'), 'utf8');

const STATE = `
(() => {
  const v = document.querySelector('video');
  const m = navigator.mediaSession && navigator.mediaSession.metadata;
  const art = m && m.artwork && m.artwork.length ? m.artwork[m.artwork.length - 1].src : '';
  const like = document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer');
  return {
    ready: !!v,
    title: (m && m.title) || '',
    artist: (m && m.artist) || '',
    album: (m && m.album) || '',
    art,
    playing: !!v && !v.paused && !v.ended,
    t: v ? v.currentTime : 0,
    d: v && isFinite(v.duration) ? v.duration : 0,
    shuffle: !!document.querySelector('ytmusic-player-bar[shuffle-on]'),
    liked: !!like && like.getAttribute('like-status') === 'LIKE'
  };
})()`;

const click = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) { b.click(); return true; } return false; })()`;

async function importCookies(ses, userData) {
  // Optional: drop a cookies.json (Cookie-Editor / EditThisCookie JSON export, or
  // your own tool's output) into the app's data folder to skip the login screen.
  const file = path.join(userData, 'cookies.json');
  if (!fs.existsSync(file)) return 0;
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.warn('[music] cookies.json unreadable:', e.message); return 0; }
  let n = 0;
  for (const c of Array.isArray(list) ? list : list.cookies || []) {
    const domain = String(c.domain || '').replace(/^\./, '');
    if (!domain) continue;
    try {
      await ses.cookies.set({
        url: `https://${domain}${c.path || '/'}`,
        name: c.name, value: c.value,
        domain: c.domain, path: c.path || '/',
        secure: c.secure !== false, httpOnly: !!c.httpOnly,
        expirationDate: c.expirationDate || c.expires || Math.floor(Date.now() / 1000) + 3600 * 24 * 180,
        sameSite: c.sameSite && /^(lax|strict|no_restriction)$/.test(c.sameSite) ? c.sameSite : undefined
      });
      n++;
    } catch { /* skip bad cookie */ }
  }
  console.log(`[music] imported ${n} cookies`);
  return n;
}

// Songs search via YouTube Music's own web API (no login needed).
const SONGS_FILTER = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D';
function walk(o, key, out = []) {
  if (Array.isArray(o)) o.forEach((x) => walk(x, key, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) k === key ? out.push(v) : walk(v, key, out);
  return out;
}
async function searchSongs(ses, query) {
  if (!query) return [];
  try {
    const res = await ses.fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: HOME.slice(0, -1) },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'en', gl: require('electron').app.getLocaleCountryCode() || 'US' } },
        query, params: SONGS_FILTER
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return walk(json, 'musicResponsiveListItemRenderer').slice(0, 8).map((it) => {
      const id = walk(it, 'videoId')[0];
      const col = (i) => (it.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((r) => r.text);
      const title = col(0)[0];
      const groups = col(1).join('').split(' • ').map((g) => g.trim()).filter(Boolean)
        .filter((g, i) => !(i === 0 && /^(Song|Video)$/.test(g)) && !/^\d+:\d\d$/.test(g));
      const sub = groups.slice(0, 2);
      const thumbs = walk(it, 'thumbnails')[0] || [];
      return id && title ? { id, title, artist: sub.join(' · '), art: thumbs[thumbs.length - 1]?.url || '' } : null;
    }).filter(Boolean);
  } catch (e) {
    console.warn('[music] search failed:', e.message);
    return null;
  }
}

exports.setup = async (ctx) => {
  const ses = session.fromPartition('persist:ytmusic');
  ses.setUserAgent(UA);

  if (ctx.settings.adblock !== false) {
    try {
      const { ElectronBlocker } = require('@ghostery/adblocker-electron');
      const fetch = require('cross-fetch');
      const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      blocker.enableBlockingInSession(ses);
      console.log('[music] ad blocker on');
    } catch (e) {
      console.warn('[music] ad blocker unavailable:', e.message);
    }
  }

  await importCookies(ses, ctx.userData);

  const player = new BrowserWindow({
    show: false, width: 1100, height: 760, title: 'YouTube Music',
    backgroundColor: '#030303',
    webPreferences: { partition: 'persist:ytmusic', backgroundThrottling: false, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  player.webContents.setMaxListeners(30);
  player.webContents.setUserAgent(UA);
  player.on('close', (e) => { if (!ctx.quitting()) { e.preventDefault(); player.hide(); } });
  const inject = () => player.webContents.executeJavaScript(AD_SKIP + ';' + AUDIO).catch(() => {});
  player.webContents.on('did-finish-load', inject);
  player.webContents.on('did-navigate-in-page', inject);
  // YT Music asks "leave page?" while a song plays, which silently cancels our navigation
  player.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  let autoplay = false;
  player.webContents.on('did-finish-load', () => {
    if (!autoplay) return;
    autoplay = false;
    for (const ms of [1200, 3000]) setTimeout(() => {
      if (!player.isDestroyed()) player.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v && v.paused) v.play(); })()`, true).catch(() => {});
    }, ms);
  });
  player.loadURL(HOME);

  const run = (js) => player.webContents.executeJavaScript(js, true).catch(() => null); // true = user gesture (autoplay OK)
  const showPlayer = () => { player.show(); player.focus(); };

  // quitting the dock quits the music too
  ctx.onQuit(() => {
    clearInterval(poll);
    clearInterval(levelTimer);
    if (player.isDestroyed()) return;
    player.webContents.setAudioMuted(true);
    player.destroy();
  });

  // push state to the notch ~1×/s
  let last = '';
  // live audio levels for the equalizer (only while something is playing)
  let playing = false, levelsBusy = false;
  const levelTimer = setInterval(async () => {
    if (!playing || levelsBusy || player.isDestroyed() || player.webContents.isLoading()) return;
    levelsBusy = true;
    const m = await run(`(() => { const v = document.querySelector('video'); return v ? { b: window.__notchBands ? window.__notchBands() : null, t: v.currentTime } : null; })()`);
    levelsBusy = false;
    if (m) ctx.send('levels', m);
  }, 70);

  const poll = setInterval(async () => {
    if (player.isDestroyed() || player.webContents.isLoading()) return;
    const s = await run(STATE);
    if (!s) return;
    playing = !!s.playing;
    const key = JSON.stringify(s);
    if (key !== last) { last = key; ctx.send('state', s); }
  }, 1000);

  ctx.handle('toggle', () => run(`(() => { const v = document.querySelector('video');
    if (v && v.src) { v.paused ? v.play() : v.pause(); return true; }
    const b = document.querySelector('ytmusic-player-bar #play-pause-button'); b && b.click(); return !!b; })()`));
  ctx.handle('next', () => run(click('ytmusic-player-bar .next-button')));
  ctx.handle('prev', () => run(click('ytmusic-player-bar .previous-button')));
  // Shuffle: toggle on the current queue; with nothing queued, start a shuffled mix from
  // recently played (signed in) or YouTube Music's home picks (signed out).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (js, ms) => { for (let t = 0; t < ms; t += 250) { const v = await run(js); if (v && (!Array.isArray(v) || v.length)) return v; await sleep(250); } return null; };
  const loadAndWait = async (url) => {
    await new Promise((resolve) => { const done = () => resolve(); player.webContents.once('did-finish-load', done); player.webContents.once('did-fail-load', done); player.loadURL(url).catch(() => {}); });
  };
  const SHUFFLE_ON = `(() => { const bar = document.querySelector('ytmusic-player-bar'); const b = bar && bar.querySelector('.shuffle'); if (b && !bar.hasAttribute('shuffle-on')) b.click(); return !!b; })()`;
  const SEEDS = `(() => [...new Set([...document.querySelectorAll('a[href*="watch?v="]')].map((a) => (a.getAttribute('href').match(/[?&]v=([\\w-]{11})/) || [])[1]).filter(Boolean))])()`;
  let shuffling = false;
  ctx.handle('shuffle', async () => {
    // a track is loaded → there is a queue; the (often hidden) button still works when clicked by script
    if (await run(`(() => { if (!(navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title)) return false; const b = document.querySelector('ytmusic-player-bar .shuffle'); if (b) b.click(); return !!b; })()`)) return 'toggled';
    if (shuffling) return 'busy';
    shuffling = true;
    try {
      let seeds = [];
      for (const page of [`${HOME}history`, HOME]) {   // history only has songs when signed in
        await loadAndWait(page);
        seeds = (await waitFor(SEEDS, 6000)) || [];
        if (seeds.length) break;
      }
      if (!seeds.length) return 'empty';
      const id = seeds[Math.floor(Math.random() * Math.min(seeds.length, 20))];
      autoplay = true;
      await loadAndWait(`${HOME}watch?v=${id}&list=RDAMVM${id}`);
      await waitFor(`document.querySelectorAll('ytmusic-player-queue-item').length > 1`, 8000);
      await run(SHUFFLE_ON);
      return 'started';
    } finally { shuffling = false; }
  });
  ctx.handle('like', () => run(click('ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like button, ytmusic-player-bar ytmusic-like-button-renderer .like')));
  ctx.handle('seek', (sec) => run(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${Number(sec) || 0}; })()`));
  ctx.handle('lyrics', (meta) => getLyrics(meta, ctx.userData));
  ctx.handle('search', (q) => searchSongs(ses, String(q || '').trim().slice(0, 120)));
  ctx.handle('play', (id) => {
    if (!/^[\w-]{6,20}$/.test(String(id))) return false;
    autoplay = true;
    player.loadURL(`${HOME}watch?v=${id}`);
    return true;
  });
  ctx.handle('openPlayer', () => showPlayer());
  ctx.handle('reloadCookies', async () => { const n = await importCookies(ses, ctx.userData); player.reload(); return n; });

  const SLEEP_CHOICES = [0, 1, 2, 5, 10, 15, 30];
  ctx.menu(() => [
    { label: 'Open YouTube Music window', click: showPlayer },
    { type: 'separator' },
    { label: 'Show lyrics under the notch', type: 'checkbox', checked: !!ctx.settings.lyricsSubtitle, click: (item) => ctx.setSetting('lyricsSubtitle', item.checked) },
    {
      label: 'Sleep after pause', submenu: SLEEP_CHOICES.map((m) => ({
        label: m ? `${m} minute${m > 1 ? 's' : ''}` : 'Never', type: 'radio', checked: (ctx.settings.sleepMinutes ?? 5) === m,
        click: () => ctx.setSetting('sleepMinutes', m)
      }))
    },
    { type: 'separator' },
    { label: 'Re-import cookies.json', click: async () => { await importCookies(ses, ctx.userData); player.reload(); } },
    { label: 'Show data folder (cookies.json goes here)', click: () => require('electron').shell.openPath(ctx.userData) }
  ]);
};
