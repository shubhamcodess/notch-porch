// Room transport + protocol. No Electron in here, so it can be tested on its own.
//
// Everyone connects outward over WebSocket to a few free public MQTT brokers that act as dumb relays.
// The room ID derives the channel *and* the AES key, so a broker only ever sees scrambled bytes.
// Only tiny state messages travel (which song, playing/paused, position); audio never does.
const mqtt = require('mqtt');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081'];
const HEARTBEAT_MS = 4000;
const MEMBER_TTL_MS = 14000;
const MAX_MEMBERS = 10;

const randomId = () => crypto.randomBytes(5).toString('hex');

class Room extends EventEmitter {
  /** @param {{roomId:string, me:{id:string,name:string}, isHost:boolean, brokers?:string[]}} o */
  constructor({ roomId, me, isHost, brokers = BROKERS }) {
    super();
    this.roomId = String(roomId).toLowerCase();
    this.me = me;
    this.isHost = !!isHost;
    this.brokers = brokers;
    this.members = new Map();        // id -> { id, name, host, seen }
    this.offset = 0;                 // estimated (host clock - my clock) in ms, for guests
    this.clients = [];
    this.seen = new Set();           // message ids already handled (messages arrive once per broker)
    this.timers = [];
    this.closed = false;
    this.key = crypto.scryptSync(this.roomId, 'notch-porch/room/v1', 32);
    this.topic = 'notchporch/r/' + crypto.createHash('sha256').update(this.roomId).digest('hex').slice(0, 24);
    this.lastState = null;
  }

  // ---- crypto ----
  seal(obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]);
  }
  open(buf) {
    try {
      const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
    } catch { return null; }          // not ours (wrong key / garbage): ignore
  }

  // ---- lifecycle ----
  start() {
    let connected = 0;
    for (const url of this.brokers) {
      const c = mqtt.connect(url, { clientId: `np-${this.me.id}-${randomId()}`, reconnectPeriod: 4000, connectTimeout: 8000, keepalive: 30, clean: true,
        // The relays are untrusted by design: every payload is AES-GCM sealed with the room key, so TLS identity adds
        // nothing, and networks that re-sign TLS (VPNs, security clients) would otherwise make connections flap.
        rejectUnauthorized: false, wsOptions: { rejectUnauthorized: false } });
      c.on('connect', () => {
        c.subscribe(this.topic, { qos: 0 });
        if (++connected === 1) { this.emit('connected'); this.hello(); }
      });
      c.on('error', () => {});
      c.on('message', (_t, payload) => this.handle(payload));
      this.clients.push(c);
    }
    this.timers.push(setInterval(() => this.tick(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.prune(), 3000));
    if (!this.isHost) this.timers.push(setInterval(() => this.ping(), 15000));
    this.members.set(this.me.id, { id: this.me.id, name: this.me.name, host: this.isHost, seen: Date.now() });
    return this;
  }

  stop(announce = true) {
    if (this.closed) return;
    if (announce) this.send({ t: this.isHost ? 'end' : 'bye' });
    this.closed = true;
    this.timers.forEach(clearInterval);
    setTimeout(() => this.clients.forEach((c) => c.end(true)), announce ? 300 : 0);
  }

  // ---- sending ----
  send(msg) {
    if (this.closed && msg.t !== 'bye' && msg.t !== 'end') return;
    const payload = this.seal({ ...msg, mid: randomId(), from: { id: this.me.id, name: this.me.name }, host: this.isHost, ts: Date.now() });
    for (const c of this.clients) if (c.connected) c.publish(this.topic, payload, { qos: 0 });
  }
  hello() { this.send({ t: 'hi' }); }
  tick() {
    this.hello();
    if (this.isHost && this.lastState) this.send({ t: 'state', st: this.currentState() });
  }
  /** the last state we published, with the position moved on to now */
  currentState() {
    const l = this.lastState, now = Date.now();
    return { ...l, pos: l.pos + (l.playing ? (now - l.at) / 1000 : 0), hostT: now };
  }
  ping() { this.send({ t: 'ping', t0: Date.now() }); }

  /** host: publish what is playing now */
  publishState(st) {
    this.lastState = { ...st, at: Date.now() };
    this.send({ t: 'state', st: this.currentState() });
  }
  /** guest: ask the host to queue a song */
  request(track) {
    const rid = randomId();
    this.send({ t: 'req', rid, track });
    return rid;
  }
  /** host: answer a request for everyone to see */
  verdict(rid, ok, track) { this.send({ t: 'ver', rid, ok: !!ok, track }); }

  // ---- receiving ----
  handle(payload) {
    if (this.closed) return;
    const m = this.open(Buffer.from(payload));
    if (!m || !m.mid || !m.from || m.from.id === this.me.id) return;
    if (this.seen.has(m.mid)) return;
    this.seen.add(m.mid);
    if (this.seen.size > 400) this.seen = new Set([...this.seen].slice(-200));
    const now = Date.now();
    if (m.t === 'bye') { this.members.delete(m.from.id); return this.emit('members', this.list()); }
    if (m.t === 'end') { return this.emit('ended'); }

    // any message doubles as presence
    const known = this.members.has(m.from.id);
    if (!known && this.isHost && this.members.size >= MAX_MEMBERS) return;      // room is full
    this.members.set(m.from.id, { id: m.from.id, name: m.from.name, host: !!m.host, seen: now });
    if (!known) {
      this.emit('members', this.list());
      if (this.isHost) { this.hello(); if (this.lastState) this.send({ t: 'state', st: this.currentState() }); }
    }
    if (m.host && !this.isHost) this.emit('host-seen', m.from);

    switch (m.t) {
      case 'state': if (!this.isHost && m.host) this.emit('state', m.st, this.hostNow()); break;
      case 'req': if (this.isHost) this.emit('request', { rid: m.rid, from: m.from, track: m.track }); break;
      case 'ver': this.emit('verdict', { rid: m.rid, ok: m.ok, track: m.track }); break;
      case 'ping': if (this.isHost) this.send({ t: 'pong', to: m.from.id, t0: m.t0, t1: Date.now() }); break;
      case 'pong':
        if (m.to === this.me.id) {
          const rtt = Date.now() - m.t0;
          const est = m.t1 + rtt / 2 - Date.now();
          this.offset = this.offsetSamples ? this.offset * 0.6 + est * 0.4 : est;   // smooth, first sample wins outright
          this.offsetSamples = (this.offsetSamples || 0) + 1;
          this.emit('clock', { offset: this.offset, rtt });
        }
        break;
      default: break;
    }
  }

  hostNow() { return Date.now() + this.offset; }
  list() { return [...this.members.values()].sort((a, b) => (b.host - a.host) || a.name.localeCompare(b.name)); }
  prune() {
    const cut = Date.now() - MEMBER_TTL_MS;
    let changed = false;
    for (const [id, m] of this.members) if (id !== this.me.id && m.seen < cut) { this.members.delete(id); changed = true; }
    if (changed) this.emit('members', this.list());
  }
}

module.exports = { Room, BROKERS, MAX_MEMBERS, randomId };
