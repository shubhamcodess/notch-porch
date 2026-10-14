// Room widget: the second card. A compact row under the notch (you, a room ID, Host); once you're in a room the
// same row shows the room and a close button, with the members below. Deleting this folder removes the feature.
import { initials, hueOf } from './names-ui.js';

const I = (body, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  people: (n) => I('<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.5-3.4 3-5.2 6.2-5.2s5.7 1.8 6.2 5.2"/><path d="M16 4.9a3.2 3.2 0 0 1 0 6.2M18.4 14.9c1.6.7 2.6 2.2 2.9 4.1"/>', n),
  live: (n) => I('<circle cx="12" cy="12" r="1.8"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.4 9.4 0 0 0 0 13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2"/>', n),
  join: (n) => I('<circle cx="9.5" cy="8" r="3.4"/><path d="M3.2 20c.5-3.4 3-5.2 6.3-5.2 1.9 0 3.5.6 4.7 1.7"/><path d="M18.5 9v6M15.5 12h6"/>', n),
  enter: (n) => I('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>', n),
  copy: (n) => I('<rect x="8.5" y="8.5" width="11" height="11" rx="2.6"/><path d="M15.5 8.5V6.6a2 2 0 0 0-2-2H6.6a2 2 0 0 0-2 2v6.9a2 2 0 0 0 2 2h1.9"/>', n),
  check: (n) => I('<path d="M5 12.5l4.5 4.5L19 7.5"/>', n),
  x: (n) => I('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', n),
  power: (n) => I('<path d="M12 3.5v8M7.3 6.8a7.2 7.2 0 1 0 9.4 0"/>', n),
  crown: (n) => I('<path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z"/>', n),
  note: (n) => I('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', n),
  lock: (n) => I('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>', n)
};

