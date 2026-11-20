// Landing page: silently "plays" the Immortal Game so the page moves the way the music does.
// Each move ticks the tape counter, swings the VU needle, lights the matching channel strips,
// moves the score-sheet playhead and warms the glass background (window.ChessBackground)
// along the game's real tension curve (its sparkline from library.js, copied here so the page
// doesn't load the 1.4 MB library).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Anderssen v Kieseritzky, London 1851.
  var MOVES = ("e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 " +
    "h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#").split(" ");
  // Tension sparkline for this game (40 samples across its 45 plies), from library.js.
  var SPARK = [0, 0, 0.03, 0.32, 0.53, 0.42, 0.37, 0.6, 0.47, 0.41, 0.33, 0.3, 0.2, 0.23, 0.22, 0.27, 0.3, 0.3,
    0.35, 0.61, 0.49, 0.52, 0.44, 0.48, 0.43, 0.73, 0.59, 0.5, 0.41, 0.66, 0.62, 0.84, 0.73, 1, 0.8, 0.63, 0.78, 0.96, 1, 1];
  var PIECE = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" };
  var BEAT_MS = 1100;

  function tensionAt(ply) { // ply: 0-based index of the move just played
    return SPARK[Math.round((ply / (MOVES.length - 1)) * (SPARK.length - 1))];
  }
  function label(ply) {
    var n = Math.floor(ply / 2) + 1;
    return n + (ply % 2 ? "… " : ". ") + MOVES[ply];
  }

  // ---------- VU meter ticks ----------
  (function ticks() {
    var g = $("vu-ticks"), NS = "http://www.w3.org/2000/svg";
    for (var i = 0; i <= 20; i++) {
      var a = Math.PI + (i / 20) * Math.PI, major = i % 5 === 0;
      var r0 = major ? 222 : 230, r1 = 252;
      var line = document.createElementNS(NS, "line");
      line.setAttribute("x1", 300 + Math.cos(a) * r0); line.setAttribute("y1", 300 + Math.sin(a) * r0);
      line.setAttribute("x2", 300 + Math.cos(a) * r1); line.setAttribute("y2", 300 + Math.sin(a) * r1);
      line.setAttribute("class", (major ? "major" : "") + (i >= 16 ? " hot" : ""));
      g.appendChild(line);
    }
  })();

  // ---------- notation tape (two copies for a seamless loop) ----------
  var tapeItems = [];
  (function tape() {
    var track = $("tape-track"), html = "";
    for (var copy = 0; copy < 2; copy++) {
      MOVES.forEach(function (m, ply) {
        var cls = "tape-move" + (ply % 2 ? " b" : "") + (/x/.test(m) ? " cap" : "");
        html += '<span class="' + cls + '" data-ply="' + ply + '"' + (copy ? ' aria-hidden="true"' : "") + ">" +
          "<small>" + (Math.floor(ply / 2) + 1) + (ply % 2 ? "…" : ".") + "</small>" + m + "<i></i></span>";
      });
    }
    track.innerHTML = html;
    tapeItems = Array.prototype.slice.call(track.querySelectorAll(".tape-move"));
  })();

  // ---------- score sheet: the tension curve as a stave line ----------
  var W = 600, H = 220, PAD = 14;
  function sx(i) { return (i / (SPARK.length - 1)) * W; }
  function sy(v) { return H - PAD - v * (H - PAD * 2); }
  (function curve() {
    var d = "";
    SPARK.forEach(function (v, i) {
      if (!i) { d = "M0," + sy(v).toFixed(1); return; }
      var x0 = sx(i - 1), x1 = sx(i), y0 = sy(SPARK[i - 1]), y1 = sy(v), mx = (x0 + x1) / 2;
      d += " C" + mx.toFixed(1) + "," + y0.toFixed(1) + " " + mx.toFixed(1) + "," + y1.toFixed(1) + " " + x1.toFixed(1) + "," + y1.toFixed(1);
    });
    $("curve-line").setAttribute("d", d);
    $("curve-area").setAttribute("d", d + " L" + W + "," + H + " L0," + H + " Z");
    var sheet = document.querySelector(".sheet");
    if (still || !("IntersectionObserver" in window)) { sheet.classList.add("drawn"); return; }
    new IntersectionObserver(function (entries, io) {
      if (entries[0].isIntersecting) { sheet.classList.add("drawn"); io.disconnect(); }
    }, { threshold: 0.35 }).observe(sheet);
  })();

  // ---------- channel strips ----------
  var strips = {};
  Array.prototype.forEach.call(document.querySelectorAll(".strip"), function (el) {
    strips[el.dataset.ch] = { el: el, read: el.querySelector("[data-read]") };
  });
  function hit(ch, level, text) {
    var s = strips[ch];
    if (!s) return;
    if (text != null) s.read.textContent = text;
    s.el.style.setProperty("--lvl", level);
    s.el.classList.add("hit");
    clearTimeout(s.t);
    s.t = setTimeout(function () { s.el.classList.remove("hit"); s.el.style.setProperty("--lvl", 0.12); }, BEAT_MS * 0.6);
  }

  // ---------- tape counter ----------
  var digits = $("counter-digits");
  function setCounter(n) {
    var str = String(n).padStart(3, "0"), old = digits.textContent;
    digits.innerHTML = str.split("").map(function (c, i) {
      return "<b" + (old[i] !== c && !still ? ' class="roll"' : "") + ">" + c + "</b>";
    }).join("");
  }

  // ---------- play one move ----------
  function play(ply) {
    var san = MOVES[ply], t = tensionAt(ply);
    root.style.setProperty("--tension", t.toFixed(3));
    if (window.ChessBackground) window.ChessBackground.setTension(t);

    setCounter(ply + 1);
    $("counter-move").textContent = label(ply);

    var sq = /([a-h])([1-8])(?!.*[a-h][1-8])/.exec(san);
    var piece = PIECE[san[0]] || "Pawn";
    if (sq) {
      hit("file", 0.25 + ("abcdefgh".indexOf(sq[1]) / 7) * 0.7, sq[1]);
      hit("rank", 0.2 + ((+sq[2] - 1) / 7) * 0.75, sq[2]);
    }
    hit("piece", { Pawn: 0.3, Knight: 0.5, Bishop: 0.5, Rook: 0.7, King: 0.7, Queen: 0.95 }[piece], piece);
    if (/x/.test(san)) hit("capture", 0.9, san);
    if (/\+/.test(san)) hit("check", 0.85, san);
    if (/#/.test(san)) { hit("mate", 1, san); hit("check", 1, san); }

    tapeItems.forEach(function (el) { el.classList.toggle("now", +el.dataset.ply === ply); });
    $("playhead").style.transform = "translateX(" + ((ply / (MOVES.length - 1)) * W).toFixed(1) + "px)";
  }

  // Rest on the game's sharpest moment when motion is off; otherwise loop the whole game.
  if (still) {
    play(MOVES.length - 1);
    return;
  }
  var ply = 0, timer = 0;
  function tick() {
    play(ply);
    var last = ply === MOVES.length - 1;
    ply = last ? 0 : ply + 1;
    timer = setTimeout(tick, last ? BEAT_MS * 4 : BEAT_MS); // let the mate ring before the tape rewinds
  }
  // Pause when the tab is hidden, so it doesn't spin in the background.
  document.addEventListener("visibilitychange", function () {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(tick, 400);
  });
  setTimeout(tick, 1400); // after the hero has entered
})();
