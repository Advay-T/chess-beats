// Tone.js instruments. Takes events from music.js and schedules them.
(function (root) {
  var ready = false;
  var voices, drums;

  function build() {
    var limiter = new Tone.Limiter(-1).toDestination();
    var reverb = new Tone.Reverb({ decay: 2.5, wet: 0.22 }).connect(limiter);

    // White: bright, clean triangle synth, panned left.
    var white = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.35, release: 0.9 },
      volume: -8,
    }).connect(new Tone.Panner(-0.35).connect(reverb));

    // Black: darker FM synth, panned right.
    var black = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 4,
      oscillator: { type: "sine" },
      modulation: { type: "square" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 1 },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.6 },
      volume: -12,
    }).connect(new Tone.Panner(0.35).connect(reverb));

    var snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      volume: -10,
    }).connect(new Tone.Filter(1800, "highpass").connect(limiter));

    var cymbal = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.4, release: 0.4 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 5000,
      octaves: 1.5,
      volume: -22,
    }).connect(reverb);

    var kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.06, volume: -2 }).connect(limiter);

    voices = { white: white, black: black };
    drums = {
      snare: function (t, v) { snare.triggerAttackRelease(0.16, t, v); },
      cymbal: function (t, v) { cymbal.triggerAttackRelease(250, 1.2, t, v); },
      kick: function (t, v) { kick.triggerAttackRelease("C1", 0.5, t, v); },
    };
  }

  // Must be called from a user gesture (click / key press) - browsers block audio before that.
  function init() {
    if (ready) return Promise.resolve();
    return Tone.start().then(function () {
      if (!ready) { build(); ready = true; }
    });
  }

  /** Play one music.js event. time = AudioContext seconds, bpm = current tempo. */
  function playEvent(ev, bpm, time) {
    if (!ready) return;
    var spb = 60 / bpm;
    var t0 = time != null ? time : Tone.now() + 0.03;

    ev.notes.forEach(function (n, i) {
      // "both" (closing chord) alternates notes between the two voices.
      var synth = ev.voice === "both" ? (i % 2 ? voices.black : voices.white) : voices[ev.voice];
      synth.triggerAttackRelease(Tone.Frequency(n.midi, "midi").toFrequency(), n.dur * spb, t0 + n.time * spb, n.vel);
    });
    ev.drums.forEach(function (d) {
      // Monophonic drums throw if retriggered at the same instant (e.g. fast clicking); a missed hit is harmless.
      try { drums[d.type](t0 + d.time * spb, d.vel); } catch (e) { /* skip */ }
    });
  }

  function stopAll() {
    if (!ready) return;
    voices.white.releaseAll();
    voices.black.releaseAll();
  }

  root.ChessAudio = { init: init, playEvent: playEvent, stopAll: stopAll };
})(this);
