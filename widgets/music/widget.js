// Music widget — notch UI.
// Collapsed: spinning disc (left) + equalizer bars (right).
// Expanded: Apple-style now-playing card.

const ICONS = {
  play:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 6 4.5z"/></svg>`,
  pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4" height="16" rx="1.5"/><rect x="14.5" y="4" width="4" height="16" rx="1.5"/></svg>`,
  prev:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5h2v14H5zm3.5 7 8.5 6V6z"/></svg>`,
  next:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5h-2v14h2zm-3.5 7L7 6v12z"/></svg>`,
  shuffle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`,
  heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3.2 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.2 0 5.2 3.2 3.6 6.4C19 15.6 12 20 12 20z"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>`,
  lyrics: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.5L8 21v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M7.5 9h9M7.5 12.5h5.5"/></svg>`,
  heartFill: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3.2 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.2 0 5.2 3.2 3.6 6.4C19 15.6 12 20 12 20z"/></svg>`,
};

const CSS = `
/* ── album art (spins while playing) ── */
.m-disc {
  width: var(--slot); height: var(--slot); border-radius: 50%; flex-shrink: 0;
  background: #2c2c2e center/cover no-repeat;
  box-shadow: 0 0 0 .5px rgba(255,255,255,.18), 0 2px 8px rgba(0,0,0,.5);
  animation: spin 10s linear infinite; animation-play-state: paused;
  transition: width .42s var(--ease), height .42s var(--ease);
}
.m-disc.spin { animation-play-state: running; }

.m-disc, .m-eq { transition: opacity .3s ease, width .42s var(--ease), height .42s var(--ease); }
.m-disc.idle { opacity: 0; }
.m-eq.idle { display: none; }
.m-note { display: none; color: rgba(255,255,255,.55); animation: pop-in .3s var(--ease); transition: color .8s ease; }
.m-note.faded { color: rgba(255,255,255,.2); }
.m-note.show { display: block; }
.m-note svg { display: block; width: calc(var(--eq-h) + 2px); height: calc(var(--eq-h) + 2px); transition: width .42s var(--ease), height .42s var(--ease); }

/* ── equalizer bars ── */
.m-eq { display: flex; gap: 2px; align-items: flex-end; height: var(--eq-h); transition: height .42s var(--ease); }
.m-eq i {
  width: 3px; height: 100%; border-radius: 2px; background: var(--accent);
  transform-origin: bottom; transform: scaleY(.25);
  animation: eq .85s ease-in-out infinite; animation-play-state: paused;
}
.m-eq.on i { animation-play-state: running; }
/* live: bars follow the real audio instead of the canned animation */
.m-eq.live i { animation: none; transform: scaleY(var(--lv, .25)); transition: transform .09s linear; filter: brightness(calc(.85 + var(--beat) * .55)); }
.m-eq i:nth-child(2) { animation-delay: .22s; }
.m-eq i:nth-child(3) { animation-delay: .46s; }
.m-eq i:nth-child(4) { animation-delay: .09s; }

/* ── now playing text ── */
.m-meta { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; cursor: pointer; }
.m-title {
  max-width: 100%; font-size: 15px; font-weight: 600; letter-spacing: -.3px; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,.96);
}
.m-artist {
  max-width: 100%; font-size: 12px; letter-spacing: -.1px; min-height: 16px; line-height: 16px;
  display: grid; justify-items: center; color: rgba(255,255,255,.5); transition: color .4s ease;
}
.m-artist > span { grid-area: 1 / 1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-artist.lyric { color: rgba(255,255,255,.86); font-weight: 500; }

/* ── progress ── */
.m-scrub {
  display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: .2px;
  font-variant-numeric: tabular-nums; color: rgba(255,255,255,.38);
}
.m-bar { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,.14); position: relative; cursor: pointer; transition: height .15s ease; }
.m-bar:hover { height: 5px; }
.m-fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: rgba(255,255,255,.88); transition: width .25s linear; }

/* ── search ── */
.m-meta { padding: 0 34px; }
.m-open-search { position: absolute; top: -3px; right: -6px; }
.m-lyr-btn { position: absolute; top: -3px; left: -6px; }
.m-find { display: none; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
.searching .m-meta, .searching .m-scrub, .searching .m-ctrls, .searching .m-open-search, .searching .m-lyr-btn { display: none; }
.searching .m-find { display: flex; }
.m-find-bar { display: flex; align-items: center; gap: 6px; }
.m-input {
  flex: 1; height: 30px; border: 0; border-radius: 10px; padding: 0 12px; outline: none;
  background: rgba(255,255,255,.12); color: var(--text); font: 13px var(--sans); user-select: text;
}
.m-input::placeholder { color: rgba(255,255,255,.4); }
.m-input:focus { box-shadow: 0 0 0 1.5px rgba(255,255,255,.35); }
.m-results { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: none; }
.m-results::-webkit-scrollbar { display: none; }
.m-row {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; width: 100%; box-sizing: border-box;
  height: 42px; padding: 4px 6px; border: 0; border-radius: 9px; background: transparent;
  color: inherit; text-align: left; cursor: pointer; font: inherit; transition: background .15s;
}
.m-row:hover, .m-row:focus-visible { background: rgba(255,255,255,.1); outline: none; }
.m-row img { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); flex-shrink: 0; }
.m-row .t { min-width: 0; display: flex; flex-direction: column; }
.m-row b { font-size: 13px; font-weight: 600; letter-spacing: -.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-row span { font-size: 11px; color: rgba(255,255,255,.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-sec { flex-shrink: 0; margin: 8px 4px 5px; font-size: 11px; font-weight: 600; letter-spacing: .02em; color: rgba(255,255,255,.42); }
.m-sec:first-child { margin-top: 2px; }
.m-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 2px; flex-shrink: 0; }
.m-chip {
  display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border: 0; border-radius: 10px;
  background: rgba(255,255,255,.055); color: rgba(255,255,255,.88); font: 500 12.5px var(--sans); letter-spacing: -.1px; cursor: pointer;
  transition: background .15s, color .15s, transform .12s;
}
.m-chip:hover, .m-chip:focus-visible { background: rgba(255,255,255,.11); color: #fff; outline: none; }
.m-chip:active { transform: scale(.97); }
.m-chip.more { color: rgba(255,255,255,.5); background: transparent; box-shadow: inset 0 0 0 .5px rgba(255,255,255,.16); }
.m-recent { display: none; align-items: center; gap: 6px; flex-shrink: 0; padding-top: 6px; border-top: .5px solid rgba(255,255,255,.1); overflow: hidden; }
.m-recent.show { display: flex; }
.m-recent > b { font-size: 11px; font-weight: 600; letter-spacing: .02em; color: rgba(255,255,255,.42); margin-right: 2px; }
.m-recent .m-chip { height: 26px; padding: 0 10px; border-radius: 9px; font-size: 12px; white-space: nowrap; }
.m-hint { font-size: 12px; color: rgba(255,255,255,.4); text-align: center; padding: 14px 0; }

/* ── controls ── */
.m-ctrls { display: flex; align-items: center; justify-content: center; gap: 4px; }
.m-spacer { flex: 1; }
`;

