// Pure move -> music mapping. No audio here, so it can be tested in Node.
// All times/durations are in beats; audio.js converts them using the current tempo.
(function (root) {
  var SCALES = {
    major: [0, 2, 4, 7, 9], // major pentatonic
    minor: [0, 3, 5, 7, 10], // minor pentatonic
  };
  var ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, Bb: 10 };
  var NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  // Piece type -> note length (beats) and volume (0..1).
  var PIECES = {
    p: { dur: 0.25, vel: 0.35, label: "16th" },
    n: { dur: 0.5, vel: 0.55, label: "8th" },
    b: { dur: 0.5, vel: 0.55, label: "8th" },
    r: { dur: 1, vel: 0.7, label: "quarter" },
    k: { dur: 1, vel: 0.6, label: "quarter" },
    q: { dur: 2, vel: 0.95, label: "half" },
  };

  var STEP_BEATS = 1; // time between ordinary moves
  var CAPTURE_BOOST = 0.25;

  // A "step" is an absolute position in the pentatonic scale: 5 steps per octave.
  function stepToMidi(step, key) {
    var scale = SCALES[key.mode];
    var octave = Math.floor(step / 5);
    var deg = ((step % 5) + 5) % 5;
    return 12 * (octave + 1) + ROOTS[key.root] + scale[deg];
  }

  function midiToName(midi) {
    return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  // File a..h -> scale degree 0..7 (f,g,h wrap into the next octave).
  // Rank pairs -> octave: 1-2 -> 2, 3-4 -> 3, 5-6 -> 4, 7-8 -> 5.
  function squareToStep(square) {
    var file = square.charCodeAt(0) - 97;
    var rank = parseInt(square[1], 10);
    var octave = 2 + Math.floor((rank - 1) / 2);
    return octave * 5 + file;
  }

  function note(step, key, time, dur, vel) {
    var midi = stepToMidi(step, key);
    return { midi: midi, name: midiToName(midi), time: time, dur: dur, vel: Math.min(1, vel) };
  }

  /**
   * Build the sound event for one move.
   * @param move  chess.js verbose move: {color, from, to, piece, san, flags, captured, promotion}
   * @param key   {root: "C".."Bb", mode: "major"|"minor"}
   * @param ctx   {isCheck, isMate} - usually derived from the SAN
   */
  function moveToEvent(move, key, ctx) {
    ctx = ctx || {};
    var isCheck = ctx.isCheck != null ? ctx.isCheck : /\+$/.test(move.san);
    var isMate = ctx.isMate != null ? ctx.isMate : /#$/.test(move.san);
    var isCapture = move.flags.indexOf("c") >= 0 || move.flags.indexOf("e") >= 0;
    var isCastle = move.flags.indexOf("k") >= 0 || move.flags.indexOf("q") >= 0;
    var isPromo = move.flags.indexOf("p") >= 0;

    var p = PIECES[move.piece];
    var step = squareToStep(move.to);
    var vel = p.vel + (isCapture ? CAPTURE_BOOST : 0);
    var ev = {
      san: move.san,
      color: move.color,
      voice: move.color === "w" ? "white" : "black",
      notes: [],
      drums: [],
      tags: [],
      length: STEP_BEATS,
    };

    if (isCastle) {
      // Chord on the king's destination: root, 3rd and 5th steps of the scale.
      ev.notes.push(note(step, key, 0, 1.5, 0.6), note(step + 2, key, 0, 1.5, 0.55), note(step + 4, key, 0, 1.5, 0.55));
      ev.tags.push("castle chord");
      ev.length = 1.5;
    } else if (isPromo) {
      // Rising run up to the promotion square's note, then hold it like a queen.
      for (var i = 4; i >= 1; i--) ev.notes.push(note(step - i, key, (4 - i) * 0.125, 0.125, 0.5 + (4 - i) * 0.1));
      ev.notes.push(note(step, key, 0.5, PIECES.q.dur, 1));
      ev.tags.push("promotion run");
      ev.length = 1.5;
    } else {
      ev.notes.push(note(step, key, 0, p.dur, vel));
    }

    if (isCapture) {
      ev.drums.push({ type: "snare", time: 0, vel: 0.8 });
      ev.tags.push("capture");
    }
    if (isCheck && !isMate) {
      ev.drums.push({ type: "cymbal", time: 0, vel: 0.6 });
      ev.tags.push("check");
    }
    if (isMate) {
      // Final big hit: low root/fifth/octave plus the mover's chord, kick + cymbal.
      var t = ev.notes.length ? 0.5 : 0;
      var rootStep = 2 * 5; // octave 2, degree 0
      ev.notes.push(
        note(rootStep - 5, key, t, 4, 1),
        note(rootStep, key, t, 4, 1),
        note(rootStep + 3, key, t, 4, 0.9),
        note(step, key, t, 4, 0.9),
        note(step + 2, key, t, 4, 0.8),
        note(step + 4, key, t, 4, 0.8)
      );
      ev.drums.push({ type: "kick", time: t, vel: 1 }, { type: "cymbal", time: t, vel: 1 }, { type: "snare", time: t, vel: 1 });
      ev.tags.push("CHECKMATE");
      ev.length = 4;
    }

    ev.label = move.san + " → " + ev.notes.map(function (n) { return n.name; }).filter(uniq).join(" ") +
      (isCastle || isPromo || isMate ? "" : " (" + p.label + ")") +
      (ev.tags.length ? " · " + ev.tags.join(", ") : "");
    return ev;
  }

  // Soft closing chord for games that end without checkmate (resignation, draw).
  function endingEvent(result, key) {
    var base = 3 * 5;
    return {
      san: result,
      voice: "both",
      notes: [note(base, key, 0, 3, 0.4), note(base + 2, key, 0, 3, 0.35), note(base + 4, key, 0, 3, 0.35)],
      drums: [],
      tags: ["game over"],
      length: 3,
      label: "Game ends " + result + " (no mate) → soft closing chord",
    };
  }

  function uniq(v, i, a) { return a.indexOf(v) === i; }

  var ChessMusic = {
    SCALES: SCALES,
    ROOTS: ROOTS,
    PIECES: PIECES,
    stepToMidi: stepToMidi,
    midiToName: midiToName,
    squareToStep: squareToStep,
    moveToEvent: moveToEvent,
    endingEvent: endingEvent,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ChessMusic;
  else root.ChessMusic = ChessMusic;
})(this);
