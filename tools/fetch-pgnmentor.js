// Download player files from PGN Mentor and select a balanced, classical "best games" subset.
// Run: npm run fetch:pgnmentor
// Downloads are cached in data/cache/pgnmentor/ (gitignored). The selection is written to
// data/pgn/pgnmentor-selected.pgn (committed), which build-library.js reads offline.
const fs = require("node:fs");
const path = require("node:path");
const { Chess } = require("chess.js");
const ChessAnalysis = require("../analysis.js");
const ChessPgn = require("../pgn.js");
const BUILTIN_GAMES = require("../games.js");
const { normalize } = require("./pgn-normalize.js");
const { unzip } = require("./zip.js");
const S = require("./pgn-select.js");
const { COLLECTIONS, QUOTA } = require("./collections.js");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "data/cache/pgnmentor");
const OUT = path.join(ROOT, "data/pgn/pgnmentor-selected.pgn");
const MIN_PLIES = 20;
const POOL_FACTOR = 4; // analyse this many candidates per selected game
const PER_OPPONENT = 3; // at most this many games against the same opponent per collection
const KEEP_TAGS = ["Event", "Site", "Date", "Round", "White", "Black", "Result", "ECO", "WhiteElo", "BlackElo"];

const mentor = COLLECTIONS.filter((c) => c.source === "pgnmentor");

async function download(c) {
  const file = path.join(CACHE, c.file + ".zip");
  if (fs.existsSync(file)) return file;
  const url = "https://www.pgnmentor.com/players/" + c.file + ".zip";
  const res = await fetch(url, { headers: { "User-Agent": "chess-beats-library-builder" } });
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function plyCount(movetext) {
  return movetext.split(" ").filter((t) => t && !/^\d+\.$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)).length;
}

// Keys of games already in the book and built-in collections, so they aren't added twice.
function existingKeys() {
  const keys = new Set();
  COLLECTIONS.filter((c) => c.source === "book").forEach((c) => {
    normalize(fs.readFileSync(path.join(ROOT, c.file), "utf8")).forEach((g) => keys.add(S.gameKey(g.movetext, g.headers)));
  });
  BUILTIN_GAMES.forEach((b) => normalize(b.pgn).forEach((g) => keys.add(S.gameKey(g.movetext, g.headers))));
  return keys;
}

function analyse(cand) {
  try {
    const g = ChessPgn.parse(cand.pgn, Chess, ChessAnalysis);
    return g.analysis.summary.avgTension;
  } catch (e) {
    return null; // illegal or unreadable: drop
  }
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const taken = existingKeys();
  const report = [];
  const pools = {};
  const selected = {};

  for (const c of mentor) {
    const file = await download(c);
    const text = unzip(fs.readFileSync(file)).map((f) => f.data.toString("latin1")).join("\n");
    const games = normalize(text);
    const quota = QUOTA[c.category];
    const seen = new Set();
    const cands = [];
    let classical = 0;
    for (const g of games) {
      const h = g.headers;
      const side = S.playerSide(h, c.player);
      if (!side || !S.isClassical(h.Event)) continue;
      if (plyCount(g.movetext) < MIN_PLIES) continue;
      classical++;
      const key = S.gameKey(g.movetext, h);
      if (seen.has(key) || taken.has(key)) continue;
      seen.add(key);
      // A decisive game between two collection players belongs to the winner's collection.
      const winnerSide = h.Result === "1-0" ? "w" : h.Result === "0-1" ? "b" : null;
      if (winnerSide && winnerSide !== side) {
        const winner = winnerSide === "w" ? h.White : h.Black;
        if (mentor.some((o) => o !== c && o.player.test(winner || ""))) continue;
      }
      const tags = {};
      KEEP_TAGS.forEach((t) => { if (h[t] && h[t] !== "?" && h[t] !== "") tags[t] = h[t]; });
      const opponent = String((side === "w" ? h.Black : h.White) || "").split(",")[0].trim().toLowerCase();
      cands.push({ key, year: S.yearOf(h), score: S.baseScore(h, side), tie: S.hash(key), opponent, titleMatch: S.isTitleMatch(h.Event), tags, movetext: g.movetext, pgn: g.pgn });
    }
    // Analyse a career-spread pool, add a tension bonus (busier games make livelier music), then pick.
    const pool = S.spreadPick(cands, quota * POOL_FACTOR)
      .filter((x) => !taken.has(x.key))
      .map((x) => { const t = analyse(x); return t === null ? null : Object.assign(x, { score: x.score + 2 * t }); })
      .filter(Boolean);
    const pick = S.spreadPick(pool, quota, 5, PER_OPPONENT);
    pick.forEach((x) => taken.add(x.key));
    selected[c.id] = pick;
    pools[c.id] = pool.filter((x) => !taken.has(x.key)).sort((a, b) => b.score - a.score || a.tie - b.tie);
    report.push({ c, total: games.length, classical, picked: pick.length, quota });
  }

  // Shortfall (players with too few classical games) goes to the other world champions.
  let shortfall = report.reduce((s, r) => s + Math.max(0, r.quota - r.picked), 0);
  const champs = mentor.filter((c) => c.category === "champions");
  for (let i = 0; shortfall > 0 && champs.some((c) => pools[c.id].length); i++) {
    const c = champs[i % champs.length];
    const vs = (o) => selected[c.id].filter((x) => x.opponent === o).length;
    const extra = pools[c.id].find((x) => !taken.has(x.key) && (x.titleMatch || vs(x.opponent) < PER_OPPONENT));
    if (!extra) continue;
    pools[c.id].splice(pools[c.id].indexOf(extra), 1);
    taken.add(extra.key);
    selected[c.id].push(extra);
    report.find((r) => r.c === c).picked++;
    shortfall--;
  }

  const out = [];
  for (const c of mentor) {
    for (const x of selected[c.id]) {
      const lines = ['[Collection "' + c.id + '"]'].concat(Object.keys(x.tags).map((k) => "[" + k + ' "' + x.tags[k] + '"]'));
      out.push(lines.join("\n") + "\n\n" + x.movetext + "\n");
    }
  }
  fs.writeFileSync(OUT, "% Selected from PGN Mentor player files (pgnmentor.com) by tools/fetch-pgnmentor.js.\n% Do not edit by hand; rerun `npm run fetch:pgnmentor`.\n\n" + out.join("\n"));

  console.log("Player          games  classical  picked");
  report.forEach((r) => console.log("  " + r.c.file.padEnd(15) + String(r.total).padStart(5) + String(r.classical).padStart(11) + String(r.picked).padStart(8)));
  const total = report.reduce((s, r) => s + r.picked, 0);
  console.log("Selected " + total + " games -> " + path.relative(ROOT, OUT) + " (" + Math.round(fs.statSync(OUT).size / 1024) + " KB)");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
