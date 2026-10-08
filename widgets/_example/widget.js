// Example widget (a clock) — renderer-only, no main.js needed.
// Folders starting with "_" are ignored. Copy this folder to "widgets/<your-id>" to start a new widget.

export default {
  mount({ page, compact }) {
    compact.left.innerHTML = '<span class="c-time" style="font-size:12px;font-weight:600;font-variant-numeric:tabular-nums"></span>';
    compact.right.innerHTML = '<span class="c-batt muted" style="font-size:12px;font-variant-numeric:tabular-nums"></span>';

    page.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;justify-content:space-between;gap:20px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="c-big serif" style="font-size:64px;line-height:1;font-variant-numeric:tabular-nums"></div>
          <div class="c-date muted" style="font-size:14px"></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Battery</div>
          <div class="c-batt-big" style="font-size:28px;font-weight:600;font-variant-numeric:tabular-nums">—</div>
        </div>
      </div>`;

    const tick = () => {
      const now = new Date();
      const t = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      compact.left.querySelector('.c-time').textContent = t;
      page.querySelector('.c-big').textContent = t;
      page.querySelector('.c-date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    };
    tick();
    setInterval(tick, 5000);

    navigator.getBattery?.().then((b) => {
      const paint = () => {
        const v = `${Math.round(b.level * 100)}%${b.charging ? ' ⚡︎' : ''}`;
        compact.right.querySelector('.c-batt').textContent = v;
        page.querySelector('.c-batt-big').textContent = v;
      };
      paint();
      b.addEventListener('levelchange', paint);
      b.addEventListener('chargingchange', paint);
    });
  }
};
