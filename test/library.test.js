// Run: node test/library.test.js  — checks the generated library.js against chess.js.
const assert = require("node:assert/strict");
const { Chess } = require("chess.js");
const L = require("../library.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

console.log("Game library");
const count = (id) => L.games.filter((g) => g.collection === id).length;

test("collections are complete and the library is about 1,000 games", () => {
  assert.equal(count("fischer"), 60);
  assert.equal(count("tal"), 101);
  assert.ok(count("classics") >= 2);
  L.collections.forEach((c) => {
    assert.equal(c.count, count(c.id), c.id + " count");
    assert.ok(c.count > 0, c.id + " is empty");
    assert.ok(L.categories.some((cat) => cat.id === c.category), c.id + " has an unknown category");
  });
  assert.ok(L.games.length >= 950 && L.games.length <= 1050, "total " + L.games.length);
});

test("world champions are favoured over the other categories", () => {
  const sizes = (cat) => L.collections.filter((c) => c.category === cat).map((c) => c.count);
  const minChamp = Math.min(...sizes("champions"));
  for (const cat of ["legends", "women"]) {
    assert.ok(minChamp >= Math.max(...sizes(cat)), "a " + cat + " collection outnumbers a champion");
  }
});

test("no game appears twice across collections (the two books may overlap)", () => {
  // Fischer's and Tal's books both include their games against each other; each book stays complete.
  const BOOKS = new Set(["fischer", "tal"]);
  const seen = new Map();
  for (const g of L.games) {
    const moves = g.pgn.replace(/\[[^\]]*\]/g, "").replace(/\d+\.(\.\.)?/g, " ").replace(/\s+/g, " ").trim();
    const key = g.year + ":" + moves;
    const other = seen.get(key);
    assert.ok(!other || (BOOKS.has(other.collection) && BOOKS.has(g.collection)), g.id + " duplicates " + (other && other.id));
    if (!other) seen.set(key, g);
  }
});

test("PGN Mentor picks are classical games of the collection's player", () => {
  const S = require("../tools/pgn-select.js");
  const { COLLECTIONS } = require("../tools/collections.js");
  for (const c of COLLECTIONS.filter((x) => x.source === "pgnmentor")) {
    for (const g of L.games.filter((x) => x.collection === c.id)) {
      assert.ok(S.isClassical(g.event), g.id + " event looks non-classical: " + g.event);
      assert.ok(c.player.test(g.white) || c.player.test(g.black), g.id + " isn't a " + c.id + " game");
    }
  }
});

test("ids are unique and every game has a valid result", () => {
  assert.equal(new Set(L.games.map((g) => g.id)).size, L.games.length);
  L.games.forEach((g) => assert.match(g.result, /^(1-0|0-1|1\/2-1\/2|\*)$/, g.id));
});

test("every game replays in chess.js; plies and peak position match", () => {
  for (const g of L.games) {
    const c = new Chess();
    assert.ok(c.load_pgn(g.pgn, { sloppy: true }), g.id + " fails to load");
    const moves = c.history({ verbose: true });
    assert.equal(moves.length, g.plies, g.id + " plies");
    const r = new Chess();
    moves.slice(0, g.peakPly).forEach((m) => r.move(m));
    assert.equal(r.fen().split(" ")[0], g.peakFen, g.id + " peakFen");
    if (g.peakPly) assert.equal(moves[g.peakPly - 1].san, g.peakMove.san, g.id + " peakMove");
  }
});

test("collections are chronological (album order)", () => {
  L.collections.forEach((c) => {
    const years = L.games.filter((g) => g.collection === c.id).map((g) => g.year || 9999);
    years.forEach((y, i) => i && assert.ok(y >= years[i - 1], c.id + " out of order at " + i));
  });
});

test("sparklines are 0..1 and bounded in length", () => {
  L.games.forEach((g) => {
    assert.ok(g.spark.length >= 1 && g.spark.length <= 40, g.id);
    g.spark.forEach((v) => assert.ok(v >= 0 && v <= 1, g.id));
  });
});

console.log("\n" + passed + " passed");
