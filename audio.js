// Tone.js instruments. Takes events from music.js and schedules them.
(function (root) {
  var ready = false;
  var voices, drums, bed;

  function build() {
    var limiter = new Tone.Limiter(-1).toDestination();
    var reverb = new Tone.Reverb({ decay: 2.5, wet: 0.22 }).connect(limiter);
    // Echo on the melody only; off until the endgame turns it up.
    var delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.35, wet: 0 }).connect(reverb);

    // White: bright, clean triangle synth, panned left.
    var white = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.35, release: 0.9 },
      volume: -8,
    }).connect(new Tone.Panner(-0.35).connect(delay));

    // Black: darker FM synth, panned right.
    var black = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 4,
      oscillator: { type: "sine" },
      modulation: { type: "square" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 1 },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.6 },
      volume: -12,
    }).connect(new Tone.Panner(0.35).connect(delay));

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

    // ---- Bed: pad, bass and groove kit (separate from the move drums so they never collide) ----
    var padFilter = new Tone.Filter({ frequency: 800, type: "lowpass", rolloff: -24 }).connect(reverb);
    var pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
      envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 2.5 },
      volume: -20,
    }).connect(padFilter);
    var bass = new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { Q: 2, type: "lowpass" },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, baseFrequency: 120, octaves: 2.5 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
      volume: -14,
    }).connect(limiter);
    var hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
      volume: -24,
    }).connect(new Tone.Filter(7000, "highpass").connect(limiter));
    var gKick = new Tone.MembraneSynth({ octaves: 4, pitchDecay: 0.04, volume: -10 }).connect(limiter);
    var gSnare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
      volume: -20,
    }).connect(new Tone.Filter(1200, "highpass").connect(limiter));

    bed = {
      pad: pad, bass: bass, padFilter: padFilter, reverb: reverb, delay: delay,
      chord: null, // current pad chord name, so it only re-attacks on a change
      hits: {
        hat: function (t, v) { hat.triggerAttackRelease(0.04, t, v); },
        kick: function (t, v) { gKick.triggerAttackRelease("C1", 0.3, t, v); },
        snare: function (t, v) { gSnare.triggerAttackRelease(0.1, t, v); },
      },
    };

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

  function midiFreq(m) { return Tone.Frequency(m, "midi").toFrequency(); }

  /** Play an arrangement.js bed under the move that starts at `time`. */
  function playBed(b, bpm, time) {
    if (!ready) return;
    var spb = 60 / bpm;
    var t0 = time != null ? time : Tone.now() + 0.03;

    if (b.chord !== bed.chord) {
      bed.pad.releaseAll(t0);
      if (b.pad.length) {
        bed.pad.triggerAttack(b.pad.map(function (n) { return midiFreq(n.midi); }), t0 + 0.01, b.pad[0].vel);
      }
      bed.chord = b.chord;
    }
    if (b.bass) bed.bass.triggerAttackRelease(midiFreq(b.bass.midi), b.bass.dur * spb, t0, b.bass.vel);
    b.groove.forEach(function (h) {
      try { bed.hits[h.type](t0 + h.time * spb, h.vel); } catch (e) { /* retrigger clash: skip the hit */ }
    });
    setFx(b.fx, bpm, t0);
  }

  // Glide reverb, echo and pad brightness towards the bed's targets over about a beat.
  function setFx(fx, bpm, time) {
    var ramp = 60 / bpm;
    bed.reverb.wet.rampTo(fx.reverb, ramp, time);
    bed.delay.wet.rampTo(fx.delay, ramp, time);
    bed.delay.delayTime.rampTo(0.75 * (60 / bpm), ramp, time); // dotted-8th echo at the current tempo
    bed.padFilter.frequency.rampTo(fx.cutoff, ramp, time);
  }

  // Let the pad fade out (pause / end of game).
  function releaseBed() {
    if (!ready) return;
    bed.pad.releaseAll();
    bed.bass.triggerRelease();
    bed.chord = null;
  }

  function stopAll() {
    if (!ready) return;
    voices.white.releaseAll();
    voices.black.releaseAll();
    releaseBed();
  }

  root.ChessAudio = { init: init, playEvent: playEvent, playBed: playBed, releaseBed: releaseBed, stopAll: stopAll };
})(this);
