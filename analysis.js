// Whole-game analysis: material, tension and phase for every ply, plus a summary
// used to pick each game's musical identity. Pure logic, testable in Node.
(function (root) {
  var VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var KEY_ROOTS = ["C", "D", "E", "F", "G", "A", "Bb"];

  // Tension model: a decaying accumulator, bumped by captures and checks and
  // nudged by how many captures are available (tactical positions feel tense
  // before pieces actually fall).
  var DECAY = 0.75;
  var BUMP_CAPTURE = 0.3;
  var BUMP_CHECK = 0.35;
  var PER_CAPTURE_AVAILABLE = 0.025;

  function countMaterial(fen) {
    var m = { w: 0, b: 0, wPieces: 0, bPieces: 0, wQueen: false, bQueen: false };
    fen.split(" ")[0].split("").forEach(function (ch) {
      var lower = ch.toLowerCase();
      if (!(lower in VALUES)) return;
      var side = ch === lower ? "b" : "w";
      m[side] += VALUES[lower];
      if (lower !== "p" && lower !== "k") m[side + "Pieces"] += VALUES[lower];
      if (lower === "q") m[side + "Queen"] = true;
    });
    return m;
  }

  function capturesAvailable(fen, Chess) {
    var moves = new Chess(fen).moves({ verbose: true });
    var n = 0;
    for (var i = 0; i < moves.length; i++) if (/[ce]/.test(moves[i].flags)) n++;
    return n;
  }

  // FNV-1a string hash, so the same opening always gets the same key.
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  /**
   * @param moves  chess.js verbose moves
   * @param fens   fens[0] = start, fens[i] = after i plies
   * @param result "1-0" | "0-1" | "1/2-1/2" | "*"
   * @param Chess  the chess.js constructor (passed in so this works in browser and Node)
   * @returns { frames, summary, auto } where frames[i] describes the position after move i
   */
  function analyzeGame(moves, fens, result, Chess) {
    var startMat = countMaterial(fens[0]);
    var balances = [startMat.w - startMat.b];
    var frames = [];
    var tension = 0;
    var piecesTaken = 0; // non-pawn captures
    var phase = "opening";
    var captures = 0, checks = 0, tensionSum = 0;
    var peak = { ply: 0, tension: 0 };
    var biggestSwing = { ply: 0, swing: 0 };

    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var ply = i + 1;
      var mat = countMaterial(fens[ply]);
      var balance = mat.w - mat.b;
      balances.push(balance);
      var swing = balance - balances[Math.max(0, ply - 4)];

      var isCapture = /[ce]/.test(mv.flags);
      var isCheck = /[+#]/.test(mv.san);
      if (isCapture) captures++;
      if (isCheck) checks++;
      if (isCapture && mv.captured !== "p") piecesTaken++;

      tension = DECAY * tension + (isCapture ? BUMP_CAPTURE : 0) + (isCheck ? BUMP_CHECK : 0) +
        PER_CAPTURE_AVAILABLE * capturesAvailable(fens[ply], Chess);
      tension = Math.min(1, tension);
      tensionSum += tension;
      if (tension > peak.tension) peak = { ply: ply, tension: tension };
      if (Math.abs(swing) > Math.abs(biggestSwing.swing)) biggestSwing = { ply: ply, swing: swing };

      // Phase only moves forward: opening -> middlegame -> endgame.
      if (phase === "opening" && (ply >= 20 || piecesTaken >= 2)) phase = "middlegame";
      if (phase !== "endgame" && ((!mat.wQueen && !mat.bQueen) || (mat.wPieces <= 13 && mat.bPieces <= 13))) phase = "endgame";

      frames.push({
        ply: ply,
        material: { w: mat.w, b: mat.b },
        balance: balance,
        swing: swing,
        tension: tension,
        phase: phase,
        capture: isCapture,
        check: isCheck,
      });
    }

    var plies = moves.length;
    var avgTension = plies ? tensionSum / plies : 0;
    var activity = plies ? (captures + checks) / plies : 0;
    var profile = activity >= 0.25 || avgTension >= 0.5 ? "tactical"
      : activity < 0.22 && avgTension < 0.4 ? "positional" : "balanced";

    var summary = {
      plies: plies,
      captures: captures,
      checks: checks,
      avgTension: avgTension,
      activity: activity,
      peak: peak,
      biggestSwing: biggestSwing,
      profile: profile,
    };

    var opening = moves.slice(0, 6).map(function (m) { return m.san; }).join(" ");
    var mode = profile === "tactical" ? "minor" : profile === "positional" ? "major" : result === "0-1" ? "minor" : "major";
    var auto = {
      root: KEY_ROOTS[hash(opening) % KEY_ROOTS.length],
      mode: mode,
      bpm: profile === "tactical" ? 140 : profile === "positional" ? 90 : 115,
    };

    return { frames: frames, summary: summary, auto: auto };
  }

  var ChessAnalysis = { analyzeGame: analyzeGame, countMaterial: countMaterial, VALUES: VALUES };

  if (typeof module !== "undefined" && module.exports) module.exports = ChessAnalysis;
  else root.ChessAnalysis = ChessAnalysis;
})(this);
