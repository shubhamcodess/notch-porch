// Discover data for the notch: moods/genres, home "quick picks" and a genre's playlists.
// Everything comes live from YouTube Music's own web API (no login needed); nothing is hardcoded.
const HOME = 'https://music.youtube.com';
const TTL = 10 * 60 * 1000;
const cache = new Map();

async function call(ses, endpoint, body, gl) {
  const res = await ses.fetch(`${HOME}/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: HOME },
    body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'en', gl: gl || 'US' } }, ...body })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
};

function walk(o, key, out = []) {
  if (Array.isArray(o)) o.forEach((x) => walk(x, key, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) k === key ? out.push(v) : walk(v, key, out);
  return out;
}
const runs = (t) => (t?.runs || []).map((r) => r.text).join('');
const lastThumb = (o) => { const t = walk(o, 'thumbnails')[0] || []; return t[t.length - 1]?.url || ''; };
const hex = (argb) => `#${(Number(argb) & 0xffffff).toString(16).padStart(6, '0')}`;

// what to play when an item is clicked: a song (with its auto-mix) or a whole playlist
function target(item) {
  const pl = walk(item, 'watchPlaylistEndpoint')[0];
  if (pl?.playlistId) return { list: pl.playlistId };
  const w = walk(item, 'watchEndpoint')[0];
  if (w?.videoId) return { id: w.videoId, list: w.playlistId };
  const b = walk(item, 'browseEndpoint')[0];
  if (b?.browseId?.startsWith('VL')) return { list: b.browseId.slice(2) };
  return null;
}

function songRow(it) {
  const col = (i) => (it.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((r) => r.text);
  const t = target(it);
  const title = col(0)[0];
  if (!t || !title) return null;
  const artist = col(1).join('').split(' • ').map((g) => g.trim()).filter((g) => g && !/^(Song|Video)$/.test(g) && !/^\d+:\d\d$/.test(g)).slice(0, 2).join(' · ');
  return { ...t, title, subtitle: artist, art: lastThumb(it.thumbnail) };
}
function cardRow(it) {
  const t = target(it);
  const title = runs(it.title);
  if (!t || !title) return null;
  return { ...t, title, subtitle: runs(it.subtitle).replace(/^(Playlist|Album|Single|EP|Song|Video)\s*•\s*/i, ''), art: lastThumb(it.thumbnailRenderer || it) };
}

// moods + genres (chips) and the first shelf of songs on the home page
async function getDiscover(ses, gl) {
  return cached(`discover:${gl}`, async () => {
    const [g, h] = await Promise.all([
      call(ses, 'browse', { browseId: 'FEmusic_moods_and_genres' }, gl),
      call(ses, 'browse', { browseId: 'FEmusic_home' }, gl).catch(() => null)
    ]);
    const sections = walk(g, 'gridRenderer').map((grid) => ({
      title: runs(grid.header?.gridHeaderRenderer?.title),
      chips: (grid.items || []).map((i) => i.musicNavigationButtonRenderer).filter(Boolean).map((b) => ({
        label: runs(b.buttonText), color: hex(b.solid?.leftStripeColor || 0xffffff),
        browseId: b.clickCommand?.browseEndpoint?.browseId, params: b.clickCommand?.browseEndpoint?.params
      })).filter((c) => c.label && c.browseId)
    })).filter((s) => s.chips.length);
    let picks = { title: '', items: [] };
    for (const shelf of walk(h, 'musicCarouselShelfRenderer')) {
      const items = (shelf.contents || []).map((c) => c.musicResponsiveListItemRenderer).filter(Boolean).map(songRow).filter(Boolean);
      if (items.length) { picks = { title: runs(shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title) || 'Quick picks', items: items.slice(0, 10) }; break; }
    }
    return { sections, picks };
  });
}

// the playlists / songs inside one mood or genre, grouped by YouTube's own shelf titles
async function getGenre(ses, browseId, params, gl) {
  if (!/^[\w-]+$/.test(String(browseId)) || !/^[\w%=-]*$/.test(String(params || ''))) throw new Error('bad id');
  return cached(`genre:${browseId}:${params}:${gl}`, async () => {
    const r = await call(ses, 'browse', { browseId, params }, gl);
    const groups = [];
    for (const shelf of walk(r, 'musicCarouselShelfRenderer')) {
      const items = (shelf.contents || []).map((c) => (c.musicTwoRowItemRenderer ? cardRow(c.musicTwoRowItemRenderer) : c.musicResponsiveListItemRenderer ? songRow(c.musicResponsiveListItemRenderer) : null)).filter(Boolean);
      const title = runs(shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title);
      if (items.length) groups.push({ title, items: items.slice(0, 8) });
      if (groups.length >= 4) break;
    }
    return { groups };
  });
}

module.exports = { getDiscover, getGenre };
