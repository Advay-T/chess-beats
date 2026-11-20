// Turn messy multi-game PGN text into clean, canonical games.
// Handles: tags and games run together on one line, lost line breaks that glue
// a move number or the next move onto the previous move ("h68.Bxf6", "Nf3Bd6"),
// comments, variations, NAGs and "1..." black move numbers.

var TAG = /\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\]/g;
var RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
var KNOWN_TAGS = ["Event", "Site", "Date", "Round", "White", "Black", "Result", "ECO", "EventDate", "WhiteElo", "BlackElo", "PlyCount"];

// Repair a tag line that lost its opening "[" and the start of its name: `vent "Curacao"]` -> `[Event "Curacao"]`.
function repairTags(src) {
  return src.replace(/^([ \t]*)([A-Za-z]+)( "(?:[^"\\]|\\.)*"\])[ \t]*$/gm, function (all, ws, word, rest) {
    var key = KNOWN_TAGS.filter(function (k) { return k === word || k.slice(-word.length) === word; })[0] || word;
    return ws + "[" + key + rest;
  });
}

// Split a file into [{ headers, movetext }]. A tag that follows movetext starts a new game.
function splitGames(text) {
  var src = repairTags(String(text).replace(/\r\n?/g, "\n").replace(/^%.*$/gm, "")); // "%" lines are PGN escapes
  var games = [];
  var cur = null;
  var last = 0;
  var m;
  function flushMoves(chunk) {
    if (!cur) cur = { headers: {}, movetext: "" };
    cur.movetext += " " + chunk;
  }
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    var between = src.slice(last, m.index);
    if (between.trim()) flushMoves(between);
    if (cur && cur.movetext.trim()) { games.push(cur); cur = null; }
    if (!cur) cur = { headers: {}, movetext: "" };
    cur.headers[m[1]] = m[2];
    last = TAG.lastIndex;
  }
  var tail = src.slice(last);
  if (tail.trim()) flushMoves(tail);
  if (cur && cur.movetext.trim()) games.push(cur);
  return games;
}

function stripVariations(s) {
  var out = "", depth = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (!depth) out += c;
  }
  return out;
}

// Clean movetext into "1. e4 c5 2. Nf3 ..." followed by the result token (if any).
function cleanMovetext(text) {
  var s = String(text)
    .replace(/\{[^}]*\}/g, " ") // comments
    .replace(/;[^\n]*/g, " "); // rest-of-line comments
  s = stripVariations(s)
    .replace(/\$\d+/g, " ") // NAGs
    .replace(/[!?]+/g, ""); // move annotations
  // Re-split glued tokens: a square (or castle / check / promotion) directly followed by a move number...
  s = s.replace(/([a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)(\d+\.)/g, "$1 $2");
  // ...or directly followed by the next move ("Nf3Bd6", "Kb1Bd7", "O-OBb7").
  s = s.replace(/([a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)(?=[NBRQK]|O-O|[a-h](?:[1-8]|x))/g, "$1 ");
  s = s
    .replace(/\d+\.\.\./g, " ") // "1...c5" black move numbers
    .replace(/(\d+)\.\s*/g, "$1. ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function toPgn(headers, movetext) {
  var lines = Object.keys(headers).map(function (k) {
    return "[" + k + ' "' + headers[k] + '"]';
  });
  return lines.join("\n") + "\n\n" + movetext;
}

// Full pipeline: file text -> [{ headers, movetext, pgn }]
function normalize(text) {
  return splitGames(text).map(function (g) {
    var mt = cleanMovetext(g.movetext);
    var tokens = mt.split(" ");
    var lastTok = tokens[tokens.length - 1];
    if (!RESULT.test(lastTok) && g.headers.Result) mt += " " + g.headers.Result;
    return { headers: g.headers, movetext: mt, pgn: toPgn(g.headers, mt) };
  });
}

module.exports = { repairTags: repairTags, splitGames: splitGames, cleanMovetext: cleanMovetext, toPgn: toPgn, normalize: normalize };
