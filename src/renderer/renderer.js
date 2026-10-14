// Notch Porch — shell renderer.
// Loads every widget listed by main, gives each a page + compact slots,
// and handles hover-to-open, click-through and page switching.

const pill = document.getElementById('pill');
const pagesEl = pill.querySelector('.pages');
const dotsEl = pill.querySelector('.dots');
const leftSlot = pill.querySelector('.slot.left');
const rightSlot = pill.querySelector('.slot.right');

const cfg = await window.notch.invoke('shell:config');
let settings = cfg.settings;
// tiny page-switcher glyphs, chosen by a widget's manifest "icon"
const NAV_ICONS = {
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.5-3.4 3-5.2 6.2-5.2s5.7 1.8 6.2 5.2"/><path d="M16 4.9a3.2 3.2 0 0 1 0 6.2M18.4 14.9c1.6.7 2.6 2.2 2.9 4.1"/></svg>'
};
let hasNotch = false;
let tuckL = false, tuckR = false;   // side items folded behind the notch to leave room for app menus / status icons
let playingNow = false;
let lastMenu = { gap: null, gapR: null };
const sideW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side')) || 70;
// room an item needs: its distance from the notch, its own width, and a little air
const needFor = (sel) => {
  const el = document.querySelector(sel);
  const edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-gap')) || 10;
  return edge + Math.max(el ? el.offsetWidth : 0, 22) + 8;
};
const decide = (cur, gap, need) => {
  if (settings.menuAvoid === false || !hasNotch || gap == null) return false;
  if (gap < need) return true;                     // it no longer fits: tuck it away
  if (gap > need + 14) return false;               // room again (hysteresis avoids flapping)
  return cur;
};
function updateLine() {
  // a thin pulse under the notch says "music is playing" when both side items are hidden
  document.body.classList.toggle('line-on', tuckL && tuckR && playingNow);
}
function applyMenubar(m) {
  lastMenu = m;
  const l = decide(tuckL, m.gap, needFor('.slot.left > .slot')), r = decide(tuckR, m.gapR, needFor('.slot.right > .slot'));
  if (l !== tuckL) { tuckL = l; pill.classList.toggle('tuck-left', l); }
  if (r !== tuckR) { tuckR = r; pill.classList.toggle('tuck-right', r); }
  updateLine();
}

function applySettings(s) {
  settings = s;
  document.body.className = `theme-${['glass', 'art'].includes(s.theme) ? s.theme : 'dark'}`;
  document.documentElement.style.setProperty('--accent', s.accent);
  applyMenubar(lastMenu);
}
function applyGeometry(n) {
  const root = document.documentElement.style;
  root.setProperty('--notch-w', `${n.width}px`);
  root.setProperty('--notch-h', `${n.hasNotch ? n.height : 32}px`);
  pill.classList.toggle('no-notch', !n.hasNotch);
  hasNotch = n.hasNotch;
  applyMenubar(lastMenu);
}
if (cfg.platform && cfg.platform !== 'mac') {      // the Windows layout lives in its own file; the Mac build never loads it
  document.documentElement.classList.add(`os-${cfg.platform}`);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `platform-${cfg.platform}.css`;
  document.head.appendChild(l);
}
applySettings(settings);
applyGeometry(cfg.notch);
window.notch.on('shell:settings', applySettings);
window.notch.on('shell:geometry', applyGeometry);
window.notch.on('shell:menubar', applyMenubar);
// focus left the card while a widget was holding it open (the user clicked elsewhere): release and fold back
window.notch.on('shell:blur', () => { holdOpen = false; setOpen(false); });

// ---------- caption under the notch ----------
const capEl = document.querySelector('.lyric-caption'), capText = capEl.querySelector('.cap-text');
let capCur = null, capShrink = null;
function setCaption(text) {
  if (text === capCur) return;
  capCur = text;
  document.body.classList.toggle('cap-on', !!text);
  if (!text) return;                                  // keep the old text while it fades out
  const old = capText.querySelector('.cur');
  const next = document.createElement('span');
  next.className = 'cur'; next.textContent = text;
  if (old) { old.className = 'old'; next.classList.add('in'); setTimeout(() => old.remove(), 360); } else capText.textContent = '';
  capText.append(next);
  // the box is always at least as wide as both lines (nothing is ever clipped); it narrows once the old line has gone
  const w = next.offsetWidth, widest = old ? Math.max(w, old.offsetWidth) : w;
  clearTimeout(capShrink);
  capText.style.transition = 'none';
  capText.style.width = `${widest}px`;
  if (widest !== w) capShrink = setTimeout(() => { capText.style.transition = 'width .4s var(--ease)'; capText.style.width = `${w}px`; }, 380);
}

// ---------- widgets ----------
const widgets = [];
let holdOpen = false;
const openListeners = [];
let active = 0;

