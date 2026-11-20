// PGN -> game data shared by the player, the game library page and the build script.
// Plain script (window.ChessPgn) and CommonJS (require) — pass Chess and ChessAnalysis in Node.
(function (root) {
  function parse(text, Chess, Analysis) {
    Chess = Chess || root.Chess;
    Analysis = Analysis || root.ChessAnalysis;
    var clean = String(text).replace(/\r\n?/g, "\n").trim();
    if (!clean) throw new Error("The PGN is empty.");
    // If the file holds several games, use the first one.
    var first = clean.split(/\n\s*\n(?=\[Event )/)[0];

    var chess = new Chess();
    if (!chess.load_pgn(first, { sloppy: true })) {
      throw new Error("Couldn't read that PGN. Check for typos or illegal moves.");
    }
    var headers = chess.header();
    var moves = chess.history({ verbose: true });
    if (!moves.length) throw new Error("That PGN has no moves.");

    var replay = headers.FEN ? new Chess(headers.FEN) : new Chess();
    var fens = [replay.fen()];
    moves.forEach(function (m) { replay.move(m); fens.push(replay.fen()); });

    var result = headers.Result && headers.Result !== "*" ? headers.Result : (first.match(/(1-0|0-1|1\/2-1\/2)\s*$/) || [])[1] || "*";
    var analysis = Analysis.analyzeGame(moves, fens, result, Chess);
    return { headers: headers, moves: moves, fens: fens, result: result, mate: replay.in_checkmate(), analysis: analysis };
  }

  var api = { parse: parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessPgn = api;
})(this);