const CSS = `
.r-top { display: flex; align-items: center; gap: 8px; height: 28px; flex-shrink: 0; }
.r-idle, .r-room { display: none; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
.r-idle.show, .r-room.show { display: flex; }

/* you: a friendly auto-assigned name and avatar; tap the avatar for a new one */
.r-me { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 0 0 auto; border: 0; background: transparent; color: var(--text); padding: 0; cursor: pointer; text-align: left; }
.r-me .nm { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font: 600 12.5px var(--sans); letter-spacing: -.15px; }
.r-me .nm small { display: block; font-weight: 400; font-size: 10.5px; color: rgba(255,255,255,.42); letter-spacing: 0; }
.r-av { position: relative; width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; overflow: hidden; display: grid; place-items: center; font: 700 10px var(--sans); color: #fff; box-shadow: 0 0 0 .5px rgba(255,255,255,.16); transition: transform .25s var(--ease); }
.r-av img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #2c2c2e; }
.r-me:hover .r-av { transform: rotate(-8deg) scale(1.06); }
.r-me:active .r-av { transform: scale(.94); }
.r-av.sm { width: 24px; height: 24px; font-size: 9px; }

.r-btn { height: 30px; padding: 0 12px 0 10px; border: 0; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; font: 600 12.5px var(--sans); letter-spacing: -.1px; cursor: pointer; transition: background .15s, transform .12s, color .15s; }
.r-btn:active { transform: scale(.96); }
.r-btn.primary { background: rgba(255,255,255,.9); color: #000; }
.r-btn.primary:hover { background: #fff; }
.r-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.r-actions .r-host { height: 28px; border-radius: 9px; padding: 0 10px 0 8px; font-size: 12px; gap: 5px; }
.r-actions .r-joinbar { flex: 1; min-width: 0; }
.r-joinbar { display: flex; align-items: center; gap: 6px; height: 28px; flex-shrink: 0; padding: 0 3px 0 10px; border-radius: 9px; background: rgba(255,255,255,.1); transition: box-shadow .15s; }
.r-joinbar:focus-within { box-shadow: 0 0 0 1.5px rgba(255,255,255,.32); }
.r-input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0; outline: none; background: transparent; color: var(--text); font: 12px var(--sans); user-select: text; }
.r-input::placeholder { color: rgba(255,255,255,.4); }
.r-joinbar .r-btn { height: 22px; border-radius: 7px; padding: 0 8px 0 7px; font-size: 11.5px; gap: 4px; }
.r-busy .r-top, .r-busy .r-joinbar { opacity: .5; pointer-events: none; }

.r-empty { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: rgba(255,255,255,.4); font-size: 12px; text-align: center; }
.r-empty .you { font-size: 11px; color: rgba(255,255,255,.3); }
.r-empty.err { color: #ff9a9a; }

/* in a room: its ID (tap to copy) and a close / leave button */
.r-id { flex: 1; min-width: 0; height: 28px; padding: 0 10px; border: 0; border-radius: 10px; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.075); color: var(--text); font: 600 12.5px var(--sans); letter-spacing: -.2px; cursor: pointer; text-align: left; transition: background .15s; }
.r-id:hover { background: rgba(255,255,255,.12); }
.r-id .live { color: #5fe38a; display: flex; flex-shrink: 0; animation: r-pulse 2.4s ease-in-out infinite; }
.r-id .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-id .cp { color: rgba(255,255,255,.5); display: flex; flex-shrink: 0; }
.r-close { height: 28px; padding: 0 10px 0 8px; border: 0; border-radius: 9px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; background: rgba(255,255,255,.07); color: rgba(255,255,255,.75); font: 600 11.5px var(--sans); cursor: pointer; transition: background .15s, color .15s; }
.r-close:hover { background: rgba(255,69,58,.26); color: #ff8e86; }
@keyframes r-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }

.r-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin: 0 2px; font-size: 11px; color: rgba(255,255,255,.42); }
.r-meta .sp { flex: 1; }
.r-list { display: flex; flex-direction: column; gap: 1px; min-height: 0; overflow-y: auto; scrollbar-width: none; flex: 1; }
.r-list::-webkit-scrollbar { display: none; }
.r-mem, .r-req { display: flex; align-items: center; gap: 10px; flex-shrink: 0; height: 34px; padding: 0 4px; border-radius: 9px; box-sizing: border-box; }
.r-mem .n, .r-req .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; font-weight: 500; letter-spacing: -.15px; }
.r-mem .tag { font-size: 10.5px; color: rgba(255,255,255,.4); }
.r-mem .crown { color: rgba(255,214,102,.95); display: flex; }
.r-sec { margin: 6px 4px 1px; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; color: rgba(255,255,255,.4); display: flex; gap: 5px; align-items: center; flex-shrink: 0; }
.r-req { height: 40px; }
.r-req img { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); flex-shrink: 0; }
.r-req .t { display: flex; flex-direction: column; }
.r-req .t b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-req .t span { font-size: 10.5px; color: rgba(255,255,255,.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-yes, .r-no { width: 26px; height: 26px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; transition: background .15s, transform .12s; }
.r-yes { background: rgba(48,209,88,.22); color: #5fe38a; } .r-yes:hover { background: rgba(48,209,88,.38); }
.r-no { background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); } .r-no:hover { background: rgba(255,69,58,.3); color: #ff8e86; }
.r-yes:active, .r-no:active { transform: scale(.9); }
.r-up { color: rgba(255,255,255,.62); }
`;

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// free generated avatars (DiceBear "fun-emoji"), deterministic from the name so everyone sees the same face;
// initials sit underneath as the fallback while loading or offline
const avatar = (name, cls = '') => `<span class="r-av ${cls}" style="background:hsl(${hueOf(name)} 48% 44%)">${initials(name)}<img alt="" loading="lazy" src="https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(name)}&radius=50" onerror="this.remove()"></span>`;

let pageRef = null;   // this widget's page, so onShow can reach the closure inside mount

