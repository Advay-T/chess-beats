// What plays *under* each move's melody: a pad chord from the material balance,
// a groove whose density follows tension, and effects/tempo from the game phase.
// Pure logic (times in beats), testable in Node.
(function (root) {
  var Music = typeof module !== "undefined" && module.exports ? require("./music.js") : root.ChessMusic;

  // Chords as semitones above the key root.
  var CHORDS = {
    major: {
      balanced: { name: "I sus2", semis: [0, 2, 7] },
      white: { name: "I major", semis: [0, 4, 7] },
      black: { name: "vi minor", semis: [-3, 0, 4] },
      swing: { name: "IV add9", semis: [5, 9, 12, 19] },
    },
    minor: {
      balanced: { name: "i sus2", semis: [0, 2, 7] },
      white: { name: "III major", semis: [3, 7, 10] },
      black: { name: "i minor", semis: [0, 3, 7] },
      swing: { name: "iv add9", semis: [5, 8, 12, 19] },
    },
  };

  var PHASES = {
    opening: { grooveCap: 1, padVel: 0.22, reverb: 0.15, delay: 0, tempoMul: 1 },
    middlegame: { grooveCap: 3, padVel: 0.32, reverb: 0.22, delay: 0, tempoMul: 1 },
    endgame: { grooveCap: 1, padVel: 0.26, reverb: 0.45, delay: 0.25, tempoMul: 0.9 },
  };
  var NEUTRAL_PHASE = { grooveCap: 3, padVel: 0.3, reverb: 0.22, delay: 0, tempoMul: 1 };

  var ALL_LAYERS = { harmony: true, groove: true, phase: true };

  function situation(frame) {
    if (Math.abs(frame.swing) >= 3) return "swing";
    if (frame.balance >= 2) return "white";
    if (frame.balance <= -2) return "black";
    return "balanced";
  }

  function chordFor(frame, key) {
    return CHORDS[key.mode][situation(frame)];
  }

  function grooveLevel(tension) {
    return tension < 0.3 ? 0 : tension < 0.5 ? 1 : tension < 0.75 ? 2 : 3;
  }

  /**
   * @param frame   one analysis frame ({balance, swing, tension, phase})
   * @param key     {root, mode}
   * @param length  beats this move lasts (event.length)
   * @param layers  {harmony, groove, phase} booleans
   * @returns { chord, pad, bass, groove: [{type, time, vel}], level, fx, tempoMul, label }
   */
  function bedFor(frame, key, length, layers) {
    layers = layers || ALL_LAYERS;
    var ph = layers.phase ? PHASES[frame.phase] : NEUTRAL_PHASE;
    var rootMidi = 12 * 4 + Music.ROOTS[key.root]; // pad sits around octave 3
    var chord = layers.harmony ? chordFor(frame, key) : null;

    var bed = {
      chord: chord ? chord.name : null,
      pad: chord ? chord.semis.map(function (s) { return { midi: rootMidi + s, vel: ph.padVel }; }) : [],
      bass: null,
      groove: [],
      level: 0,
      fx: { reverb: ph.reverb, delay: ph.delay, cutoff: 500 + 2500 * frame.tension },
      tempoMul: ph.tempoMul,
    };

    if (layers.groove) {
      var level = Math.min(grooveLevel(frame.tension), ph.grooveCap);
      bed.level = level;
      var sixteenths = Math.max(1, Math.round(length * 4));
      for (var s = 0; s < sixteenths; s++) {
        var t = s / 4;
        var onBeat = s % 4 === 0;
        var on8th = s % 2 === 0;
        if (level >= 1 && on8th) bed.groove.push({ type: "hat", time: t, vel: onBeat ? 0.35 : 0.22 });
        if (level >= 3 && !on8th) bed.groove.push({ type: "hat", time: t, vel: 0.15 });
        if (level >= 2 && onBeat) bed.groove.push({ type: "kick", time: t, vel: 0.7 });
        if (level >= 3 && s % 4 === 2) bed.groove.push({ type: "snare", time: t, vel: 0.45 });
      }
      if (level >= 2) {
        var bassRoot = chord ? chord.semis[0] : 0;
        bed.bass = { midi: 12 * 3 + Music.ROOTS[key.root] + bassRoot, dur: Math.min(length, 1) * 0.9, vel: 0.6 };
      }
    }

    var phaseName = frame.phase.charAt(0).toUpperCase() + frame.phase.slice(1);
    var bal = frame.balance === 0 ? "even" : (frame.balance > 0 ? "White +" : "Black +") + Math.abs(frame.balance);
    bed.label = [layers.phase ? phaseName : null, bal, chord ? chord.name : null, layers.groove ? "groove " + bed.level : null]
      .filter(Boolean).join(" · ");
    return bed;
  }

  var ChessArrangement = { CHORDS: CHORDS, PHASES: PHASES, situation: situation, chordFor: chordFor, grooveLevel: grooveLevel, bedFor: bedFor };

  if (typeof module !== "undefined" && module.exports) module.exports = ChessArrangement;
  else root.ChessArrangement = ChessArrangement;
})(this);
