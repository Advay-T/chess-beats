// UI: board, PGN loading, move list and playback.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  var TEXT_STYLE = "︎"; // stops some systems rendering ♟ as an emoji

  var state = {
    game: null, // { headers, moves: [verbose], fens: [fen after 0..N plies], result }
    ply: 0, // number of moves applied to the board
    playing: false,
    timer: null,
  };

  // ---------- PGN loading ----------

  function parsePgn(text) {
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
    return { headers: headers, moves: moves, fens: fens, result: result, mate: replay.in_checkmate() };
  }

  function loadGame(text) {
    var game = parsePgn(text); // throws on bad input
    pause();
    state.game = game;
    state.ply = 0;
    var h = game.headers;
    $("white-name").textContent = h.White || "White";
    $("black-name").textContent = h.Black || "Black";
    var bits = [h.Event, h.Site, (h.Date || "").replace(/\.\?\?/g, "")].filter(function (s) { return s && s !== "?"; });
    $("game-info").textContent = bits.join(" · ") + (bits.length ? " · " : "") + game.moves.length + " half-moves · " + game.result;
    renderMoveList();
    render();
    setCaption("Ready: press ▶ to play.");
  }

  // ---------- rendering ----------

  function parseFen(fen) {
    var rows = fen.split(" ")[0].split("/");
    return rows.map(function (row) {
      var out = [];
      row.split("").forEach(function (ch) {
        if (/\d/.test(ch)) for (var i = 0; i < +ch; i++) out.push(null);
        else out.push(ch);
      });
      return out; // index 0 = a-file; rows[0] = rank 8
    });
  }

  function render(flash) {
    var g = state.game;
    var fen = g ? g.fens[state.ply] : new Chess().fen();
    var grid = parseFen(fen);
    var last = g && state.ply > 0 ? g.moves[state.ply - 1] : null;
    var html = "";
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) {
        var sq = "abcdefgh"[f] + (8 - r);
        var cls = "sq " + ((r + f) % 2 ? "dark" : "light");
        if (last && (sq === last.from || sq === last.to)) cls += " hl";
        if (flash && flash[sq]) cls += " " + flash[sq];
        var pc = grid[r][f];
        html += '<div class="' + cls + '" data-sq="' + sq + '">';
        if (pc) {
          var white = pc === pc.toUpperCase();
          html += '<span class="pc ' + (white ? "w" : "b") + '">' + GLYPH[pc.toLowerCase()] + TEXT_STYLE + "</span>";
        }
        if (r === 7) html += '<span class="coord file">' + "abcdefgh"[f] + "</span>";
        if (f === 0) html += '<span class="coord rank">' + (8 - r) + "</span>";
        html += "</div>";
      }
    }
    $("board").innerHTML = html;

    var whiteToMove = fen.split(" ")[1] === "w";
    $("white-name").classList.toggle("to-move", whiteToMove);
    $("black-name").classList.toggle("to-move", !whiteToMove);

    document.querySelectorAll(".mv").forEach(function (el) {
      el.classList.toggle("current", +el.dataset.ply === state.ply);
    });
    var cur = document.querySelector(".mv.current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
    $("btn-play").textContent = state.playing ? "⏸" : "▶";
  }

  function renderMoveList() {
    var g = state.game;
    var startsBlack = g.fens[0].split(" ")[1] === "b";
    var startNo = +g.fens[0].split(" ")[5] || 1;
    var html = "";
    for (var i = 0, n = startNo; i < g.moves.length; n++) {
      html += '<li value="' + n + '">';
      if (i === 0 && startsBlack) html += '<span class="mv-gap">…</span> ';
      else html += moveSpan(i++);
      if (i < g.moves.length) html += moveSpan(i++);
      html += "</li>";
    }
    html += '<li class="result">' + g.result + "</li>";
    $("move-list").innerHTML = html;
  }
  function moveSpan(i) {
    return '<span class="mv" data-ply="' + (i + 1) + '">' + state.game.moves[i].san + "</span> ";
  }

  // Squares to flash for the move that just happened.
  function flashFor(move) {
    var flash = {};
    if (/[x]/.test(move.san)) flash[move.to] = "flash-capture";
    if (/[+#]/.test(move.san)) {
      var grid = parseFen(state.game.fens[state.ply]);
      var king = move.color === "w" ? "k" : "K"; // the side now in check
      for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
        if (grid[r][f] === king) flash["abcdefgh"[f] + (8 - r)] = /#/.test(move.san) ? "flash-mate" : "flash-check";
      }
    }
    return flash;
  }

  function setCaption(text) { $("now-playing").textContent = text; }

  // ---------- music ----------

  function key() { return { root: $("key-root").value, mode: $("key-mode").value }; }
  function bpm() { return +$("tempo").value; }

  // Apply the next move to the board and play it. Returns the event (or null at the end).
  function stepForward(withSound) {
    var g = state.game;
    if (!g || state.ply >= g.moves.length) return null;
    var move = g.moves[state.ply];
    state.ply++;
    var ev = ChessMusic.moveToEvent(move, key());
    if (withSound) ChessAudio.playEvent(ev, bpm());
    render(flashFor(move));
    var moveNo = g.fens[state.ply - 1].split(" ")[5]; // full-move number of the position before the move
    setCaption(moveNo + (move.color === "w" ? ". " : "… ") + ev.label);
    return ev;
  }

  function goTo(ply) {
    pause();
    ChessAudio.stopAll();
    state.ply = Math.max(0, Math.min(ply, state.game.moves.length));
    render();
    setCaption(state.ply === 0 ? "Start position." : "Move " + Math.ceil(state.ply / 2) + " (silent jump).");
  }

  // ---------- playback ----------

  function tick() {
    var g = state.game;
    if (!state.playing) return;
    if (state.ply >= g.moves.length) {
      // Game over: soft chord if it didn't end in mate, then stop.
      if (!g.mate) {
        var end = ChessMusic.endingEvent(g.result, key());
        ChessAudio.playEvent(end, bpm());
        setCaption(end.label);
      }
      pause();
      return;
    }
    var ev = stepForward(true);
    state.timer = setTimeout(tick, (ev.length * 60000) / bpm());
  }

  function play() {
    if (!state.game) return;
    ChessAudio.init().then(function () {
      if (state.ply >= state.game.moves.length) state.ply = 0; // replay from the start
      state.playing = true;
      render();
      tick();
    });
  }
  function pause() {
    state.playing = false;
    clearTimeout(state.timer);
    state.timer = null;
    $("btn-play").textContent = "▶";
  }
  function togglePlay() { state.playing ? pause() : play(); }

  function stepFwdButton() {
    if (!state.game) return;
    pause();
    ChessAudio.init().then(function () { stepForward(true); });
  }

  // ---------- wiring ----------

  function populateGames() {
    var sel = $("game-select");
    BUILTIN_GAMES.forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.title;
      sel.appendChild(o);
    });
    var custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Your PGN…";
    custom.disabled = true;
    sel.appendChild(custom);
  }

  function showError(msg) { $("pgn-error").textContent = msg || ""; }

  function loadCustom(text, label) {
    try {
      loadGame(text);
      showError("");
      var sel = $("game-select");
      sel.querySelector('option[value="custom"]').textContent = label || "Your PGN";
      sel.value = "custom";
    } catch (e) {
      showError(e.message);
    }
  }

  function init() {
    if (typeof Chess === "undefined" || typeof Tone === "undefined") {
      setCaption("Couldn't load chess.js / Tone.js. Check your internet connection and reload.");
      return;
    }
    populateGames();
    loadGame(BUILTIN_GAMES[0].pgn);

    $("game-select").addEventListener("change", function (e) {
      var g = BUILTIN_GAMES.find(function (x) { return x.id === e.target.value; });
      if (g) { loadGame(g.pgn); showError(""); }
    });
    $("btn-play").addEventListener("click", togglePlay);
    $("btn-fwd").addEventListener("click", stepFwdButton);
    $("btn-back").addEventListener("click", function () { if (state.game) goTo(state.ply - 1); });
    $("btn-start").addEventListener("click", function () { if (state.game) goTo(0); });
    $("btn-end").addEventListener("click", function () { if (state.game) goTo(state.game.moves.length); });
    $("move-list").addEventListener("click", function (e) {
      var el = e.target.closest(".mv");
      if (el) goTo(+el.dataset.ply);
    });

    $("tempo").addEventListener("input", function (e) { $("tempo-out").textContent = e.target.value; });

    $("btn-load").addEventListener("click", function () {
      loadCustom($("pgn-input").value, "Your PGN (pasted)");
    });
    $("pgn-file").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        $("pgn-input").value = text;
        loadCustom(text, file.name);
      });
      e.target.value = ""; // allow re-uploading the same file
    });

    document.addEventListener("keydown", function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // let form controls keep their keys
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepFwdButton(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (state.game) goTo(state.ply - 1); }
      else if (e.key === "Home") { if (state.game) goTo(0); }
      else if (e.key === "End") { if (state.game) goTo(state.game.moves.length); }
    });
  }

  // Exposed for debugging / browser tests.
  window.ChessMusicApp = { state: state, loadGame: loadGame, parsePgn: parsePgn };
  init();
})();
