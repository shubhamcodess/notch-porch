#!/usr/bin/env node
// Talks to the real public relays: a host, two guests and an outsider with the wrong ID.
//   node scripts/room-selftest.js
const { Room, randomId } = require('../widgets/room/room-core');
const N = require('../widgets/room/names');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(50); } return false; };
let failed = 0;
const check = (label, v) => { console.log((v ? 'PASS ' : 'FAIL ') + label); if (!v) failed++; };

(async () => {
  const name = N.cute(), id = N.roomIdFor(name);
  const mk = (n, host, rid = id) => new Room({ roomId: rid, me: { id: randomId(), name: n }, isHost: host }).start();
  const host = mk(name, true), g1 = mk('Sleepy-Panda', false), g2 = mk('Zippy-Fox', false), out = mk('Wacky-Yeti', false, 'Other-Room-12');
  let s1 = null, s2 = null, req = null, ver = null, leaked = 0;
  g1.on('state', (s) => { s1 = s; }); g2.on('state', (s) => { s2 = s; });
  g1.on('verdict', (v) => { ver = v; }); host.on('request', (r) => { req = r; });
  out.on('state', () => leaked++); out.on('host-seen', () => leaked++);

  check('members discover each other', await until(() => host.list().length === 3));
  host.publishState({ vid: 'abc123XYZ_-', title: 'Test', artist: 'T', playing: true, pos: 12, d: 100 });
  check('state reaches every guest', await until(() => s1 && s2) && s1.vid === 'abc123XYZ_-');
  g1.request({ id: 'req00000001', title: 'Wanted', artist: 'X' });
  check('request reaches the host', await until(() => req));
  host.verdict(req.rid, true, req.track);
  check('verdict reaches the guest', await until(() => ver && ver.ok === true));
  await wait(1500);
  check('an outsider with the wrong ID sees nothing', leaked === 0);
  g2.stop(); await wait(1500);
  check('a guest leaving is noticed', host.list().length === 2);
  host.stop(); g1.stop(false); out.stop(false);
  setTimeout(() => process.exit(failed ? 1 : 0), 600);
})();
