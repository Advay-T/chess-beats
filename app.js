// UI: board, PGN loading, move list, playback and the live "Now" readout.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULT_BPM = 200; // starting tempo for every game (and the library previews)

  var state = {
    game: null, // { headers, moves: [verbose], fens: [fen after 0..N plies], result, mate, analysis }
    ply: 0, // number of moves applied to the board
    playing: false,
    timer: null,
    padTimer: null,
    advanceTimer: null,
    entry: null, // the GAME_LIBRARY entry being played, or null for a pasted/uploaded PGN
    playlist: null, // a chess.com player's games, { items: [{ text, label, sub, parsed? }], index }, or null
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function keyName(k) { return k.root.replace("b", "♭") + " " + k.mode; }
  function balanceText(b) { return b === 0 ? "Even" : (b > 0 ? "White +" : "Black +") + Math.abs(b); }

  // ---------- PGN loading ----------

  var parsePgn = function (text) { return ChessPgn.parse(text); };

  function loadGame(text, parsed, bpm) {
    var game = parsed || parsePgn(text); // throws on bad input
    pause();
    state.game = game;
    state.ply = 0;
    var h = game.headers;
    $("white-name").textContent = h.White || "White";
    $("black-name").textContent = h.Black || "Black";
    var bits = [h.Event, h.Site, (h.Date || "").replace(/\.\?\?/g, "")].filter(function (s) { return s && s !== "?"; });
    $("game-info").textContent = bits.concat([game.moves.length + " half-moves", game.result]).join(" · ");
    var a = game.analysis.auto;
    $("auto-root").textContent = "Auto (" + a.root.replace("b", "♭") + ")";
    $("auto-mode").textContent = "Auto (" + a.mode + ")";
    // Every game starts at 200 (chess.com bullet 250, blitz 225); the slider can still override it.
    setTempo(bpm || DEFAULT_BPM);
    showProfile();
    renderMoveList();
    render();
    setTension(0);
    showIdle("Press ▶ or Space to play.");
  }

  // Chips like: [Tactical] [9 captures] [5 checks] [D minor · auto]
  function showProfile() {
    var s = state.game.analysis.summary, k = key();
    var isAuto = $("key-root").value === "auto" && $("key-mode").value === "auto";
    var plural = function (n, word) { return n + " " + word + (n === 1 ? "" : "s"); };
    $("game-profile").innerHTML = [
      '<span class="chip accent">' + cap(s.profile) + "</span>",
      '<span class="chip">' + plural(s.captures, "capture") + "</span>",
      '<span class="chip">' + plural(s.checks, "check") + "</span>",
      '<span class="chip">' + esc(keyName(k)) + (isAuto ? " · auto" : "") + "</span>",
    ].join("");
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
        if (last && (sq === last.from || sq === last.to)) cls += " hl-" + last.color;
        if (flash && flash[sq]) cls += " " + flash[sq];
        var pc = grid[r][f];
        html += '<div class="' + cls + '" data-sq="' + sq + '">';
        if (pc) {
          var white = pc === pc.toUpperCase();
          html += '<span class="pc ' + (white ? "w" : "b") + '">' + ChessPieces.use(ChessPieces.codeFor(pc)) + "</span>";
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

    // Material lead badges next to the player names.
    var m = ChessAnalysis.countMaterial(fen), lead = m.w - m.b;
    $("white-lead").textContent = lead > 0 ? "+" + lead : "";
    $("black-lead").textContent = lead < 0 ? "+" + -lead : "";

    document.querySelectorAll(".mv").forEach(function (el) {
      el.classList.toggle("current", +el.dataset.ply === state.ply);
    });
    // Keep the current move visible by scrolling the list only (scrollIntoView would scroll the page too).
    var cur = document.querySelector(".mv.current"), list = $("move-list");
    if (cur) {
      var top = cur.offsetTop - list.offsetTop, bottom = top + cur.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top - 8;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
    }
    setPlayIcon(state.playing);
    drawTimeline();
  }

  // ---------- timeline: the shape of the game ----------

  function drawTimeline() {
    var cv = $("timeline");
    var g = state.game;
    if (!cv || !g) return;
    var css = getComputedStyle(document.documentElement);
    var tok = function (name) { return css.getPropertyValue(name).trim(); };
    var phaseColor = { opening: tok("--phase-opening"), middlegame: tok("--phase-middlegame"), endgame: tok("--phase-endgame") };

    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    var frames = g.analysis.frames, n = frames.length;
    var x = function (ply) { return (ply / n) * w; };
    var mid = h / 2;

    // Phase bands (frame i covers plies i..i+1).
    frames.forEach(function (f, i) {
      c.fillStyle = phaseColor[f.phase];
      c.fillRect(x(i), 0, x(i + 1) - x(i) + 0.5, h);
    });

    // Tension: filled area rising from the bottom, fading upwards.
    var grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255, 179, 71, 0.75)");
    grad.addColorStop(1, "rgba(255, 179, 71, 0.15)");
    c.beginPath();
    c.moveTo(0, h);
    frames.forEach(function (f, i) { c.lineTo(x(i + 1), h - f.tension * (h - 6)); });
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = grad;
    c.fill();

    // Material balance around the centre line (White up, Black down), clamped at ±15.
    c.strokeStyle = "rgba(255,255,255,0.15)";
    c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(0, mid); c.lineTo(w, mid); c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(0, mid);
    frames.forEach(function (f, i) {
      var b = Math.max(-15, Math.min(15, f.balance));
      c.lineTo(x(i + 1), mid - (b / 15) * (mid - 4));
    });
    c.strokeStyle = tok("--text");
    c.lineWidth = 1.5;
    c.stroke();
    c.lineWidth = 1;

    // Captures (bottom) and checks (top) as ticks.
    frames.forEach(function (f, i) {
      var px = x(i + 1);
      if (f.capture) { c.fillStyle = tok("--capture"); c.fillRect(px - 1, h - 9, 2, 9); }
      if (f.check) { c.fillStyle = tok("--check"); c.fillRect(px - 1, 0, 2, 9); }
    });

    // Played portion dims less than what's still to come.
    var px0 = x(state.ply);
    c.fillStyle = "rgba(14, 15, 19, 0.45)";
    c.fillRect(px0, 0, w - px0, h);

    // Playhead with a soft glow.
    var ph = Math.min(w - 2, Math.max(0, px0 - 1));
    c.shadowColor = tok("--white-voice");
    c.shadowBlur = 8;
    c.fillStyle = tok("--white-voice");
    c.fillRect(ph, 0, 2, h);
    c.shadowBlur = 0;
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
    html += '<li class="result">' + esc(g.result) + "</li>";
    $("move-list").innerHTML = html;
  }
  function moveSpan(i) {
    var m = state.game.moves[i];
    return '<span class="mv' + (m.color === "b" ? " by-b" : "") + '" data-ply="' + (i + 1) + '">' + esc(m.san) + "</span> ";
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

  // Slide the piece now on `to` from `from`'s position (FLIP: the board is already rebuilt).
  // WAAPI on transform runs on the compositor; the next render replaces the element, so nothing stacks.
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var EASE = getComputedStyle(document.documentElement).getPropertyValue("--ease").trim();
  function slidePiece(from, to, ms) {
    var a = document.querySelector('.sq[data-sq="' + from + '"]');
    var b = document.querySelector('.sq[data-sq="' + to + '"]');
    var pc = b && b.querySelector(".pc");
    if (!a || !pc || ms <= 0) return;
    var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    pc.style.zIndex = 4; // above other squares' pieces and the pulse ring while travelling
    pc.animate(
      [{ transform: "translate(" + (ra.left - rb.left) + "px, " + (ra.top - rb.top) + "px)" }, { transform: "none" }],
      { duration: ms, easing: EASE }
    ).onfinish = function () { pc.style.zIndex = ""; };
  }

  // Expanding ring on a square, in the mover's voice colour. Removes itself when done.
  function pulse(square, color, ms, faint) {
    var cell = document.querySelector('.sq[data-sq="' + square + '"]');
    if (!cell) return;
    var ring = document.createElement("span");
    ring.className = "pulse" + (faint ? " faint" : "");
    ring.style.setProperty("--pulse-color", "var(--" + (color === "w" ? "white" : "black") + "-voice)");
    ring.style.setProperty("--pulse-ms", ms + "ms");
    ring.addEventListener("animationend", function () { ring.remove(); });
    cell.appendChild(ring);
  }

  function setTension(t) {
    document.documentElement.style.setProperty("--tension-level", t.toFixed(2));
    if (window.ChessBackground) ChessBackground.setTension(t);
  }

  // ---------- Now readout ----------

  var TAG_CHIPS = {
    capture: ["capture", "Capture"],
    check: ["check", "Check"],
    CHECKMATE: ["mate", "Checkmate"],
    "castle chord": ["special", "Castle"],
    "promotion run": ["special", "Promotion"],
  };

  function setMeter(level) {
    var m = $("groove-meter");
    m.dataset.level = level;
    m.setAttribute("aria-valuenow", level);
  }

  function showIdle(text, frame) {
    var mv = $("now-move");
    mv.className = "now-move idle";
    mv.textContent = text;
    $("now-notes").textContent = "";
    $("now-chips").innerHTML = frame ? '<span class="chip phase-' + frame.phase + '">' + cap(frame.phase) + "</span>" : "";
    $("now-chord").textContent = "–";
    $("now-balance").textContent = balanceText(frame ? frame.balance : 0);
    setMeter(0);
    $("now-playing").textContent = text;
  }

  function renderNow(move, ev, bed, frame, moveNo) {
    var num = moveNo + (move.color === "w" ? "." : "…");
    var mv = $("now-move");
    mv.className = "now-move";
    mv.innerHTML = '<span class="mvno">' + esc(num) + '</span> <span class="side-' + move.color + '">' + esc(move.san) + "</span>";

    var names = ev.notes.map(function (n) { return n.name; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var special = ev.tags.some(function (t) { return t === "castle chord" || t === "promotion run" || t === "CHECKMATE"; });
    $("now-notes").textContent = names.join(" ") + (special ? "" : " · " + ChessMusic.PIECES[move.piece].label + " note");

    var chips = ['<span class="chip phase-' + frame.phase + '">' + cap(frame.phase) + "</span>"];
    ev.tags.forEach(function (t) {
      var c = TAG_CHIPS[t];
      if (c) chips.push('<span class="chip ' + c[0] + '">' + c[1] + "</span>");
    });
    $("now-chips").innerHTML = chips.join("");

    $("now-chord").textContent = bed.chord || "Off";
    $("now-balance").textContent = balanceText(frame.balance);
    setMeter(bed.level);
    $("now-playing").textContent = num + " " + move.san + ". " + names.join(" ") + ".";
  }

  // ---------- music ----------

  function key() {
    var auto = state.game ? state.game.analysis.auto : { root: "C", mode: "major" };
    var root = $("key-root").value, mode = $("key-mode").value;
    return { root: root === "auto" ? auto.root : root, mode: mode === "auto" ? auto.mode : mode };
  }
  function layers() {
    return {
      motion: $("layer-motion").checked,
      harmony: $("layer-harmony").checked,
      groove: $("layer-groove").checked,
      phase: $("layer-phase").checked,
    };
  }
  function bpm() { return +$("tempo").value; }
  // Set the tempo slider, its readout and how far its track is lit.
  function setTempo(v) {
    var el = $("tempo");
    el.value = v;
    $("tempo-out").textContent = el.value;
    el.style.setProperty("--fill", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");
  }

  // Apply the next move to the board and play it. Returns the event (or null at the end).
  function stepForward(withSound) {
    var g = state.game;
    if (!g || state.ply >= g.moves.length) return null;
    var move = g.moves[state.ply];
    var frame = g.analysis.frames[state.ply];
    state.ply++;
    var k = key(), ly = layers();
    var ev = ChessMusic.moveToEvent(move, k, { motion: ly.motion });
    var bed = ChessArrangement.bedFor(frame, k, ev.length, ly);
    if (/#/.test(move.san)) { bed.groove = []; bed.bass = null; } // let the final hit stand alone
    ev.tempo = bpm() * bed.tempoMul; // endgames breathe a little slower
    if (withSound) {
      var t = Tone.now() + 0.03;
      ChessAudio.playEvent(ev, ev.tempo, t);
      ChessAudio.playBed(bed, ev.tempo, t);
    }
    var beatMs = 60000 / ev.tempo;
    var flash = flashFor(move);
    if (withSound && !flash[move.to]) flash[move.to] = "flash-note-" + move.color; // capture/check flashes win
    render(flash);
    if (flash[move.to] === "flash-note-" + move.color) {
      // The flash fades with the note: short for a pawn's 16th, long for a queen's half note.
      var noteMs = Math.round(Math.max(180, Math.min(600, ChessMusic.PIECES[move.piece].dur * beatMs)));
      document.querySelector('.sq[data-sq="' + move.to + '"]').style.setProperty("--note-ms", noteMs + "ms");
    }
    // Slide only during auto-playback: keyboard and button steps stay instant.
    if (state.playing && !reduceMotion.matches) {
      var slideMs = Math.min(160, Math.round(ev.length * beatMs * 0.4));
      slidePiece(move.from, move.to, slideMs);
      if (/[kq]/.test(move.flags)) { // castling: the rook travels too
        var rank = move.color === "w" ? "1" : "8", kside = move.flags.indexOf("k") >= 0;
        slidePiece((kside ? "h" : "a") + rank, (kside ? "f" : "d") + rank, slideMs);
      }
    }

    var ringMs = Math.round(Math.max(350, Math.min(1400, ev.length * beatMs)));
    pulse(move.to, move.color, ringMs, false);
    if (ly.motion && (move.piece === "n" || (/[rbq]/.test(move.piece) && ChessMusic.distance(move.from, move.to) >= 3))) {
      pulse(move.from, move.color, Math.round(ringMs * 0.6), true);
    }
    setTension(frame.tension);

    var moveNo = g.fens[state.ply - 1].split(" ")[5]; // full-move number of the position before the move
    renderNow(move, ev, bed, frame, moveNo);
    return ev;
  }

  function goTo(ply) {
    pause();
    ChessAudio.stopAll();
    var g = state.game;
    state.ply = Math.max(0, Math.min(ply, g.moves.length));
    render();
    var frame = state.ply > 0 ? g.analysis.frames[state.ply - 1] : null;
    setTension(frame ? frame.tension : 0);
    if (!frame) { showIdle("Start position."); return; }
    var moveNo = g.fens[state.ply - 1].split(" ")[5];
    var m = g.moves[state.ply - 1];
    showIdle("Jumped to " + moveNo + (m.color === "w" ? ". " : "… ") + m.san + " (silent).", frame);
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
        showIdle("Game over: " + g.result + ". No mate, so a soft closing chord.", g.analysis.frames[g.moves.length - 1]);
      }
      pause();
      // Album mode: roll into the next game once the ending has rung out
      // (closing chord is 3 beats; a mate's final hit has already played out).
      var next = neighbour(1);
      if (next && $("auto-advance").checked) {
        $("auto-advance-switch").setAttribute("data-advancing", ""); // the switch shows the next game is queued
        state.advanceTimer = setTimeout(function () {
          if (go(next, 1)) play();
        }, (g.mate ? 1 : 4) * (60000 / bpm()));
      }
      return;
    }
    ChessAudio.ensure(); // iOS may have suspended audio mid-game (lock screen, app switch)
    var ev = stepForward(true);
    state.timer = setTimeout(tick, (ev.length * 60000) / ev.tempo);
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
    clearTimeout(state.padTimer);
    clearTimeout(state.advanceTimer);
    $("auto-advance-switch").removeAttribute("data-advancing");
    state.timer = null;
    ChessAudio.releaseBed();
    setPlayIcon(false);
  }
  // The play button holds both icons; CSS shows the one matching data-playing.
  function setPlayIcon(playing) {
    var btn = $("btn-play");
    btn.toggleAttribute("data-playing", playing);
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function togglePlay() { state.playing ? pause() : play(); }

  function stepFwdButton() {
    if (!state.game) return;
    pause();
    ChessAudio.init().then(function () {
      var ev = stepForward(true);
      // A single step shouldn't leave the pad droning: fade it once the move's time is up.
      if (ev) state.padTimer = setTimeout(ChessAudio.releaseBed, (ev.length * 60000) / ev.tempo);
    });
  }

  // ---------- wiring ----------

  // ---------- library / album mode ----------
  // A collection plays like an album: Prev/Next walk it in chronological order (library.js is pre-sorted).

  var LIB = window.GAME_LIBRARY || { collections: [], games: [] };
  var AUTO_KEY = "chessBeats.autoAdvance";
  var PENDING_KEY = "chessBeats.pendingPgn"; // set by games-page.js, read once on load

  function collectionOf(entry) {
    return LIB.collections.find(function (c) { return c.id === entry.collection; });
  }
  // The game before (dir -1) or after (dir 1) this one: in the chess.com playlist when there is one
  // (the picker's order, newest first), otherwise in the library collection.
  function neighbour(dir) {
    if (state.playlist) {
      var i = state.playlist.index + dir;
      return state.playlist.items[i] ? { playlistIndex: i, label: state.playlist.items[i].label } : null;
    }
    if (!state.entry) return null;
    var list = LIB.games.filter(function (g) { return g.collection === state.entry.collection; });
    return list[list.indexOf(state.entry) + dir] || null;
  }

  function setTitle(main, sub) {
    $("game-title").innerHTML = "<b>" + esc(main) + "</b>" + (sub ? " <small>" + esc(sub) + "</small>" : "");
    document.title = main + " · Chess Beats";
  }

  function updateNav() {
    var prev = neighbour(-1), next = neighbour(1);
    $("btn-prev-game").disabled = !prev;
    $("btn-next-game").disabled = !next;
    var name = function (g) { return g.label || g.name || g.title; };
    $("btn-prev-game").title = prev ? "Previous: " + name(prev) : "No previous game";
    $("btn-next-game").title = next ? "Next: " + name(next) : "No next game";
  }

  // Load what neighbour() returned. Returns true when a game loaded.
  function go(target, dir) {
    if (!target) return false;
    if (target.playlistIndex == null) { loadEntry(target); return true; }
    return loadPlaylistItem(target.playlistIndex, dir);
  }

  // Play a game from the chess.com playlist; one that won't parse is skipped in the same direction.
  function loadPlaylistItem(i, dir) {
    var pl = state.playlist;
    for (; pl && pl.items[i]; i += dir || 1) {
      var item = pl.items[i];
      if (!item.parsed) { try { item.parsed = parsePgn(item.text); } catch (e) { continue; } }
      pl.index = i;
      loadCustom(item.text, item.label, { sub: item.sub, game: item.parsed, playlist: pl, bpm: item.bpm });
      return true;
    }
    updateNav();
    return false;
  }

  function loadEntry(entry) {
    loadGame(entry.pgn);
    state.entry = entry;
    state.playlist = null;
    var c = collectionOf(entry);
    setTitle(entry.name || entry.title, [entry.name ? entry.title : "", entry.year, c && c.title].filter(Boolean).join(" · "));
    updateNav();
    history.replaceState(null, "", "?game=" + encodeURIComponent(entry.id));
  }

  function showError(msg) { $("pgn-error").textContent = msg || ""; }

  // opts.sub: the title's second line (default: the players); opts.game: an already-parsed game;
  // opts.playlist: the chess.com list this game belongs to, so the arrows and Auto-advance walk it;
  // opts.bpm: its starting tempo (default DEFAULT_BPM).
  function loadCustom(text, label, opts) {
    opts = opts || {};
    try {
      loadGame(text, opts.game, opts.bpm);
      showError("");
      state.entry = null;
      state.playlist = opts.playlist || null;
      var h = state.game.headers;
      setTitle(label || "Your PGN", opts.sub || [h.White, h.Black].filter(Boolean).join(" vs "));
      updateNav();
      history.replaceState(null, "", location.pathname);
      $("pgn-dialog").close();
    } catch (e) {
      showError(e.message);
    }
  }

  function init() {
    if (typeof Chess === "undefined" || typeof Tone === "undefined") {
      showIdle("Couldn't load chess.js or Tone.js. Check your internet connection and reload.");
      return;
    }
    var params = new URLSearchParams(location.search);
    var wanted = params.get("game");
    var start = LIB.games.find(function (g) { return g.id === wanted; }) ||
      LIB.games.find(function (g) { return g.collection === "classics"; }) || LIB.games[0];
    // A PGN handed over from the games page ("Load your own game") wins over the default game.
    var pending = null;
    if (params.get("pgn") === "pending") {
      try {
        pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
        sessionStorage.removeItem(PENDING_KEY);
      } catch (e) {}
    }
    if (start) loadEntry(start);
    if (pending && pending.text) {
      var pl = pending.playlist && pending.playlist.items && pending.playlist.items.length ? pending.playlist : null;
      loadCustom(pending.text, pending.label, { sub: pending.sub, playlist: pl, bpm: pending.bpm });
    }

    // Back to the grid with the filters it was left on.
    try { $("link-library").href = "games.html" + (sessionStorage.getItem("chessBeats.libraryHash") || ""); } catch (e) {}
    $("btn-prev-game").addEventListener("click", function () { go(neighbour(-1), -1); });
    $("btn-next-game").addEventListener("click", function () { go(neighbour(1), 1); });
    try { $("auto-advance").checked = localStorage.getItem(AUTO_KEY) === "1"; } catch (e) {}
    $("auto-advance").addEventListener("change", function (e) {
      try { localStorage.setItem(AUTO_KEY, e.target.checked ? "1" : "0"); } catch (err) {}
      if (!e.target.checked) { clearTimeout(state.advanceTimer); $("auto-advance-switch").removeAttribute("data-advancing"); }
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

    $("tempo").addEventListener("input", function (e) { setTempo(e.target.value); });
    $("key-root").addEventListener("change", function () { if (state.game) showProfile(); });
    $("key-mode").addEventListener("change", function () { if (state.game) showProfile(); });

    $("timeline").addEventListener("click", function (e) {
      if (!state.game) return;
      var r = e.currentTarget.getBoundingClientRect();
      goTo(Math.round(((e.clientX - r.left) / r.width) * state.game.moves.length));
    });
    window.addEventListener("resize", drawTimeline);

    // The Load dialog (load-dialog.js): pasted, uploaded and chess.com games all load here, in place.
    LoadDialog.init({
      onText: function (text, label) { loadCustom(text, label); },
      onPick: function (pgn, label, sub, parsed, playlist) {
        var bpm = playlist && playlist.items[playlist.index].bpm;
        loadCustom(pgn, label, { sub: sub, game: parsed, playlist: playlist, bpm: bpm });
      }
    });
    $("btn-open-pgn").addEventListener("click", LoadDialog.open);
    $("btn-open-help").addEventListener("click", function () { $("help-dialog").showModal(); });


    document.addEventListener("keydown", function (e) {
      if (document.querySelector("dialog[open]")) return; // dialogs keep their own keys
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // so do form controls
      // Space on a focused button already "clicks" it; don't toggle play a second time.
      if (e.code === "Space") { if (e.target.tagName === "BUTTON") return; e.preventDefault(); togglePlay(); }
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