export default {
  async mount({ page, api }) {
    pageRef = page;
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
    page.innerHTML = `
      <div class="r-idle show">
        <div class="r-actions">
          <button class="r-me" aria-label="New name and avatar" title="Tap for a new name"></button>
          <button class="r-btn primary r-host" aria-label="Host a room">${ICONS.live(13)}<span>Host</span></button>
          <form class="r-joinbar">
            <input class="r-input" placeholder="Room ID" maxlength="24" spellcheck="false" autocomplete="off" aria-label="Room ID">
            <button class="r-btn primary r-go" type="submit" aria-label="Join this room">${ICONS.join(13)}<span>Join</span></button>
          </form>
        </div>
        <div class="r-empty">${ICONS.people(18)}<span class="msg">Listen together</span><span class="you"></span></div>
      </div>
      <div class="r-room">
        <div class="r-top">
          <button class="r-id" aria-label="Copy room ID"><span class="live">${ICONS.live(15)}</span><span class="t"></span><span class="cp">${ICONS.copy(14)}</span></button>
          <button class="r-close"></button>
        </div>
        <div class="r-meta"></div>
        <div class="r-list"></div>
      </div>`;
    const $ = (s) => page.querySelector(s);
    const idle = $('.r-idle'), room = $('.r-room'), list = $('.r-list'), meta = $('.r-meta');
    const me = $('.r-me'), msg = $('.r-empty .msg'), you = $('.r-empty .you'), empty = $('.r-empty'), input = $('.r-input');
    let visible = false;
    // a taller card in a room, so three members show before the list scrolls
    const fit = () => api.setHeight(visible && current && (current.phase === 'host' || current.phase === 'guest') ? 244 : null);
    const idBtn = $('.r-id'), idText = idBtn.querySelector('.t'), closeBtn = $('.r-close');

    const MESSAGES = { 'not-found': 'No room with that ID', 'bad-id': 'Check the ID', closed: 'The host closed the room' };
    let current = null;

    function render(v) {
      current = v;
      const inRoom = v.phase === 'host' || v.phase === 'guest';
      idle.classList.toggle('show', !inRoom);
      room.classList.toggle('show', inRoom);
      idle.classList.toggle('r-busy', v.phase === 'joining');
      api.setBadge(v.phase === 'host' ? v.requests.length : 0);
      fit();

      if (!inRoom) {
        me.innerHTML = avatar(v.profile);
        you.textContent = `You are ${v.profile}`;
        const text = v.phase === 'joining' ? 'Joining…' : (MESSAGES[v.error] || 'Listen together');
        msg.textContent = text;
        empty.classList.toggle('err', !!MESSAGES[v.error] && v.phase !== 'joining');
        return;
      }

      idText.textContent = v.roomId;
      closeBtn.innerHTML = v.phase === 'host' ? `${ICONS.power(13)}<span>Close</span>` : `${ICONS.x(13)}<span>Leave</span>`;
      closeBtn.setAttribute('aria-label', v.phase === 'host' ? 'Close room' : 'Leave room');
      meta.innerHTML = `${ICONS.people(12)}<span>${v.members.length} of ${v.max}</span><span class="sp"></span>`
        + (v.phase === 'guest' ? `${ICONS.lock(11)}<span>${esc(v.hostName)} controls the music</span>` : `${ICONS.note(11)}<span>Share the ID</span>`);

      const rows = v.members.map((m) => `
        <div class="r-mem">${avatar(m.name, 'sm')}<span class="n">${esc(m.name)}</span>
          ${m.me ? '<span class="tag">you</span>' : ''}${m.host ? `<span class="crown" title="Host">${ICONS.crown(13)}</span>` : ''}</div>`);
      if (v.phase === 'host' && v.requests.length) {
        rows.push(`<div class="r-sec">${ICONS.note(11)} Requests</div>`);
        rows.push(...v.requests.map((r) => `
          <div class="r-req" data-rid="${esc(r.rid)}">${r.track.art ? `<img alt="" src="${esc(r.track.art)}">` : '<img alt="">'}
            <div class="t"><b>${esc(r.track.title)}</b><span>${esc(r.from)}</span></div>
            <button class="r-no" data-ok="0" aria-label="Decline">${ICONS.x(13)}</button>
            <button class="r-yes" data-ok="1" aria-label="Accept">${ICONS.check(13)}</button></div>`));
      }
      if (v.upNext.length) {
        rows.push(`<div class="r-sec">${ICONS.note(11)} Up next</div>`);
        rows.push(...v.upNext.slice(0, 4).map((t) => `
          <div class="r-req r-up">${t.art ? `<img alt="" src="${esc(t.art)}">` : '<img alt="">'}
            <div class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div></div>`));
      }
      list.innerHTML = rows.join('');
    }

    me.onclick = () => api.invoke('reroll');
    $('.r-host').onclick = () => api.invoke('host');
    $('.r-joinbar').onsubmit = (e) => { e.preventDefault(); if (input.value.trim()) api.invoke('join', input.value); };
    closeBtn.onclick = () => api.invoke('leave');
    idBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(current?.roomId || ''); } catch { /* clipboard can be blocked */ }
      const cp = idBtn.querySelector('.cp');
      cp.innerHTML = ICONS.check(14);
      setTimeout(() => { cp.innerHTML = ICONS.copy(14); }, 1200);
    };
    list.onclick = (e) => {
      const b = e.target.closest('button[data-ok]');
      const rid = b && b.closest('.r-req')?.dataset.rid;
      if (rid) api.invoke('verdict', { rid, ok: b.dataset.ok === '1' });
    };
    input.onkeydown = (e) => { if (e.key === 'Escape') { input.value = ''; input.blur(); } };

    api.on('room', render);
    page.__roomShow = (on) => { visible = on; fit(); };
    render(await api.invoke('snapshot'));
  },

  onShow(on) { pageRef?.__roomShow?.(on); }
};
