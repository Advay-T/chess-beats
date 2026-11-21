// A chess.com player's most recent standard games, from chess.com's Published-Data API
// (https://www.chess.com/news/view/published-data-api): no key, and CORS is open, so the browser
// calls it directly. One request at a time, newest month first, stopping once there are enough games.
// Plain script (window.ChessCom) and CommonJS (require). No DOM: pass `fetch` in Node and in tests.
(function (root) {
  var API = "https://api.chess.com/pub/player/";
  var DRAWS = { agreed: 1, repetition: 1, stalemate: 1, insufficient: 1, "50move": 1, timevsinsufficient: 1 };

  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // GET a JSON document. A 429 (rate limit) waits and retries once.
  function getJson(url, opts, retried) {
    return Promise.resolve()
      .then(function () { return opts.fetch(url, { headers: { Accept: "application/json" } }); })
      .catch(function () { throw fail("network", "Couldn't reach chess.com."); })
      .then(function (res) {
        if (res.status === 429) {
          if (retried) throw fail("rate-limited", "Chess.com is rate-limiting requests.");
          return wait(opts.retryMs == null ? 3000 : opts.retryMs).then(function () { return getJson(url, opts, true); });
        }
        if (res.status === 404) throw fail("not-found", "No chess.com player by that name.");
        if (!res.ok) throw fail("network", "Chess.com answered " + res.status + ".");
        return res.json();
      });
  }

  // Standard chess only (no chess960, crazyhouse, bughouse, king of the hill, three-check), with a PGN.
  function isStandard(g, timeClass) {
    return g && g.rules === "chess" && !!g.pgn && (!timeClass || g.time_class === timeClass);
  }

  /**
   * @param username  a chess.com username (any case)
   * @param opts.count      how many games (default 25)
   * @param opts.timeClass  "bullet" | "blitz" | "rapid" | "daily", or nothing for all
   * @param opts.fetch      the fetch function (the browser's by default)
   * @param opts.onProgress called with the archive URL before each month is read
   * @returns the newest `count` games (chess.com's game objects), newest first; fewer if that's all there is
   */
  function recentGames(username, opts) {
    opts = opts || {};
    var count = opts.count || 25;
    var u = String(username || "").trim().toLowerCase();
    if (!opts.fetch) opts = Object.assign({}, opts, { fetch: root.fetch && root.fetch.bind(root) });
    if (!/^[a-z0-9_-]{1,50}$/.test(u)) return Promise.reject(fail("bad-name", "That isn't a chess.com username."));

    return getJson(API + encodeURIComponent(u) + "/games/archives", opts).then(function (data) {
      var archives = (data && data.archives) || []; // oldest first
      if (!archives.length) throw fail("no-archives", "No games on chess.com yet.");
      var found = [], i = archives.length - 1;
      function next() {
        if (found.length >= count || i < 0) {
          found.sort(function (a, b) { return (b.end_time || 0) - (a.end_time || 0); });
          return found.slice(0, count);
        }
        var url = archives[i--];
        if (opts.onProgress) opts.onProgress(url);
        return getJson(url, opts).then(function (month) {
          ((month && month.games) || []).forEach(function (g) { if (isStandard(g, opts.timeClass)) found.push(g); });
          return next();
        });
      }
      return next();
    });
  }

  // The game's result from `username`'s side: "win", "loss" or "draw".
  function outcome(game, username) {
    var u = String(username || "").toLowerCase();
    var me = game.white && String(game.white.username).toLowerCase() === u ? game.white : game.black;
    var r = me && me.result;
    if (r === "win") return "win";
    return DRAWS[r] ? "draw" : "loss";
  }

  var api = { recentGames: recentGames, outcome: outcome, isStandard: isStandard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessCom = api;
})(this);
