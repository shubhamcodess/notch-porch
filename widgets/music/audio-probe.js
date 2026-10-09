// Injected into the hidden YouTube Music page. Taps the <video> element with a Web Audio
// analyser (audio still plays normally) and exposes window.__notchBands() -> 4 levels (0..1):
// bass, low-mid, mid, treble. Returns null until a video exists / if the tap isn't possible.
(() => {
  if (window.__notchBands) return;
  let ac = null, an = null, buf = null, el = null;
  const EDGES = [1, 5, 13, 41, 121]; // fftSize 512 → ~94 Hz per bin at 48 kHz

  function attach(v) {
    el = v;
    an = null;
    try {
      ac = ac || new AudioContext();
      const node = ac.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.6;
      ac.createMediaElementSource(v).connect(node);
      node.connect(ac.destination);
      buf = new Uint8Array(node.frequencyBinCount);
      an = node;
    } catch (e) { /* tap failed: the UI falls back to its idle animation */ }
  }

  window.__notchBands = () => {
    const v = document.querySelector('video');
    if (!v) return null;
    if (v !== el) attach(v);
    if (!an) return null;
    if (ac.state === 'suspended') ac.resume();
    an.getByteFrequencyData(buf);
    const out = [];
    for (let b = 0; b < 4; b++) {
      let sum = 0, max = 0;
      for (let i = EDGES[b]; i < EDGES[b + 1]; i++) { sum += buf[i]; if (buf[i] > max) max = buf[i]; }
      // half average, half peak: reacts to narrow sounds (hi-hats, a bass note) without twitching
      out.push((sum / (EDGES[b + 1] - EDGES[b]) + max) / 510);
    }
    return out;
  };
})();
