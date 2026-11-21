// Small previews shared by the library page and the player's chess.com picker: an SVG mini board
// and a tension sparkline. Needs pieces.js (the #pc-* symbols) and the #mini-squares pattern in the page.
(function (root) {
  var SPARK_POINTS = 40; // same as tools/build-library.js

  function sqXY(sq) { return { x: "abcdefgh".indexOf(sq[0]) * 10, y: (8 - +sq[1]) * 10 }; }

  // fen: piece-placement field only (or a whole FEN). move: { from, to, color } to tint, or null.
  function board(fen, move) {
    var out = '<svg class="mini" viewBox="0 0 80 80" role="img" aria-hidden="true"><rect width="80" height="80" fill="url(#mini-squares)"/>';
    if (move) {
      [move.from, move.to].forEach(function (sq) {
        var p = sqXY(sq);
        out += '<rect class="mini-hl ' + move.color + '" x="' + p.x + '" y="' + p.y + '" width="10" height="10"/>';
      });
    }
    fen.split(" ")[0].split("/").forEach(function (row, r) {
      var f = 0;
      row.split("").forEach(function (ch) {
        if (/\d/.test(ch)) { f += +ch; return; }
        // Square box, not a font baseline, so every piece sits centred on every OS.
        out += '<use href="#pc-' + ChessPieces.codeFor(ch) + '" x="' + (f * 10 + 0.5) + '" y="' + (r * 10 + 0.5) + '" width="9" height="9"/>';
        f++;
      });
    });
    return out + "</svg>";
  }

  // g: { spark: [0..1], plies, peakPly }, as library.js stores it (or sparkData() makes it).
  function spark(g) {
    var w = 200, h = 28, n = g.spark.length;
    var x = function (i) { return n === 1 ? 0 : (i / (n - 1)) * w; };
    var y = function (v) { return h - 2 - v * (h - 4); };
    var pts = g.spark.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    var px = g.plies > 1 ? ((g.peakPly - 1) / (g.plies - 1)) * w : 0;
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon class="spark-fill" points="0,' + h + " " + pts + " " + w + "," + h + '"/>' +
      '<line class="spark-peak" x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="0" y2="' + h + '"/>' +
      '<polyline class="spark-line" points="' + pts + '"/></svg>';
  }

  // The sparkline's data from a parsed game (ChessPgn.parse), sampled like the library build does.
  function sparkData(game) {
    var frames = game.analysis.frames, n = frames.length, points = Math.min(SPARK_POINTS, n), out = [];
    for (var k = 0; k < points; k++) {
      var i = points === 1 ? 0 : Math.round((k * (n - 1)) / (points - 1));
      out.push(Math.round(frames[i].tension * 100) / 100);
    }
    return { spark: out, plies: game.moves.length, peakPly: game.analysis.summary.peak.ply };
  }

  root.MiniBoard = { board: board, spark: spark, sparkData: sparkData };
})(this);