function makeApi(meta, entry) {
  const ns = `w:${meta.id}:`;
  return {
    id: meta.id,
    // a widget's main side may still be setting up when its page loads: wait for the handler instead of failing
    invoke: async (name, ...args) => {
      for (let i = 0; ; i++) {
        try { return await window.notch.invoke(ns + name, ...args); } catch (e) {
          if (i < 60 && /No handler registered/.test(String(e && e.message))) { await new Promise((r) => setTimeout(r, 250)); continue; }
          throw e;
        }
      }
    },
    on: (name, cb) => window.notch.on(ns + name, cb),
    get settings() { return settings; },
    // A widget with live activity (e.g. music playing) claims the collapsed slots.
    setActivity: (on) => { if (entry.activity === !!on) return; entry.activity = !!on; renderCompact(); },
    // widgets can tint the shell (used by the "Album colors" theme); null resets
    setPalette: (c) => {
      const r = document.documentElement.style;
      if (c?.length) { r.setProperty('--art-1', c[0]); r.setProperty('--art-2', c[1] || c[0]); r.setProperty('--art-vivid', c[2] || c[0]); }
      else { r.removeProperty('--art-1'); r.removeProperty('--art-2'); r.removeProperty('--art-vivid'); }
    },
    // a small pip on this widget's page dot (e.g. something needs attention); 0 clears it
    setBadge: (n) => { entry.badge = Number(n) || 0; renderDots(); },
    // keep the card open (and keyboard-focusable) while a widget needs typing
    // called with true/false whenever the card opens or folds back
    onOpen: (cb) => openListeners.push(cb),
    // persist a setting (also updates the local copy so widgets see it immediately)
    setSetting: (k, v) => { settings = { ...settings, [k]: v }; window.notch.invoke('shell:setSetting', k, v); },
    // a one-line caption under the notch (e.g. a lyric); null hides it. Only visible while the card is closed.
    setCaption: (text) => setCaption(text),
    // true while music is actually playing (drives the thin "now playing" line under the notch)
    setPlaying: (on) => { playingNow = !!on; updateLine(); },
    // 0..1 music energy; drives pulse effects in CSS (--beat)
    setBeat: (v) => document.documentElement.style.setProperty('--beat', String(Math.round(v * 100) / 100)),
    hold: (on) => { holdOpen = !!on; window.notch.invoke('shell:hold', !!on); if (on) setOpen(true); },
    setHeight: (px) => {
      if (px) document.documentElement.style.setProperty('--open-h', `${px}px`);
      else document.documentElement.style.removeProperty('--open-h');
    },
    open: () => setOpen(true)
  };
}

for (const meta of cfg.widgets) {
  try {
    const mod = (await import(`../../widgets/${meta.id}/${meta.renderer || 'widget.js'}`)).default;
    const page = document.createElement('section');
    page.className = 'page';
    page.setAttribute('aria-label', meta.name);
    pagesEl.appendChild(page);
    const compact = { left: document.createElement('div'), right: document.createElement('div') };
    compact.left.className = compact.right.className = 'slot';
    const entry = { meta, mod, page, compact, activity: false };
    entry.api = makeApi(meta, entry);
    await mod.mount({ page, compact, api: entry.api });
    widgets.push(entry);
  } catch (e) {
    console.error(`Widget ${meta.id} failed to load`, e);
  }
}

const saved = widgets.findIndex((w) => w.meta.id === settings.lastWidget);
if (saved >= 0) active = saved;

function renderDots() {
  dotsEl.replaceChildren(...widgets.map((w, i) => {
    const b = document.createElement('button');
    b.className = (i === active ? 'active' : '') + (w.badge ? ' badge' : '');
    b.setAttribute('aria-label', w.meta.name);
    b.title = w.meta.name;
    b.innerHTML = NAV_ICONS[w.meta.icon] || '<i></i>';
    b.onclick = () => show(i, i > active ? 1 : -1);
    return b;
  }));
}
function renderCompact() {
  // priority: a widget with live activity, else the selected page
  const w = widgets.find((x) => x.activity) || widgets[active];
  if (!w || leftSlot.firstChild === w.compact.left) return; // re-inserting nodes restarts CSS animations
  leftSlot.replaceChildren(w.compact.left);
  rightSlot.replaceChildren(w.compact.right);
}
function show(i, dir = 1, initial = false, fromDrag = false) {
  if (!widgets.length) return;
  const prev = active;
  active = (i + widgets.length) % widgets.length;
  if (prev === active && !initial) return;

  const leaving = widgets[prev];
  const entering = widgets[active];

  if (initial || prev === active) {
    // no animation on first load — just make the page visible
    entering.page.classList.add('active');
    entering.mod.onShow?.(true);
  } else {
    // card flip: the leaving page turns away, the entering page turns in from the side it came from
    leaving.page.classList.remove('active');
    leaving.page.classList.add('leave');
    if (!fromDrag) {
      entering.page.style.transform = `rotateY(${dir > 0 ? 62 : -62}deg) scale(.96)`;
      entering.page.style.opacity = '0';
      if (dir < 0) leaving.page.style.transform = 'rotateY(62deg) scale(.96)';   // going back: it leaves to the right
    }

    requestAnimationFrame(() => {
      entering.page.classList.add('active');
      entering.page.style.transform = '';
      entering.page.style.opacity = '';
      entering.page.style.pointerEvents = '';
      leaving.page.style.transform = '';
      leaving.page.style.opacity = '';
      leaving.mod.onShow?.(false);
      entering.mod.onShow?.(true);
    });

    setTimeout(() => leaving.page.classList.remove('leave'), 620);
  }

  renderDots();
  renderCompact();
  window.notch.invoke('shell:setSetting', 'lastWidget', widgets[active].meta.id);
}
// with a page switcher there is a little more room so it can sit evenly below the content
if (widgets.length > 1) document.documentElement.style.setProperty('--base-h', '184px');
show(active, 1, /* initial */ true);