// ── dominant colours from the cover art (for the "Album colors" theme) ──
function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const sat = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, sat, l];
}
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

function paletteOf(img) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 32, 32);
  const px = x.getImageData(0, 0, 32, 32).data, bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const k = ((px[i] >> 5) << 6) | ((px[i + 1] >> 5) << 3) | (px[i + 2] >> 5);
    const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2]; bins.set(k, b);
  }
  const cols = [...bins.values()].map((b) => {
    const [h, s, l] = toHsl(b.r / b.n, b.g / b.n, b.b / b.n);
    return { h, s, l, score: b.n * (0.15 + s) * (l > .12 && l < .88 ? 1 : .25) };
  }).sort((a, b) => b.score - a.score);
  if (!cols.length) return null;
  const a = cols[0];
  const hueGap = (u, v) => { const d = Math.abs(u - v) % 360; return Math.min(d, 360 - d); };
  const b = cols.find((c) => hueGap(c.h, a.h) > 35 && c.s > .15) || { h: a.h + 30, s: a.s, l: a.l };
  // soft, dark tones: warm hues (red/orange/yellow) get extra desaturation so they don't glare
  const tone = (c, sMax, lo, hi) => {
    const warm = c.h < 55 || c.h > 320 ? .72 : 1;
    return hsl(c.h, Math.min(sMax * warm, (.12 + c.s * .55) * warm), Math.min(hi, Math.max(lo, c.l * .75)));
  };
  // bright version of the cover's main colour for small accents (the notch pulse line)
  const vivid = a.s < .18 ? hsl(a.h, .08, .82) : hsl(a.h, Math.min(1, .55 + a.s * .4), .62);
  return [tone(a, .5, .17, .27), tone(b, .45, .13, .22), vivid];
}
const paletteCache = new Map();
function loadPalette(url) {
  if (paletteCache.has(url)) return Promise.resolve(paletteCache.get(url));
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { let p = null; try { p = paletteOf(img); } catch { /* tainted canvas */ } paletteCache.set(url, p); res(p); };
    img.onerror = () => res(null);
    img.src = url;
  });
}

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export default {
  async mount({ page, compact, api }) {
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));

    // ── beside the notch (collapsed and open) ──
    const disc = el('<div class="m-disc idle"></div>');
    const eq = el('<div class="m-eq idle"><i></i><i></i><i></i><i></i></div>');
    compact.left.append(disc);
    const note = el(`<div class="m-note show" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3.2a1 1 0 0 1 1.2-.98l9 1.8A1 1 0 0 1 20 5v11.5a3.5 3.5 0 1 1-2-3.16V6.8l-7-1.4V18a3.5 3.5 0 1 1-2-3.16V3.2z"/></svg></div>`);
    compact.right.append(eq, note);

    // ── expanded (below the notch) ──
    page.innerHTML = `
      <button class="ctl ghost m-lyr-btn" aria-label="Show lyrics" title="Lyrics">${ICONS.lyrics}</button>
      <button class="ctl ghost m-open-search" aria-label="Search songs" title="Search">${ICONS.search}</button>
      <div class="m-meta">
        <div class="m-title">Nothing playing</div>
        <div class="m-artist"><span class="cur">Press play, or tap search to discover music</span></div>
      </div>

      <div class="m-scrub">
        <span class="m-cur">0:00</span>
        <div class="m-bar" role="slider" aria-label="Seek" tabindex="0">
          <div class="m-fill" style="width:0%"></div>
        </div>
        <span class="m-rem">0:00</span>
      </div>

      <div class="m-ctrls">
        <button class="ctl ghost m-shuffle" aria-label="Shuffle" title="Shuffle">${ICONS.shuffle}</button>
        <div class="m-spacer"></div>
        <button class="ctl m-prev" aria-label="Previous" title="Previous">${ICONS.prev}</button>
        <button class="ctl primary m-play" aria-label="Play" title="Play/Pause">${ICONS.play}</button>
        <button class="ctl m-next" aria-label="Next" title="Next">${ICONS.next}</button>
        <div class="m-spacer"></div>
        <button class="ctl ghost m-like" aria-label="Like" title="Like">${ICONS.heart}</button>
      </div>

      <div class="m-find">
        <div class="m-find-bar">
          <button class="ctl ghost m-back" aria-label="Back" title="Back">${ICONS.back}</button>
          <input class="m-input" placeholder="Search YouTube Music" autocomplete="off" spellcheck="false" aria-label="Search YouTube Music">
        </div>
        <div class="m-results" role="listbox"></div>
        <div class="m-recent"><b>Recent</b></div>
      </div>`;

    const $ = (s) => page.querySelector(s);
    const titleEl = $('.m-title');
    const artistEl = $('.m-artist');
    const curEl = $('.m-cur');
    const remEl = $('.m-rem');
    const fillEl = $('.m-fill');
    const barEl = $('.m-bar');
    const playBtn = $('.m-play');
    const shufBtn = $('.m-shuffle');
    const likeBtn = $('.m-like');
    let state = { d: 0, t: 0 };
    let artUrl = '';
    let has = false, asleep = false, cardOpen = false, lastActive = Date.now(), leaveTimer = null;

    // ── sleep mode: paused for a while → dim note only, until hover or playback wakes it ──
    const paintIdle = () => {
      const hidden = !has || asleep;
      disc.classList.toggle('idle', hidden);
      eq.classList.toggle('idle', hidden);
      note.classList.toggle('show', hidden);
      note.classList.toggle('faded', asleep);
    };
    const touch = () => { lastActive = Date.now(); if (asleep) { asleep = false; paintIdle(); } };
    api.onOpen((open) => {
      cardOpen = open; touch();
      const searching = page.classList.contains('searching');
      if (!open && searching) {
        // the card is folding back: release focus now, but keep the search view on screen until it has gone,
        // otherwise the player controls flash in while the card is still fading out
        api.hold(false);
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { leaveTimer = null; endSearch(); }, 560);
      } else if (open && leaveTimer) {                  // came back before it finished: show the player again
        clearTimeout(leaveTimer); leaveTimer = null; endSearch();
      }
    });
    setInterval(() => {
      const mins = api.settings.sleepMinutes ?? 5;
      if (!mins || asleep || !has || state.playing || cardOpen) return;
      if (Date.now() - lastActive > mins * 60000) { asleep = true; paintIdle(); }
    }, 5000);

    // ── live equalizer: real audio levels from the player ──
    const bars = [...eq.children];
    const peak = [0.2, 0.2, 0.2, 0.2];
    let beat = 0, lastLevels = 0;
    const stopLive = () => { eq.classList.remove('live'); beat = 0; api.setBeat(0); };
    api.on('levels', (m) => {
      if (!state.playing) return;
      base = { t: m.t, at: performance.now() };      // exact playback time ~14×/s keeps lyrics in sync through seeks
      const b = m.b;
      if (!b) return;
      lastLevels = Date.now();
      eq.classList.add('live');
      b.forEach((v, i) => {
        peak[i] = Math.max(peak[i] * 0.995, v, 0.12);        // adaptive gain per band
        const l = Math.min(1, v / peak[i]);
        bars[i].style.setProperty('--lv', (0.18 + 0.82 * Math.pow(l, 1.4)).toFixed(2));
      });
      const bass = Math.min(1, b[0] / peak[0]);
      beat = Math.max(Math.max(0, (bass - 0.45) / 0.55), beat * 0.8); // fast attack, quick decay
      api.setBeat(beat);
    });
    setInterval(() => { if (eq.classList.contains('live') && Date.now() - lastLevels > 1500) stopLive(); }, 500);

    $('.m-meta').onclick = () => { if (!state.title) startSearch(); };
    $('.m-meta').style.cursor = 'pointer';

    // ── search + discover ──
    const input = $('.m-input'), results = $('.m-results'), recentEl = $('.m-recent');
    let seq = 0, timer = null, found = [], view = 'discover';      // 'discover' | 'genre' | 'results'
    const hint = (t) => { results.innerHTML = ''; results.append(Object.assign(document.createElement('div'), { className: 'm-hint', textContent: t })); };
    const sec = (t) => Object.assign(document.createElement('div'), { className: 'm-sec', textContent: t });
    const endSearch = () => {
      page.classList.remove('searching');
      clearTimeout(timer); seq++;
      api.setHeight(null); api.hold(false);
    };
    const play = (t) => { api.invoke('play', t); endSearch(); };
    const rowEl = (r, target) => {
      const b = el('<button class="m-row" role="option"><img alt=""><div class="t"><b></b><span></span></div></button>');
      if (r.art) b.querySelector('img').src = r.art;
      b.querySelector('b').textContent = r.title;
      b.querySelector('span').textContent = r.artist ?? r.subtitle ?? '';
      b.onclick = () => play(target);
      return b;
    };
    const chipEl = (label, onClick, cls = '') => {
      const c = Object.assign(document.createElement('button'), { className: `m-chip ${cls}`.trim(), textContent: label });
      c.onclick = onClick;
      return c;
    };

    // your own recent searches (kept locally in settings.json), pinned under the list
    const recents = () => (Array.isArray(api.settings.recentSearches) ? api.settings.recentSearches : []);
    const paintRecents = () => {
      const list = recents().slice(0, 4);
      recentEl.replaceChildren(recentEl.querySelector('b'), ...list.map((q) => chipEl(q, () => { input.value = q; runSearch(q); })));
      recentEl.classList.toggle('show', view === 'discover' && list.length > 0);
    };
    const remember = (q) => api.setSetting('recentSearches', [q, ...recents().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8));

    // discover: live moods/genres + quick picks straight from YouTube Music
    async function showDiscover() {
      view = 'discover'; seq++; paintRecents();
      hint('Loading…');
      const d = await api.invoke('discover');
      if (view !== 'discover') return;
      if (!d || !d.sections.length) return hint("Couldn't reach YouTube Music. Type to search.");
      const taps = api.settings.genreTaps || {};
      const nodes = [];
      d.sections.forEach((sc, i) => {
        nodes.push(sec(sc.title || 'Browse'));
        const box = Object.assign(document.createElement('div'), { className: 'm-chips' });
        // moods stay whole; long genre lists show your most-used first, then YouTube's order, behind a "more" chip
        const all = i === 0 ? sc.chips : [...sc.chips].map((c, k) => [c, k]).sort((x, y) => (taps[y[0].label] || 0) - (taps[x[0].label] || 0) || x[1] - y[1]).map((x) => x[0]);
        const LIMIT = 8;
        const fill = (full) => {
          const list = i === 0 || full ? all : all.slice(0, LIMIT);
          box.replaceChildren(...list.map((c) => chipEl(c.label, () => showGenre(c))));
          if (!full && i !== 0 && all.length > LIMIT) box.append(chipEl(`+${all.length - LIMIT} more`, () => fill(true), 'more'));
        };
        fill(false);
        nodes.push(box);
        if (i === 0 && d.picks.items.length) {
          nodes.push(sec(d.picks.title));
          nodes.push(...d.picks.items.slice(0, 4).map((r) => rowEl(r, r)));
        }
      });
      results.replaceChildren(...nodes);
      results.scrollTop = 0;
    }
    async function showGenre(c) {
      view = 'genre'; seq++; paintRecents();
      api.setSetting('genreTaps', { ...(api.settings.genreTaps || {}), [c.label]: ((api.settings.genreTaps || {})[c.label] || 0) + 1 });
      results.replaceChildren(sec(c.label), Object.assign(document.createElement('div'), { className: 'm-hint', textContent: 'Loading…' }));
      const g = await api.invoke('genre', { browseId: c.browseId, params: c.params });
      if (view !== 'genre') return;
      if (!g || !g.groups.length) return results.replaceChildren(sec(c.label), Object.assign(document.createElement('div'), { className: 'm-hint', textContent: 'Nothing here right now' }));
      const nodes = [sec(c.label)];
      for (const grp of g.groups) { if (grp.title) nodes.push(sec(grp.title)); nodes.push(...grp.items.map((r) => rowEl(r, r))); }
      results.replaceChildren(...nodes);
      results.scrollTop = 0;
    }

    const render = (list) => {
      found = list || [];
      if (!list) return hint("Couldn't reach YouTube Music");
      if (!list.length) return hint('No results');
      results.replaceChildren(...list.map((r) => rowEl(r, { id: r.id })));
    };
    async function runSearch(q) {
      clearTimeout(timer);
      view = 'results'; paintRecents();
      const mine = ++seq;
      hint('Searching…');
      const list = await api.invoke('search', q);
      if (mine === seq) render(list);
    }
    const startSearch = () => {
      page.classList.add('searching');
      input.value = ''; found = [];
      api.setHeight(268); api.hold(true);
      showDiscover();
      setTimeout(() => input.focus(), 120);
    };
    // one step up: genre list → discover → player
    const back = () => {
      if (view === 'genre') { showDiscover(); return; }
      if (input.value) { input.value = ''; showDiscover(); return; }
      endSearch();
    };
    $('.m-open-search').onclick = startSearch;
    $('.m-back').onclick = back;
    $('.m-meta').addEventListener('dblclick', startSearch);
    input.oninput = () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) { showDiscover(); return; }
      timer = setTimeout(() => runSearch(q), 280);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') back();
      if (e.key === 'Enter' && input.value.trim()) {
        const q = input.value.trim();
        remember(q);
        if (found[0] && view === 'results') play({ id: found[0].id }); else runSearch(q);
      }
    };

    playBtn.onclick = () => api.invoke('toggle');
    $('.m-next').onclick = () => api.invoke('next');
    $('.m-prev').onclick = () => api.invoke('prev');
    shufBtn.onclick = async () => {
      if (!state.title) artistEl.textContent = 'Finding something to shuffle…';
      const r = await api.invoke('shuffle');
      if (r === 'empty') artistEl.textContent = "Couldn't find anything to shuffle";
    };
    likeBtn.onclick = () => api.invoke('like');

    barEl.onclick = (e) => {
      if (!state.d) return;
      const r = barEl.getBoundingClientRect();
      api.invoke('seek', ((e.clientX - r.left) / r.width) * state.d);
    };
    barEl.onkeydown = (e) => {
      if (e.key === 'ArrowRight') api.invoke('seek', state.t + 5);
      if (e.key === 'ArrowLeft') api.invoke('seek', state.t - 5);
    };

    // smooth local clock between 1s updates
    setInterval(() => {
      if (state.playing && state.d) {
        state.t = Math.min(state.d, state.t + 0.25);
        paintTime();
      }
    }, 250);

    function paintTime() {
      curEl.textContent = fmt(state.t);
      remEl.textContent = state.d ? `−${fmt(state.d - state.t)}` : '0:00';
      fillEl.style.width = state.d ? `${(state.t / state.d) * 100}%` : '0%';
    }

    // ── lyrics: one synced line in place of the artist name (card) and/or a caption under the notch ──
    let artistDefault = 'Press play, or tap search to discover music';
    let lyr = { key: '', lines: null };
    let base = { t: 0, at: performance.now() };      // playback clock sampled when state arrives
    let lastLine = null, lastCard = null, wasPlaying = false;
    const lyrBtn = $('.m-lyr-btn');

    const swap = (el, text) => {                      // crossfade the line (new rises in, old drifts out)
      const cur = el.querySelector('.cur');
      if (cur && cur.textContent === text) return;
      const next = Object.assign(document.createElement('span'), { className: 'cur', textContent: text });
      if (!cur) { el.textContent = ''; el.append(next); return; }
      cur.className = 'old'; next.classList.add('in'); el.append(next);
      setTimeout(() => cur.remove(), 320);
    };
    const lyricNow = () => {                          // current line text, '' for an instrumental gap, null if none yet
      const L = lyr.lines;
      if (!L) return null;
      const t = base.t + (state.playing ? (performance.now() - base.at) / 1000 : 0) + 0.25;   // show a hair early
      let lo = 0, hi = L.length - 1, i = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m][0] <= t) { i = m; lo = m + 1; } else hi = m - 1; }
      return i < 0 ? null : L[i][1];
    };
    const paintArtist = () => {
      const on = !!api.settings.lyrics, line = on ? lyricNow() : null;
      const text = line !== null ? (line || '♪') : artistDefault;
      artistEl.classList.toggle('lyric', line !== null);
      swap(artistEl, text);
    };
    async function fetchLyrics() {
      const key = `${state.title}|${state.artist}`;
      if (!state.title || lyr.key === key || !state.d) return;     // wait for the duration: it makes matching reliable
      lyr = { key, lines: null };
      const res = await api.invoke('lyrics', { title: state.title, artist: state.artist, album: state.album, duration: state.d });
      if (lyr.key === key) lyr.lines = res && res.lines ? res.lines : null;
    }
    setInterval(() => {
      // the card button is the master switch; "under the notch" is only a preference for where else to show them
      const card = !!api.settings.lyrics, cap = card && !!api.settings.lyricsSubtitle;
      lyrBtn.classList.toggle('on', card);
      lyrBtn.setAttribute('aria-pressed', String(card));
      if (card !== lastCard) { lastCard = card; paintArtist(); }
      if (!(card || cap) || !has) { if (lastLine !== null) { lastLine = null; api.setCaption(null); } return; }
      fetchLyrics();
      const line = lyricNow();
      if (line === lastLine) return;
      lastLine = line;
      if (card) paintArtist();
      api.setCaption(cap && state.playing && line ? line : null);   // nothing during instrumental gaps
    }, 150);
    lyrBtn.onclick = () => api.setSetting('lyrics', !api.settings.lyrics);

    api.on('state', (s) => {
      state = s;
      base = { t: s.t || 0, at: performance.now() };
      if (!s.playing) api.setCaption(null);
      if (s.playing !== wasPlaying) { wasPlaying = s.playing; lastLine = undefined; }   // re-show the caption on resume
      has = !!s.title;
      if (s.playing) touch();
      if (!s.playing && eq.classList.contains('live')) stopLive();
      titleEl.textContent = has ? s.title : 'Nothing playing';
      artistDefault = has ? [s.artist, s.album].filter(Boolean).join(' · ') : 'Press play, or tap search to discover music';
      paintArtist();

      paintIdle();
      disc.classList.toggle('spin', !!s.playing);
      disc.style.backgroundImage = s.art ? `url("${s.art.replace(/"/g, '')}")` : '';
      eq.classList.toggle('on', !!s.playing);

      playBtn.innerHTML = s.playing ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');

      shufBtn.classList.toggle('on', !!s.shuffle);
      likeBtn.innerHTML = s.liked ? ICONS.heartFill : ICONS.heart;
      likeBtn.classList.toggle('on', !!s.liked);

      paintTime();
      api.setActivity(has);
      api.setPlaying(!!s.playing);
      if ((s.art || '') !== artUrl) {
        artUrl = s.art || '';
        const want = artUrl;
        (want ? loadPalette(want) : Promise.resolve(null)).then((p) => { if (want === artUrl) api.setPalette(p); });
      }
    });
  }
};
