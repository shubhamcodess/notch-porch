// Synced lyrics from LRCLIB (https://lrclib.net, free, community-maintained).
// getLyrics({ title, artist, album, duration }, cacheDir) -> { lines: [[seconds, text], ...] } | null
// Matching is deliberately strict: no lyrics beats the wrong song's lyrics.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://lrclib.net/api/search';
const UA = 'NotchPorch (https://github.com/shubhamcodess/notch-porch)';
const MISS_TTL = 3 * 24 * 3600 * 1000;
const NOISE = new Set(['official', 'video', 'lyric', 'lyrics', 'audio', 'hd', 'full', 'song', 'music', 'version', 'remastered', 'remaster', 'visualizer', 'feat', 'ft', 'prod', 'the', 'a', 'an', 'from']);

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stripBrackets = (s) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
const tokens = (s) => fold(stripBrackets(s)).split(/[^a-z0-9ऀ-ॿ]+/).filter((w) => w && !NOISE.has(w));

// A remix, slowed or acoustic cut has different timing (and often different words) from the original,
// so the version words of the track and the lyrics entry must agree exactly.
const VERSION = new Set(['remix', 'slowed', 'reverb', 'sped', 'speedup', 'nightcore', 'acoustic', 'live', 'unplugged', 'instrumental', 'karaoke', 'lofi', 'lo', 'fi', 'mashup', 'cover', 'reprise', 'unwind', 'flip', 'edit', 'extended', 'bootleg', 'rework', 'mix']);
const versionOf = (s) => new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => VERSION.has(w)));
const sameVersion = (a, b) => { const A = versionOf(a), B = versionOf(b); return A.size === B.size && [...A].every((w) => B.has(w)); };

function cleanTitle(raw) {
  let t = String(raw || '').split('|')[0];                 // "Song | Artist | Prod. by X"
  t = t.replace(/\s[-–—]\s(from|official|slowed|sped|lyric|remaster).*$/i, '');
  return stripBrackets(t).replace(/\s+(ft|feat)\.?\s.*$/i, '').replace(/\s+/g, ' ').trim();
}
const firstArtist = (a) => String(a || '').split(/\s*(?:&|,|·|\bx\b|\band\b|\bfeat\.?|\bft\.?)\s*/i)[0].trim();

function dice(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return (2 * n) / (A.size + B.size);
}

// share of letters written in the Latin alphabet (1 = English / romanised, 0 = Tamil, Hindi script, etc.)
function latinShare(lrc) {
  const letters = String(lrc || '').replace(/\[[^\]]*\]/g, '').match(/\p{L}/gu) || [];
  return letters.length ? letters.filter((c) => /[A-Za-z\u00C0-\u024F]/.test(c)).length / letters.length : 0;
}

// latest timestamp in an LRC file (seconds)
function lastStamp(lrc) {
  let max = 0;
  for (const m of String(lrc || '').matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) max = Math.max(max, +m[1] * 60 + +m[2]);
  return max;
}

function parseLrc(text) {
  const lines = [];
  for (const raw of String(text || '').split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const lyric = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) lines.push([Math.round((+m[1] * 60 + +m[2]) * 100) / 100, lyric]);
  }
  return lines.sort((x, y) => x[0] - y[0]);
}

async function search(q) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
      if (res.ok) return await res.json();
      if (res.status < 500) return [];
    } catch { /* retry once */ }
  }
  return null;   // service unreachable: not cached as a miss
}

function pick(results, meta) {
  const wantTitle = tokens(cleanTitle(meta.title)), wantArtists = tokens(meta.artist);
  let best = null;
  for (const r of results || []) {
    if (!r.syncedLyrics) continue;
    const sim = dice(wantTitle, tokens(r.trackName));
    if (sim < 0.6) continue;
    const dd = meta.duration > 0 && r.duration > 0 ? Math.abs(r.duration - meta.duration) : null;
    if (dd !== null && dd > 5) continue;                                  // a different cut
    // entries often state the right length but are timed for a different (longer) cut of the song: a lyric
    // that is sung after the track has ended cannot belong to this recording
    if (meta.duration > 0 && lastStamp(r.syncedLyrics) > meta.duration + 6) continue;
    if (!sameVersion(meta.title, r.trackName)) continue;                  // remix vs original, slowed vs normal…
    const artistOk = wantArtists.length && tokens(r.artistName).some((w) => wantArtists.includes(w));
    if (!artistOk && !(dd !== null && dd <= 1.5 && sim >= 0.99)) continue;     // same title, unrelated artist
    // prefer English-letter lyrics (romanised Hindi/Tamil/etc.) over the same song in its native script
    const score = sim + (artistOk ? 0.5 : 0) - (dd ?? 3) * 0.05 + latinShare(r.syncedLyrics) * 1.2;
    if (!best || score > best.score) best = { score, r };
  }
  return best && best.r;
}

async function getLyrics(meta, cacheDir) {
  if (!meta || !meta.title) return null;
  const key = crypto.createHash('sha1').update(`v7|${fold(meta.title)}|${fold(meta.artist)}|${Math.round((meta.duration || 0) / 4)}`).digest('hex');
  const file = cacheDir && path.join(cacheDir, 'lyrics', `${key}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c.lines) return { lines: c.lines };
    if (Date.now() - c.at < MISS_TTL) return null;
  } catch { /* not cached */ }

  const title = cleanTitle(meta.title), artist = firstArtist(meta.artist);
  const versions = [...versionOf(meta.title)].join(' ');          // e.g. "remix": the cleaned title drops it, but searching with it finds the right entries
  const queries = [...new Set([`${title} ${artist}`, versions && `${title} ${versions}`, title, `${meta.title} ${meta.artist}`].map((q) => (q || '').trim()).filter(Boolean))];
  // gather candidates from every query, then choose the best overall (not just the first query that matches)
  const pool = new Map();
  let found = null, reachable = false;
  for (const q of queries) {
    const results = await search(q);
    if (results === null) continue;
    reachable = true;
    for (const r of results) if (!pool.has(r.id)) pool.set(r.id, r);
    found = pick([...pool.values()], meta);
    if (found && latinShare(found.syncedLyrics) > 0.8) break;      // good enough: an English-letter match
  }
  const lines = found ? parseLrc(found.syncedLyrics) : null;
  if (reachable && file) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: Date.now(), lines: lines && lines.length ? lines : null })); } catch { /* cache is best-effort */ }
  }
  return lines && lines.length ? { lines } : null;
}

module.exports = { getLyrics, cleanTitle, pick, parseLrc, sameVersion, latinShare };