// two-finger horizontal swipe: the card follows your fingers and flips once you pass the halfway point
const FLIP_DEG = 62, SWIPE_PX = 230;
let drag = { acc: 0, target: -1, timer: null, committed: false };
function dragApply(p) {
  if (!p) return;
  const sign = Math.sign(p), a = Math.min(1, Math.abs(p));
  const t = (active + sign + widgets.length) % widgets.length;
  if (drag.target !== -1 && drag.target !== t) { const old = widgets[drag.target].page.style; old.transform = ''; old.opacity = ''; }
  drag.target = t;
  const cur = widgets[active].page.style, tgt = widgets[t].page.style;
  cur.transition = tgt.transition = 'none';
  cur.transform = `rotateY(${-sign * a * FLIP_DEG}deg) scale(${1 - a * 0.04})`;
  cur.opacity = String(1 - a);
  tgt.transform = `rotateY(${sign * (1 - a) * FLIP_DEG}deg) scale(${0.96 + a * 0.04})`;
  tgt.opacity = String(a);
}
function dragEnd(forceCommit = false) {
  const t = drag.target, p = drag.acc / SWIPE_PX;
  const cur = widgets[active].page.style;
  cur.transition = '';
  if (t >= 0) widgets[t].page.style.transition = '';
  if (t >= 0 && (forceCommit || Math.abs(p) > 0.34)) show(t, p > 0 ? 1 : -1, false, true);
  else {                                            // not far enough: spring back
    cur.transform = ''; cur.opacity = '';
    if (t >= 0) { widgets[t].page.style.transform = ''; widgets[t].page.style.opacity = ''; }
  }
  drag.target = -1;
}
pill.addEventListener('wheel', (e) => {
  if (widgets.length < 2 || !pill.classList.contains('open')) return;
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
  if (!horizontal && drag.target === -1) return;
  if (!drag.committed) {
    drag.acc += e.deltaX;
    dragApply(Math.max(-1, Math.min(1, drag.acc / SWIPE_PX)));
    if (Math.abs(drag.acc) >= SWIPE_PX) { drag.committed = true; dragEnd(true); }   // a full swipe: flip now, ignore the momentum tail
  }
  clearTimeout(drag.timer);
  drag.timer = setTimeout(() => {
    if (!drag.committed && drag.target !== -1) dragEnd(false);
    drag.acc = 0; drag.committed = false; drag.target = -1;
  }, 140);
}, { passive: true });

// ---------- hover / click-through ----------
let interactive = false;
let closeTimer = null;

function setOpen(open) {
  clearTimeout(closeTimer);
  const was = pill.classList.contains('open');
  pill.classList.toggle('open', open);
  pill.classList.toggle('collapsed', !open);
  if (was !== open) openListeners.forEach((cb) => cb(open));
  // a "transient" page (manifest: "transient": true) is a visit: fold back to the first normal page after closing
  if (was && !open && widgets[active]?.meta.transient) {
    const home = widgets.findIndex((w) => !w.meta.transient);
    if (home >= 0) setTimeout(() => { if (!pill.classList.contains('open')) show(home, -1); }, 500);
  }
}
function inside(e) {
  const r = pill.getBoundingClientRect();
  // while tucked, the strip left of the notch belongs to the frontmost app's menus: let clicks through
  const shut = !pill.classList.contains('open');
  const left = tuckL && shut ? r.left + sideW() : r.left;
  const right = tuckR && shut ? r.right - sideW() : r.right;
  return e.clientX >= left && e.clientX <= right && e.clientY >= r.top && e.clientY <= r.bottom;
}
// leaving the pill folds it back like always; while a widget holds it (typing in search) allow a little more slack
const closeDelay = () => (holdOpen ? 650 : 280);
document.addEventListener('mousemove', (e) => {
  const hit = inside(e);
  if (hit !== interactive) {
    interactive = hit;
    window.notch.setInteractive(hit);
  }
  if (hit) setOpen(true);
  else if (pill.classList.contains('open') && !closeTimer) {
    closeTimer = setTimeout(() => { closeTimer = null; setOpen(false); }, closeDelay());
  }
});
document.addEventListener('mouseleave', () => {
  interactive = false;
  window.notch.setInteractive(false);
  closeTimer = setTimeout(() => { closeTimer = null; setOpen(false); }, closeDelay());
});
