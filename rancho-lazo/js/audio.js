/** Procedural audio for Rancho Lazo (Web Audio API) */
window.RanchoAudio = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  const NOTES = {
    C3: 130.81, E3: 164.81, G3: 196.0, A3: 220.0,
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, B4: 493.88,
  };

  // Simple western-ish loop (pentatonic feel)
  const MELODY = [
    "G3", "C4", "E4", "G4", "E4", "C4", "G3", "A3",
    "C4", "E4", "G4", "A4", "G4", "E4", "C4", "G3",
  ];

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.12;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.55;
    sfxGain.connect(master);
    return true;
  }

  async function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") await ctx.resume();
    started = true;
    if (!muted) startMusic();
  }

  function setMuted(v) {
    muted = v;
    if (!ensure()) return;
    master.gain.value = muted ? 0 : 0.7;
    if (muted) stopMusic();
    else if (started) startMusic();
  }

  function isMuted() {
    return muted;
  }

  function tone(freq, t0, dur, type, gainNode, vol = 0.2, slideTo = null) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(gainNode);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(t0, dur, vol = 0.15, filterFreq = 800) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur);
  }

  function startMusic() {
    if (!ctx || muted || musicTimer) return;
    let step = 0;
    const beat = 0.28;
    const tick = () => {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const name = MELODY[step % MELODY.length];
      const f = NOTES[name] || 220;
      // bass
      tone(f / 2, t0, 0.22, "triangle", musicGain, 0.18);
      // melody pluck
      if (step % 2 === 0) tone(f, t0, 0.18, "square", musicGain, 0.07);
      // soft chord every 4
      if (step % 4 === 0) {
        tone(f * 1.5, t0, 0.35, "sine", musicGain, 0.05);
      }
      step += 1;
    };
    tick();
    musicTimer = setInterval(tick, beat * 1000);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function whoosh() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(600, t0, 0.18, "sawtooth", sfxGain, 0.08, 180);
    noiseBurst(t0, 0.12, 0.08, 1200);
  }

  function moo() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(180, t0, 0.55, "sawtooth", sfxGain, 0.22, 110);
    tone(90, t0 + 0.05, 0.5, "sine", sfxGain, 0.18, 70);
  }

  function oink() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(420, t0, 0.08, "square", sfxGain, 0.16, 280);
    tone(320, t0 + 0.09, 0.1, "square", sfxGain, 0.14, 200);
    noiseBurst(t0, 0.1, 0.1, 900);
  }

  function bellow() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(95, t0, 0.7, "sawtooth", sfxGain, 0.28, 55);
    tone(140, t0 + 0.08, 0.55, "triangle", sfxGain, 0.16, 80);
    noiseBurst(t0 + 0.05, 0.25, 0.12, 400);
  }

  function coin() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(880, t0, 0.08, "square", sfxGain, 0.12);
    tone(1174, t0 + 0.07, 0.12, "square", sfxGain, 0.1);
  }

  function winBig() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      tone(f, t0 + i * 0.09, 0.2, "triangle", sfxGain, 0.16);
    });
  }

  function miss() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(220, t0, 0.15, "triangle", sfxGain, 0.1, 110);
  }

  function escape() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(300, t0, 0.12, "sawtooth", sfxGain, 0.12, 90);
    noiseBurst(t0, 0.15, 0.1, 600);
  }

  function tug() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(150, t0, 0.05, "square", sfxGain, 0.08);
  }

  return {
    unlock,
    setMuted,
    isMuted,
    whoosh,
    moo,
    oink,
    bellow,
    coin,
    winBig,
    miss,
    escape,
    tug,
  };
})();
