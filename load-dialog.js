// The "Load a game" dialog, shared by the landing page, the player and the library (each page carries
// the same markup; styles in load-dialog.css). Two tabs: Paste or upload, and Chess.com, a player's last
// 25 standard games (chesscom.js), each a card with its final position and tension line (miniboard.js).
//   LoadDialog.init({ onText(text, label), onPick(pgn, label, sub, parsed) })  wires it up
//   LoadDialog.open()                                 shows it, focused on the open tab
//   LoadDialog.openInPlayer(text, label, sub, checked) hands a game to play.html (landing, library)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function parsePgn(text) { return ChessPgn.parse(text); }

  var TAB_KEY = "chessBeats.loadTab", CC_USER_KEY = "chessBeats.chesscomUser";
  var onPick = function () {};
  var cc = { cache: {}, timeClass: "", token: 0, user: "" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TC_NAME = { bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", daily: "Daily" };

  function selectTab(which, focus) {
    ["pgn", "cc"].forEach(function (t) {
      var on = t === which, tab = $("tab-" + t);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      $("panel-" + t).hidden = !on;
    });
    try { localStorage.setItem(TAB_KEY, which); } catch (e) {}
    widenForResults();
    if (focus) (which === "cc" ? $("cc-user") : $("pgn-input")).focus();
  }
  function widenForResults() {
    var wide = !$("panel-cc").hidden && $("cc-results").children.length > 0;
    $("pgn-dialog").classList.toggle("dialog-wide", wide);
  }
  function ccStatus(text, tone) {
    $("cc-status").textContent = text || "";
    if (tone) $("cc-status").setAttribute("data-tone", tone); else $("cc-status").removeAttribute("data-tone");
  }
  function monthLabel(url) { // ".../games/2026/11" -> "Nov 2026"
    var m = url.match(/(\d{4})\/(\d{2})$/);
    return m ? MONTHS[+m[2] - 1] + " " + m[1] : "older games";
  }
  function dateLabel(sec) {
    var d = new Date(sec * 1000);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function clockLabel(tc) { // "180+2" -> "3+2", "1/259200" (daily) -> "3 days"
    if (!tc) return "";
    var d = tc.match(/^1\/(\d+)$/);
    if (d) { var days = Math.round(+d[1] / 86400); return days + (days === 1 ? " day" : " days"); }
    var p = tc.split("+"), base = +p[0];
    var b = base >= 60 && base % 60 === 0 ? base / 60 : base >= 60 ? (base / 60).toFixed(1) : base + "s";
    return p[1] && p[1] !== "0" ? b + "+" + p[1] : b + (base >= 60 ? " min" : "");
  }
  function ccErrorText(e, user) {
    switch (e && e.code) {
      case "not-found": return "No chess.com player called “" + user + "”.";
      case "no-archives": return "“" + user + "” hasn't played any games on chess.com yet.";
      case "rate-limited": return "Chess.com is rate-limiting requests. Try again in a minute.";
      case "bad-name": return "That doesn't look like a chess.com username.";
      default: return "Couldn't reach chess.com. Check your connection and try again.";
    }
  }

  function ccCard(g, i) {
    var mine = cc.user, white = g.white || {}, black = g.black || {};
    var meWhite = String(white.username).toLowerCase() === mine;
    var opp = meWhite ? black : white;
    var res = ChessCom.outcome(g, mine);
    var meta = [TC_NAME[g.time_class] || g.time_class, clockLabel(g.time_control), g.end_time ? dateLabel(g.end_time) : ""].filter(Boolean).join(" · ");
    var label = "Play " + white.username + " vs " + black.username + ", " + res + " for " + (meWhite ? white.username : black.username) + ", " + meta;
    return '<button type="button" class="cc-game" data-i="' + i + '" aria-label="' + esc(label) + '">' +
      '<div class="cc-board">' + MiniBoard.board(g.fen || "8/8/8/8/8/8/8/8", null) + "</div>" +
      '<div class="cc-spark-wait"></div>' +
      '<div class="cc-top"><span class="cc-opp">vs ' + esc(opp.username || "?") + (opp.rating ? " <small>" + opp.rating + "</small>" : "") + "</span>" +
      '<span class="cc-res ' + res + '">' + cap(res) + "</span></div>" +
      '<div class="cc-meta">' + esc(meta) + "</div></button>";
  }

  // Parse each game after the cards are up, one per tick, so the dialog stays responsive;
  // each card gains its last-move tint and tension line as its parse lands.
  function ccParseAll(list, token) {
    var i = 0;
    (function nextOne() {
      if (token !== cc.token || i >= list.length) return;
      var item = list[i], btn = document.querySelector('.cc-game[data-i="' + i + '"]');
      i++;
      if (!item.parsed && !item.failed) {
        try { item.parsed = parsePgn(item.game.pgn); } catch (e) { item.failed = true; }
      }
      if (btn) {
        if (item.parsed) {
          var p = item.parsed, last = p.moves[p.moves.length - 1];
          btn.querySelector(".cc-board").innerHTML = MiniBoard.board(p.fens[p.fens.length - 1], last ? { from: last.from, to: last.to, color: last.color } : null);
          btn.querySelector(".cc-spark-wait").outerHTML = MiniBoard.spark(MiniBoard.sparkData(p));
        } else {
          btn.disabled = true;
          btn.querySelector(".cc-meta").textContent = "Can't read this game";
        }
      }
      setTimeout(nextOne, 0);
    })();
  }

  function ccShow(list) {
    var box = $("cc-results");
    box.innerHTML = list.map(function (item, i) { return ccCard(item.game, i); }).join("");
    box.scrollTop = 0;
    widenForResults();
    ccParseAll(list, cc.token);
  }

  function ccSearch() {
    var user = $("cc-user").value.trim().toLowerCase();
    if (!user) { ccStatus("Type a chess.com username first.", "error"); $("cc-user").focus(); return; }
    try { localStorage.setItem(CC_USER_KEY, user); } catch (e) {}
    var key = user + "|" + cc.timeClass, token = ++cc.token;
    var what = cc.timeClass ? TC_NAME[cc.timeClass].toLowerCase() + " " : "standard ";
    var done = function (list) {
      if (token !== cc.token) return;
      cc.user = user;
      if (!list.length) { ccStatus("No " + what + "games found for “" + user + "”.", "error"); $("cc-results").innerHTML = ""; widenForResults(); return; }
      ccStatus(list.length >= 25 ? "Last 25 " + what + "games. Pick one to hear it." : "Only " + list.length + " " + what + "game" + (list.length === 1 ? "" : "s") + " found. Pick one to hear it.");
      ccShow(list);
    };
    if (cc.cache[key]) { done(cc.cache[key]); return; }
    $("cc-find").disabled = true;
    ccStatus("Looking up “" + user + "”…");
    ChessCom.recentGames(user, {
      count: 25,
      timeClass: cc.timeClass || undefined,
      onProgress: function (url) { if (token === cc.token) ccStatus("Looking through " + monthLabel(url) + "…"); }
    }).then(function (games) {
      var list = games.map(function (g) { return { game: g }; });
      cc.cache[key] = list;
      done(list);
    }, function (e) {
      if (token !== cc.token) return;
      ccStatus(ccErrorText(e, user), "error");
      $("cc-results").innerHTML = "";
      widenForResults();
    }).then(function () { $("cc-find").disabled = false; });
  }

  function ccPick(i) {
    var list = cc.cache[cc.user + "|" + cc.timeClass];
    var item = list && list[i];
    if (!item) return;
    var g = item.game, w = g.white || {}, b = g.black || {};
    var sub = ["Chess.com", TC_NAME[g.time_class], g.end_time ? dateLabel(g.end_time) : ""].filter(Boolean).join(" · ");
    onPick(g.pgn, w.username + " vs " + b.username, sub, item.parsed || null);
  }

  function init(opts) {
    onPick = opts.onPick;
    var onText = opts.onText;
    // Paste or upload
    $("btn-load").addEventListener("click", function () { onText($("pgn-input").value, "Your PGN (pasted)"); });
    $("pgn-file").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        $("pgn-input").value = text;
        onText(text, file.name);
      });
      e.target.value = ""; // allow re-uploading the same file
    });
    // Tabs and the chess.com picker
    var tabs = [$("tab-pgn"), $("tab-cc")];
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { selectTab(i ? "cc" : "pgn", true); });
      tab.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        var next = tabs[(i + 1) % 2];
        selectTab(next === tabs[1] ? "cc" : "pgn", false);
        next.focus();
      });
    });
    try { $("cc-user").value = localStorage.getItem(CC_USER_KEY) || ""; } catch (e) {}
    $("cc-form").addEventListener("submit", function (e) { e.preventDefault(); ccSearch(); });
    $("pgn-dialog").querySelectorAll(".chip-btn").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $("pgn-dialog").querySelectorAll(".chip-btn").forEach(function (c) { c.setAttribute("aria-checked", c === chip ? "true" : "false"); });
        cc.timeClass = chip.dataset.tc;
        if ($("cc-user").value.trim()) ccSearch();
      });
    });
    $("cc-results").addEventListener("click", function (e) {
      var btn = e.target.closest(".cc-game");
      if (btn && !btn.disabled) ccPick(+btn.dataset.i);
    });
    var saved = "pgn";
    try { saved = localStorage.getItem(TAB_KEY) === "cc" ? "cc" : "pgn"; } catch (e) {}
    selectTab(saved, false);
  }

  function showError(msg) { $("pgn-error").textContent = msg || ""; }

  function open() {
    showError("");
    $("pgn-dialog").showModal();
    ($("panel-cc").hidden ? $("pgn-input") : $("cc-user")).focus();
  }

  // Pages without a board (landing, library): check the PGN here so mistakes show in the dialog, then
  // hand it to the player, which reads it once from sessionStorage on play.html?pgn=pending.
  // sub: the title line under the label (optional); checked: already parsed (the chess.com picker).
  var PENDING_KEY = "chessBeats.pendingPgn";
  function openInPlayer(text, label, sub, checked) {
    if (!checked) {
      try { ChessPgn.parse(text); } catch (e) { showError(e.message); return; } // a readable message on bad input
    }
    // Keep only the first game: a big multi-game file could overflow sessionStorage.
    var first = String(text).replace(/\r\n?/g, "\n").trim().split(/\n\s*\n(?=\[Event )/)[0];
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ text: first, label: label, sub: sub || "" }));
    } catch (e) {
      var msg = "Couldn't hand the game to the player (browser storage is unavailable).";
      if ($("panel-cc").hidden) showError(msg); else ccStatus(msg, "error");
      return;
    }
    location.href = "play.html?pgn=pending";
  }

  window.LoadDialog = { init: init, open: open, showError: showError, openInPlayer: openInPlayer };
})();
