// VELMARA audio: synthesized engine, three radio stations, sirens and SFX.
// Everything is WebAudio, no audio files, no network.
var V = window.V || (window.V = {});
(function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, musicBus = null, sfxBus = null;
  var engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  var sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  var station = 0, seqTimer = null, step = 0, nextStepTime = 0;
  var started = false;

  // Three stations: different tempo, scale and wave, all original patterns.
  var STATIONS = [
    { name: 'VELMARA FM', sub: 'golden-hour pop', bpm: 112, wave: 'triangle',
      root: 220.00, bass: [0, 0, 7, 0, 5, 0, 7, 10], lead: [0, 3, 7, 12, 10, 7, 3, 5],
      minor: true, hat: true },
    { name: 'NEON MILE', sub: 'night-drive synthwave', bpm: 96, wave: 'sawtooth',
      root: 164.81, bass: [0, 0, 0, 3, 0, 0, 5, 7], lead: [12, 10, 7, 10, 12, 15, 12, 10],
      minor: true, hat: false },
    { name: 'HARBOR SOUL', sub: 'old-harbor funk', bpm: 126, wave: 'square',
      root: 196.00, bass: [0, 7, 0, 10, 0, 7, 5, 3], lead: [0, 5, 7, 5, 3, 0, 2, 3],
      minor: false, hat: true }
  ];

  function freq(root, semi) { return root * Math.pow(2, semi / 12); }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.30; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 55.7;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    // Siren: single osc, toggled between two tones.
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
    started = true;
    startSequencer();
  }

  function note(when, f, dur, type, vol, bus) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(bus || musicBus);
    o.start(when); o.stop(when + dur + 0.05);
  }

  function startSequencer() {
    step = 0; nextStepTime = ctx.currentTime + 0.06;
    if (seqTimer) clearInterval(seqTimer);
    seqTimer = setInterval(function () {
      if (!ctx) return;
      var st = STATIONS[station];
      var stepDur = 60 / st.bpm / 2; // eighth notes
      while (nextStepTime < ctx.currentTime + 0.18) {
        var s = step % 16;
        var bi = st.bass[s % 8], li = st.lead[s % 8];
        if (s % 2 === 0) note(nextStepTime, freq(st.root / 2, bi), stepDur * 1.8, 'sine', 0.5);
        if (s % 4 === 2) note(nextStepTime, freq(st.root, li), stepDur * 1.4, st.wave, 0.16);
        if (st.hat && s % 2 === 1) note(nextStepTime, 6200, 0.03, 'square', 0.03);
        if (s === 0 || s === 8) note(nextStepTime, freq(st.root * 2, li), stepDur * 2.2, 'sine', 0.10);
        step++; nextStepTime += stepDur;
      }
    }, 40);
  }

  function setStation(i) {
    station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    if (ctx) startSequencer();
    return STATIONS[station].name;
  }

  function cycleStation() { return setStation(station + 1); }

  function engine(speedFrac, on) {
    if (!ctx || !engineGain) return;
    var target = on ? 0.05 + 0.11 * speedFrac : 0.0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    var f = 52 + 165 * speedFrac;
    engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    engineOsc2.frequency.setTargetAtTime(f * 1.013, ctx.currentTime, 0.05);
    engineFilter.frequency.setTargetAtTime(320 + 1400 * speedFrac, ctx.currentTime, 0.1);
  }

  function siren(on, dt) {
    if (!ctx || !sirenGain) return;
    sirenGain.gain.setTargetAtTime(on ? 0.045 : 0.0, ctx.currentTime, 0.15);
    if (on) {
      sirenTimer += dt;
      if (sirenTimer > 0.42) { sirenTimer = 0; sirenHigh = !sirenHigh; sirenOsc.frequency.value = sirenHigh ? 880 : 660; }
    }
  }

  function blip(f, dur, type, vol) {
    if (!ctx) return;
    note(ctx.currentTime, f, dur, type || 'sine', vol || 0.4, sfxBus);
  }

  function sfx(name) {
    if (!ctx) return;
    var t = ctx.currentTime;
    if (name === 'coin') { note(t, 988, 0.12, 'sine', 0.5, sfxBus); note(t + 0.09, 1319, 0.22, 'sine', 0.5, sfxBus); }
    else if (name === 'mission') { [523, 659, 784, 1047].forEach(function (f, i) { note(t + i * 0.09, f, 0.28, 'triangle', 0.4, sfxBus); }); }
    else if (name === 'crash') { note(t, 90, 0.25, 'sawtooth', 0.5, sfxBus); note(t, 55, 0.3, 'square', 0.35, sfxBus); }
    else if (name === 'horn') { note(t, 370, 0.35, 'square', 0.22, sfxBus); note(t, 466, 0.35, 'square', 0.18, sfxBus); }
    else if (name === 'click') { blip(700, 0.06, 'square', 0.25); }
    else if (name === 'cash') { note(t, 1200, 0.08, 'sine', 0.35, sfxBus); note(t + 0.07, 1600, 0.14, 'sine', 0.35, sfxBus); }
    else if (name === 'shoot') { note(t, 220, 0.09, 'square', 0.4, sfxBus); note(t, 1400, 0.05, 'sawtooth', 0.2, sfxBus); }
    else if (name === 'denied') { note(t, 220, 0.18, 'square', 0.3, sfxBus); note(t + 0.15, 175, 0.25, 'square', 0.3, sfxBus); }
    else if (name === 'pickup') { blip(880, 0.1, 'triangle', 0.4); }
  }

  V.audio = {
    init: init, setStation: setStation, cycleStation: cycleStation,
    engine: engine, siren: siren, sfx: sfx,
    stationName: function () { return STATIONS[station].name; },
    stationSub: function () { return STATIONS[station].sub; },
    isStarted: function () { return started; }
  };
})();
