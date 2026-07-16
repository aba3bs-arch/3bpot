/** Procedural audio for Laguna Anzuelo (Web Audio API) */
window.LagunaAudio = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  const NOTES = {
    C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0,
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, E5: 659.25,
  };

  // Soft aquatic / tropical loop
  const MELODY = [
    "E4", "G4", "A4", "G4", "E4", "D4", "C4", "E4",
    "G4", "A4", "C5", "A4", "G4", "E4", "D4", "C4",
  ];

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.11;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
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
    master.gain.value = muted ? 0 : 0.72;
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
    const beat = 0.32;
    const tick = () => {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const name = MELODY[step % MELODY.length];
      const f = NOTES[name] || 220;
      tone(f / 2, t0, 0.28, "sine", musicGain, 0.14);
      if (step % 2 === 0) tone(f, t0, 0.22, "triangle", musicGain, 0.08);
      if (step % 4 === 0) {
        tone(f * 1.5, t0, 0.4, "sine", musicGain, 0.045);
        // soft bubble-ish blip
        tone(f * 2.2, t0 + 0.05, 0.08, "sine", musicGain, 0.03, f * 3);
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

  function splash() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    noiseBurst(t0, 0.18, 0.14, 1400);
    tone(420, t0, 0.12, "sine", sfxGain, 0.08, 180);
  }

  function cast() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(520, t0, 0.16, "sawtooth", sfxGain, 0.07, 160);
    noiseBurst(t0 + 0.05, 0.1, 0.06, 900);
  }

  function tug() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(170, t0, 0.05, "square", sfxGain, 0.07);
  }

  function bite() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(180, t0, 0.08, "sawtooth", sfxGain, 0.14, 90);
    noiseBurst(t0, 0.12, 0.12, 500);
  }

  function snap() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(320, t0, 0.06, "square", sfxGain, 0.16, 80);
    noiseBurst(t0, 0.14, 0.16, 2200);
    tone(90, t0 + 0.04, 0.2, "triangle", sfxGain, 0.1, 40);
  }

  function coin() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(880, t0, 0.08, "square", sfxGain, 0.11);
    tone(1174, t0 + 0.07, 0.12, "square", sfxGain, 0.09);
  }

  function winBig() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      tone(f, t0 + i * 0.09, 0.22, "triangle", sfxGain, 0.15);
    });
  }

  function miss() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(220, t0, 0.15, "triangle", sfxGain, 0.09, 110);
  }

  function escape() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    tone(280, t0, 0.12, "sawtooth", sfxGain, 0.1, 90);
    noiseBurst(t0, 0.12, 0.08, 700);
  }

  function bubble() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const f = 500 + Math.random() * 700;
    tone(f, t0, 0.1, "sine", sfxGain, 0.04, f * 1.6);
  }

  return {
    unlock,
    setMuted,
    isMuted,
    splash,
    cast,
    tug,
    bite,
    snap,
    coin,
    winBig,
    miss,
    escape,
    bubble,
  };
})();
