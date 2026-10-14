// Room widget, main side. Wires the transport (room-core) to the music widget through the cross-widget bus
// and to this widget's page. It is the only file that knows rooms exist: delete the widgets/room folder and
// the app behaves exactly as before (the music widget's hooks stay dormant).
const { Room, randomId, MAX_MEMBERS } = require('./room-core');
const names = require('./names');

exports.setup = async (ctx) => {
  const bus = ctx.bus;
  let room = null;
  let joinTimer = null;
  // your profile: a friendly name that sticks (tap the avatar for a new one while you're not in a room)
  const profileName = () => { if (!ctx.settings.roomName) ctx.settings.roomName = names.cute(); return ctx.settings.roomName; };
  const view = { profile: profileName(), phase: 'idle', roomId: '', me: null, hostName: '', members: [], requests: [], upNext: [], pending: [], error: '', max: MAX_MEMBERS };
  let last = null;          // host: last state we published, to publish only real changes

  const push = () => ctx.send('room', { ...view });
  const reset = (error = '') => {
    clearTimeout(joinTimer);
    Object.assign(view, { phase: 'idle', roomId: '', me: null, hostName: '', members: [], requests: [], upNext: [], pending: [], error });
    last = null;
    push();
    ctx.rebuildMenu?.();
  };
  const unlock = () => bus.emit('music:lock', { locked: false });
  const bindMembers = () => { view.members = room.list().map((m) => ({ id: m.id, name: m.name, host: m.host, me: m.id === view.me.id })); push(); };

  function leave(announce = true) {
    if (room) { room.stop(announce); room = null; }
    unlock();
    reset();
  }

  function host() {
    if (room) return view;
    const name = profileName();
    view.me = { id: randomId(), name };
    view.roomId = names.roomIdFor(name);
    view.hostName = name;
    view.phase = 'host';
    room = new Room({ roomId: view.roomId, me: view.me, isHost: true }).start();
    room.on('members', bindMembers);
    room.on('request', (r) => {
      if (view.requests.some((x) => x.track.id === r.track?.id) || view.requests.length >= 20 || !r.track?.id) return;
      view.requests.push({ rid: r.rid, from: r.from.name, track: r.track });
      push();
    });
    bindMembers();
    return view;
  }

  function join(input) {
    if (room) return view;
    const id = names.normalizeId(input);
    if (!/^[A-Za-z]+-[A-Za-z]+-\d{2}$/.test(id)) { view.error = 'bad-id'; push(); return view; }
    view.me = { id: randomId(), name: profileName() };
    view.roomId = id;
    view.phase = 'joining';
    view.error = '';
    room = new Room({ roomId: id, me: view.me, isHost: false }).start();
    let following = false;
    room.on('members', bindMembers);
    room.on('host-seen', (h) => {
      if (following) return;
      following = true;
      clearTimeout(joinTimer);
      view.phase = 'guest';
      view.hostName = h.name;
      bus.emit('music:lock', { locked: true, host: h.name });
      bindMembers();
    });
    room.on('state', (st, hostNow) => {
      if (!following) return;
      const pos = st.pos + (st.playing ? Math.max(0, hostNow - st.hostT) / 1000 : 0);
      bus.emit('music:apply', { vid: st.vid, playing: st.playing, pos, title: st.title });
      // an accepted song starts playing: it leaves the "up next" list
      if (view.upNext.length && view.upNext[0].id === st.vid) { view.upNext.shift(); push(); }
    });
    room.on('verdict', (v) => {
      view.pending = view.pending.filter((id) => id !== v.track?.id);
      if (v.ok && v.track && !view.upNext.some((t) => t.id === v.track.id)) view.upNext.push(v.track);
      push();
    });
    room.on('ended', () => { leave(false); view.error = 'closed'; push(); });
    joinTimer = setTimeout(() => {
      if (view.phase === 'joining') { room?.stop(false); room = null; reset('not-found'); }
    }, 10000);
    push();
    return view;
  }

  // ---- the page talks to us ----
  ctx.handle('snapshot', () => ({ ...view }));
  ctx.handle('host', () => { const v = host(); push(); return v; });
  ctx.handle('join', (id) => join(id));
  ctx.handle('leave', () => { leave(true); return true; });
  ctx.handle('reroll', () => {
    if (view.phase !== 'idle') return false;
    view.profile = names.cute();
    ctx.setSetting('roomName', view.profile);
    push();
    return true;
  });
  ctx.handle('verdict', ({ rid, ok }) => {
    const i = view.requests.findIndex((r) => r.rid === rid);
    if (i < 0 || !room || view.phase !== 'host') return false;
    const [r] = view.requests.splice(i, 1);
    room.verdict(r.rid, ok, r.track);
    if (ok) { view.upNext.push(r.track); bus.emit('music:enqueue', r.track); }
    push();
    return true;
  });

  // ---- the music widget talks to us ----
  bus.on('music:state', (s) => {
    if (!room || view.phase !== 'host' || !s.vid) return;
    const now = Date.now();
    const expected = last ? last.pos + (last.playing ? (now - last.at) / 1000 : 0) : null;
    const changed = !last || s.vid !== last.vid || !!s.playing !== last.playing || Math.abs(s.t - expected) > 1.5;
    if (!changed) return;
    last = { vid: s.vid, playing: !!s.playing, pos: s.t, at: now };
    room.publishState({ vid: s.vid, title: s.title, artist: s.artist, art: s.art, playing: !!s.playing, pos: s.t, d: s.d });
    if (view.upNext.length && view.upNext[0].id === s.vid) { view.upNext.shift(); push(); }
  });
  bus.on('music:request', (track) => {
    if (!room || view.phase !== 'guest') return;
    if (!view.pending.includes(track.id)) view.pending.push(track.id);
    room.request(track);
    push();
  });

  // ---- tray menu: its own submenu; turning rooms off hides the page after a reload ----
  ctx.menu(() => [
    view.phase === 'idle'
      ? { label: 'Rooms are idle', enabled: false }
      : { label: view.phase === 'host' ? `Hosting ${view.roomId}` : view.phase === 'joining' ? 'Joining…' : `In ${view.roomId}`, enabled: false },
    ...(view.phase !== 'idle' ? [{ label: 'Leave room', click: () => leave(true) }] : []),
    { type: 'separator' },
    { label: 'Turn off rooms (then Reload dock)', click: () => { leave(true); ctx.setSetting('roomsEnabled', false); } }
  ]);

  ctx.onQuit(() => { try { room?.stop(true); } catch { /* quitting anyway */ } });
};
