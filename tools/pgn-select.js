// Picking a balanced "best games" subset from a big player file (pure functions, tested).

// Speed, online, exhibition and other non-classical events. Player files from the 2010s on
// are mostly these (Champions Chess Tour, Speed Chess, bullet, banter...).
var NON_CLASSICAL = new RegExp([
  "blitz", "bullet", "rapid", "speed", "simul", "blind", "online", "internet", "exhib", "armageddon",
  "960", "random", "freestyle", "banter", "titled", "\\btour\\b", "league", "chess\\.com", "chess24",
  "lichess", "meltwater", "champions chess", "\\bcct\\b", "play magnus", "\\bicc\\b", "playchess", "corr",
  "\\d+'", // "Kosmos m 5'": minutes per game
  "prelim", "div \\d", "final 8", "play-in", "winners", "losers", "\\bko\\b", "showdown", "clutch",
  "legends of chess", "carlsen inv", "magnus carlsen", "ftx", "skilling", "airthings", "chessable",
  "nic classic", "lindores", "charity cup", "goldmoney", "julius baer", "aimchess", "opera euro",
  "esports", "troll", "mrdodgy", "challengers", "vs\\.", "san fermin", "ai cup", "oslo esports",
  "gelfand challenge", "polgar challenge", "aicf", "rbi open", "gcl", "wscc", "puchong", "zakovat",
  "clash of", "play for russia", "pca/intel", "intel-gp", "amber", "mainz", "corsica", "leon\\b",
  "cap d'agde", "mind games", "sportaccord", "bl team", "magnus-", "\\bdm\\b", "basque",
].join("|"), "i");

var MAJOR = new RegExp([
  "wch", "world ch", "world-ch", "candidates", "interzonal", "olympiad", "avro", "hastings",
  "st\\.? ?petersburg", "nottingham", "linares", "wijk", "corus", "tata steel", "hoogovens",
  "dortmund", "sinquefield", "norway chess", "london classic", "london chess classic", "tal mem",
  "zurich", "carlsbad", "karlsbad", "san sebastian", "new york 19", "moscow 19", "bled", "curacao",
].join("|"), "i");
// Title matches: exempt from the per-opponent cap (Kasparov–Karpov is the point of the collection).
var TITLE_MATCH = /wch|world ch|world-ch/i;

function isClassical(event) { return !NON_CLASSICAL.test(event || ""); }
function isMajor(event) { return MAJOR.test(event || ""); }
function isTitleMatch(event) { return TITLE_MATCH.test(event || ""); }

// Which side the collection's player had: "w", "b" or null.
function playerSide(headers, playerRe) {
  if (playerRe.test(headers.White || "")) return "w";
  if (playerRe.test(headers.Black || "")) return "b";
  return null;
}

function yearOf(headers) {
  var m = String(headers.Date || "").match(/^(\d{4})/);
  return m ? +m[1] : null;
}

// Cheap score before full analysis: player won > decisive > draw, plus big events.
function baseScore(headers, side) {
  var r = headers.Result;
  var won = (side === "w" && r === "1-0") || (side === "b" && r === "0-1");
  var decisive = r === "1-0" || r === "0-1";
  return (won ? 3 : 0) + (decisive ? 1 : 0) + (isMajor(headers.Event) ? 2 : 0);
}

// Stable string hash (FNV-1a) so selections are reproducible.
function hash(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

// Identity of a game regardless of which player's file it came from.
function gameKey(movetext, headers) {
  var moves = String(movetext).replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, "").replace(/\s+/g, " ").trim();
  return (yearOf(headers) || "?") + ":" + hash(moves);
}

// Choose n items spread across the career: split the year range into `buckets` equal spans,
// give each span a share proportional to its number of candidates, take the best of each,
// then top up from the best leftovers. items: [{ year, score, tie, opponent? }]
// perOpponent caps how many games against the same opponent are taken (variety).
function spreadPick(items, n, buckets, perOpponent) {
  buckets = buckets || 5;
  if (items.length <= n && !perOpponent) return items.slice();
  var seen = {};
  var ok = function (x) { return !perOpponent || !x.opponent || x.titleMatch || (seen[x.opponent] || 0) < perOpponent; };
  var take = function (list, k, into) {
    for (var i = 0; i < list.length && k > 0; i++) {
      var x = list[i];
      if (!ok(x)) continue;
      into.push(x);
      if (x.opponent && !x.titleMatch) seen[x.opponent] = (seen[x.opponent] || 0) + 1;
      k--;
    }
  };
  var better = function (a, b) { return b.score - a.score || a.tie - b.tie; };
  var years = items.map(function (x) { return x.year; }).filter(Boolean);
  var lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);
  var span = Math.max(1, (hi - lo + 1) / buckets);
  var groups = [];
  for (var b = 0; b < buckets; b++) groups.push([]);
  items.forEach(function (x) {
    var b = x.year ? Math.min(buckets - 1, Math.floor((x.year - lo) / span)) : 0;
    groups[b].push(x);
  });
  var picked = [];
  groups.forEach(function (g) {
    g.sort(better);
    take(g, Math.floor((n * g.length) / items.length), picked);
  });
  var taken = new Set(picked);
  var rest = items.filter(function (x) { return !taken.has(x); }).sort(better);
  take(rest, n - picked.length, picked);
  return picked;
}

module.exports = {
  NON_CLASSICAL: NON_CLASSICAL, MAJOR: MAJOR,
  isClassical: isClassical, isMajor: isMajor, isTitleMatch: isTitleMatch, playerSide: playerSide, yearOf: yearOf,
  baseScore: baseScore, hash: hash, gameKey: gameKey, spreadPick: spreadPick,
};
