// Game library page: filterable grid of cards, each with the peak-tension position,
// a tension sparkline, and a click-to-preview of the moves around that peak.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LIB = window.GAME_LIBRARY;
  var PREVIEW_PLIES = 8;
  var DEFAULT_BPM = 200; // same starting tempo as the player
  var HASH_KEY = "chessBeats.libraryHash";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var byId = {};
  LIB.games.forEach(function (g) { byId[g.id] = g; });

  // Mini boards and sparklines come from miniboard.js (shared with the player's chess.com picker).
  var boardSvg = MiniBoard.board, sparkSvg = MiniBoard.spark;

  // ---------- cards ----------

  function moveLabel(g) {
    if (!g.peakMove) return "Start position";
    var no = Math.ceil(g.peakPly / 2);
    return "Peak: " + no + (g.peakMove.color === "w" ? ". " : "… ") + g.peakMove.san;
  }
  function resultLabel(r) {
    return r === "1-0" ? ["w", "1–0"] : r === "0-1" ? ["b", "0–1"] : r === "1/2-1/2" ? ["d", "½–½"] : ["d", r];
  }

  // Card markup is built once per game and reused on every filter change.
  var cardCache = {};
  function card(g) {
    return cardCache[g.id] || (cardCache[g.id] = buildCard(g));
  }
  function buildCard(g) {
    var res = resultLabel(g.result);
    var heading = g.name || g.title;
    var meta = [g.name ? g.title : "", g.event, g.year].filter(Boolean).join(" · ");
    var aria = heading + ", " + (g.white + " vs " + g.black) + ", " + (g.year || "") + ", result " + g.result;
    return '<article class="card" data-id="' + g.id + '">' +
      '<div class="card-board">' + boardSvg(g.peakFen, g.peakMove) + "</div>" +
      '<p class="card-peak">' + esc(moveLabel(g)) + "</p>" +
      sparkSvg(g) +
      '<h3 class="card-title"><a class="card-link" href="play.html?game=' + g.id + '" aria-label="' + esc(aria) + '">' + esc(heading) + "</a></h3>" +
      '<p class="card-meta">' + esc(meta) + "</p>" +
      '<div class="card-tags">' +
        '<span class="res res-' + res[0] + '">' + res[1] + "</span>" +
        '<span class="chip">' + esc(g.profile.charAt(0).toUpperCase() + g.profile.slice(1)) + "</span>" +
        '<span class="card-len">' + Math.ceil(g.plies / 2) + " moves" + (g.eco ? " · " + esc(g.eco) : "") + "</span>" +
      "</div>" +
      '<button class="btn card-preview" type="button" aria-pressed="false" aria-label="Preview ' + esc(heading) + '">▶ Preview</button>' +
      "</article>";
  }

  // ---------- filters ----------

  var collectionById = {};
  LIB.collections.forEach(function (c) { collectionById[c.id] = c; });
  var EMPTY = { g: "", c: "", q: "", r: "", p: "", d: "", s: "date" };
  var filters = Object.assign({}, EMPTY);

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    Object.keys(filters).forEach(function (k) { if (params.has(k)) filters[k] = params.get(k); });
  }
  function writeHash() {
    var params = new URLSearchParams();
    Object.keys(filters).forEach(function (k) {
      if (filters[k] && !(k === "s" && filters[k] === "date")) params.set(k, filters[k]);
    });
    var hash = params.toString() ? "#" + params.toString() : "";
    history.replaceState(null, "", location.pathname + location.search + hash);
    try { sessionStorage.setItem(HASH_KEY, hash); } catch (e) {}
  }

  function matches(g) {
    if (filters.c && g.collection !== filters.c) return false;
    if (filters.r && g.result !== filters.r) return false;
    if (filters.p && g.profile !== filters.p) return false;
    if (filters.d && (!g.year || Math.floor(g.year / 10) * 10 !== +filters.d)) return false;
    if (filters.q) {
      var hay = [g.name, g.white, g.black, g.event, g.site, g.eco, g.year, collectionById[g.collection].title].join(" ").toLowerCase();
      var words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return false;
    }
    return true;
  }

  var SORTS = {
    date: null, // library.js is already chronological within each collection
    drama: function (a, b) { return b.avgTension - a.avgTension; },
    short: function (a, b) { return a.plies - b.plies; },
    long: function (a, b) { return b.plies - a.plies; },
  };

  function render() {
    stopPreview();
    var shown = 0;
    var html = "";
    LIB.collections.forEach(function (c) {
      if (filters.g && filters.g !== c.category) return;
      if (filters.c && filters.c !== c.id) return;
      var list = LIB.games.filter(function (g) { return g.collection === c.id && matches(g); });
      if (SORTS[filters.s]) list = list.slice().sort(SORTS[filters.s]);
      if (!list.length) return;
      shown += list.length;
      html += '<section class="shelf" aria-labelledby="shelf-' + c.id + '">' +
        '<h2 class="shelf-title" id="shelf-' + c.id + '">' + esc(c.title) + ' <small>' + esc(c.subtitle) + " · " + list.length + (list.length === 1 ? " game" : " games") + "</small></h2>" +
        '<div class="grid">' + list.map(card).join("") + "</div></section>";
    });
    if (!shown) {
      html = '<div class="lib-empty"><p>No games match those filters.</p><button class="btn" type="button" id="clear-filters">Clear filters</button></div>';
    }
    $("grid").innerHTML = html;
    $("count").textContent = shown.toLocaleString("en") + (shown === 1 ? " game" : " games");
    writeHash();
  }

  function syncControls() {
    $("f-search").value = filters.q;
    $("f-result").value = filters.r;
    $("f-profile").value = filters.p;
    $("f-decade").value = filters.d;
    $("f-sort").value = filters.s;
    document.querySelectorAll("#f-category button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.g === filters.g));
    });
    // Player list follows the chosen category.
    var list = LIB.collections.filter(function (c) { return !filters.g || c.category === filters.g; });
    if (filters.c && !list.some(function (c) { return c.id === filters.c; })) filters.c = "";
    $("f-player").innerHTML = '<option value="">All players</option>' + list.map(function (c) {
      return '<option value="' + c.id + '">' + esc(playerLabel(c)) + " (" + c.count + ")</option>";
    }).join("");
    $("f-player").value = filters.c;
  }

  // "My 60 Memorable Games" -> "Bobby Fischer: My 60 Memorable Games" for the book collections.
  function playerLabel(c) {
    if (c.id === "fischer") return "Bobby Fischer: " + c.title;
    if (c.id === "tal") return "Mikhail Tal: " + c.title;
    return c.title;
  }

  function buildControls() {
    var seg = [{ id: "", title: "All" }].concat(LIB.categories);
    $("f-category").innerHTML = seg.map(function (cat) {
      var n = LIB.collections.filter(function (c) { return !cat.id || c.category === cat.id; })
        .reduce(function (s, c) { return s + c.count; }, 0);
      return '<button type="button" data-g="' + cat.id + '" aria-pressed="false">' + esc(cat.title) + " <span>" + n + "</span></button>";
    }).join("");
    var decades = {};
    LIB.games.forEach(function (g) { if (g.year) decades[Math.floor(g.year / 10) * 10] = true; });
    Object.keys(decades).sort().forEach(function (d) {
      var o = document.createElement("option");
      o.value = d;
      o.textContent = d + "s";
      $("f-decade").appendChild(o);
    });
  }

  // ---------- preview ----------

  var preview = null; // { id, timer, token }
  var token = 0;

  function cardEl(id) { return document.querySelector('.card[data-id="' + id + '"]'); }

  function setBoard(id, fen, move) {
    var el = cardEl(id);
    if (el) el.querySelector(".card-board").innerHTML = boardSvg(fen, move);
  }

  function stopPreview() {
    token++;
    if (!preview) return;
    clearTimeout(preview.timer);
    if (window.ChessAudio) ChessAudio.stopAll();
    var g = byId[preview.id];
    setBoard(g.id, g.peakFen, g.peakMove);
    var el = cardEl(g.id);
    if (el) {
      el.classList.remove("is-previewing");
      var btn = el.querySelector(".card-preview");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "▶ Preview";
    }
    preview = null;
  }

  // Play the moves around the peak (the game's "hook") at the game's own key and tempo,
  // stepping the card's board along with the notes.
  function startPreview(id) {
    stopPreview();
    if (typeof Tone === "undefined" || typeof Chess === "undefined") return;
    var g = byId[id];
    var mine = token;
    var el = cardEl(id);
    var btn = el.querySelector(".card-preview");
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "■ Stop";
    el.classList.add("is-previewing");
    preview = { id: id, timer: null };

    ChessAudio.init().then(function () {
      if (mine !== token) return; // another preview (or a re-render) started meanwhile
      var game = ChessPgn.parse(g.pgn);
      var start = Math.max(0, Math.min(g.peakPly - PREVIEW_PLIES / 2, game.moves.length - PREVIEW_PLIES));
      var end = Math.min(game.moves.length, start + PREVIEW_PLIES);
      var key = { root: g.auto.root, mode: g.auto.mode };
      var bpm = DEFAULT_BPM;
      var i = start;
      setBoard(id, game.fens[start], start > 0 ? game.moves[start - 1] : null);
      (function step() {
        if (mine !== token) return;
        if (i >= end) { stopPreview(); return; }
        var move = game.moves[i];
        var ev = ChessMusic.moveToEvent(move, key, { motion: true });
        ChessAudio.ensure();
        ChessAudio.playEvent(ev, bpm, Tone.now() + 0.03);
        setBoard(id, game.fens[i + 1], move);
        i++;
        preview.timer = setTimeout(step, (ev.length * 60000) / bpm);
      })();
    });
  }

  // ---------- wiring ----------

  function init() {
    $("lib-total").textContent = LIB.games.length.toLocaleString("en");
    readHash();
    buildControls();
    syncControls();
    render();

    $("f-category").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      filters.g = b.dataset.g;
      syncControls(); // drops the player if it isn't in this category
      render();
    });
    $("f-player").addEventListener("change", function (e) { filters.c = e.target.value; render(); });
    var searchTimer;
    $("f-search").addEventListener("input", function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { filters.q = e.target.value.trim(); render(); }, 120);
    });
    [["f-result", "r"], ["f-profile", "p"], ["f-decade", "d"], ["f-sort", "s"]].forEach(function (pair) {
      $(pair[0]).addEventListener("change", function (e) { filters[pair[1]] = e.target.value; render(); });
    });

    $("grid").addEventListener("click", function (e) {
      if (e.target.id === "clear-filters") {
        filters = Object.assign({}, EMPTY, { s: filters.s });
        syncControls();
        render();
        return;
      }
      var btn = e.target.closest(".card-preview");
      if (!btn) return;
      var id = btn.closest(".card").dataset.id;
      if (preview && preview.id === id) stopPreview();
      else startPreview(id);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && preview) stopPreview();
    });
    // Leaving for the player: don't keep a preview ringing on.
    window.addEventListener("pagehide", stopPreview);

    // ---------- load your own game ----------
    // The Load dialog (load-dialog.js): whatever is picked opens in the player.
    LoadDialog.init({
      onText: function (text, label) { LoadDialog.openInPlayer(text, label); },
      onPick: function (pgn, label, sub, parsed, playlist) { LoadDialog.openInPlayer(pgn, label, sub, !!parsed, playlist); }
    });
    $("btn-open-pgn").addEventListener("click", function () { stopPreview(); LoadDialog.open(); });
  }

  init();
})();
