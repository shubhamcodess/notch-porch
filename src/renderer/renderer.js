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

function applySettings(s) {
  settings = s;
  document.body.className = `theme-${['glass', 'art'].includes(s.theme) ? s.theme : 'dark'}`;
  document.documentElement.style.setProperty('--accent', s.accent);
}
function applyGeometry(n) {
  const root = document.documentElement.style;
  root.setProperty('--notch-w', `${n.width}px`);
  root.setProperty('--notch-h', `${n.hasNotch ? n.height : 32}px`);
  pill.classList.toggle('no-notch', !n.hasNotch);
}
applySettings(settings);
applyGeometry(cfg.notch);
window.notch.on('shell:settings', applySettings);
window.notch.on('shell:geometry', applyGeometry);

// ---------- widgets ----------
const widgets = [];
let holdOpen = false;
const openListeners = [];
let active = 0;

function makeApi(meta, entry) {
  const ns = `w:${meta.id}:`;
  return {
    id: meta.id,
    invoke: (name, ...args) => window.notch.invoke(ns + name, ...args),
    on: (name, cb) => window.notch.on(ns + name, cb),
    get settings() { return settings; },
    // A widget with live activity (e.g. music playing) claims the collapsed slots.
    setActivity: (on) => { if (entry.activity === !!on) return; entry.activity = !!on; renderCompact(); },
    // widgets can tint the shell (used by the "Album colors" theme); null resets
    setPalette: (c) => {
      const r = document.documentElement.style;
      if (c?.length) { r.setProperty('--art-1', c[0]); r.setProperty('--art-2', c[1] || c[0]); }
      else { r.removeProperty('--art-1'); r.removeProperty('--art-2'); }
    },
    // keep the card open (and keyboard-focusable) while a widget needs typing
    // called with true/false whenever the card opens or folds back
    onOpen: (cb) => openListeners.push(cb),
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
    b.className = i === active ? 'active' : '';
    b.setAttribute('aria-label', w.meta.name);
    b.title = w.meta.name;
    b.onclick = () => show(i);
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
function show(i, dir = 1, initial = false) {
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
    // door animation: leaving slides out, entering slides in
    leaving.page.classList.remove('active');
    leaving.page.classList.add('leave');
    entering.page.style.transform = dir > 0 ? 'translateX(28px) scale(.97)' : 'translateX(-28px) scale(.97)';
    entering.page.style.opacity = '0';

    requestAnimationFrame(() => {
      entering.page.classList.add('active');
      entering.page.style.transform = '';
      entering.page.style.opacity = '';
      leaving.mod.onShow?.(false);
      entering.mod.onShow?.(true);
    });

    setTimeout(() => leaving.page.classList.remove('leave'), 380);
  }

  renderDots();
  renderCompact();
  window.notch.invoke('shell:setSetting', 'lastWidget', widgets[active].meta.id);
}
show(active, 1, /* initial */ true);

// two-finger horizontal swipe switches pages
let swipeLock = false;
pill.addEventListener('wheel', (e) => {
  if (!pill.classList.contains('open') || swipeLock || Math.abs(e.deltaX) < 25 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
  swipeLock = true;
  const dir = e.deltaX > 0 ? 1 : -1;
  show(active + dir, dir);
  setTimeout(() => (swipeLock = false), 450);
}, { passive: true });

// ---------- hover / click-through ----------
let interactive = false;
let closeTimer = null;

function setOpen(open) {
  if (!open && holdOpen) return;
  clearTimeout(closeTimer);
  const was = pill.classList.contains('open');
  pill.classList.toggle('open', open);
  pill.classList.toggle('collapsed', !open);
  if (was !== open) openListeners.forEach((cb) => cb(open));
}
function inside(e) {
  const r = pill.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}
document.addEventListener('mousemove', (e) => {
  const hit = inside(e);
  if (hit !== interactive) {
    interactive = hit;
    window.notch.setInteractive(hit);
  }
  if (hit) setOpen(true);
  else if (pill.classList.contains('open') && !closeTimer) {
    closeTimer = setTimeout(() => { closeTimer = null; setOpen(false); }, 280);
  }
});
document.addEventListener('mouseleave', () => {
  interactive = false;
  window.notch.setInteractive(false);
  closeTimer = setTimeout(() => { closeTimer = null; setOpen(false); }, 280);
});
