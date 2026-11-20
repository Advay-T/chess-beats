// Run: node test/pgn-normalize.test.js
const assert = require("node:assert/strict");
const { Chess } = require("chess.js");
const N = require("../tools/pgn-normalize.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

console.log("PGN normalisation");

test("unglues move numbers that lost their line break", () => {
  assert.equal(N.cleanMovetext("7.e5 h68.Bxf6 gxf6"), "7. e5 h6 8. Bxf6 gxf6");
  assert.equal(N.cleanMovetext("17.Qc2 Rd318.axb5"), "17. Qc2 Rd3 18. axb5");
  assert.equal(N.cleanMovetext("11.O-O O-O12.Nd5"), "11. O-O O-O 12. Nd5");
});

test("unglues a black move stuck to White's move", () => {
  assert.equal(N.cleanMovetext("7.Nf3Bd6 8.Bxd6"), "7. Nf3 Bd6 8. Bxd6");
  assert.equal(N.cleanMovetext("13.Kb1Bd7"), "13. Kb1 Bd7");
  assert.equal(N.cleanMovetext("21.Nd5 cxd5 22.Qxd5+Nf7"), "21. Nd5 cxd5 22. Qxd5+ Nf7");
});

test("leaves normal SAN alone (disambiguation, promotion, captures)", () => {
  const s = "1. Nbd7 Rfe8 2. exd5 b1=Q 3. R1e2 Nexd6";
  assert.equal(N.cleanMovetext(s), s);
});

test("strips comments, variations, NAGs, annotations and black move numbers", () => {
  assert.equal(N.cleanMovetext("1.e4 { coment 1234 } 1...c5 2.Nf3! (2.c3 d5) e6 $1 3.d4?!"), "1. e4 c5 2. Nf3 e6 3. d4");
});

test("splits games whose tags and moves run together on one line", () => {
  const src = '[Date "1949"][White "A"][Black "B"][Result "0-1"]1.f3 e5 2.g4 Qh4# 0-1[Event "X"][White "C"][Black "D"][Result "1-0"]1.e4 1-0';
  const games = N.normalize(src);
  assert.equal(games.length, 2);
  assert.equal(games[0].headers.White, "A");
  assert.equal(games[0].movetext, "1. f3 e5 2. g4 Qh4# 0-1");
  assert.equal(games[1].headers.Event, "X");
  const c = new Chess();
  assert.ok(c.load_pgn(games[0].pgn, { sloppy: true }));
  assert.ok(c.in_checkmate());
});

test("repairs a tag that lost its '[' and start of its name", () => {
  const games = N.normalize('1.e4 e5 1-0\n\nvent "Curacao"]\n[White "Tal"]\n\n1.d4 1-0');
  assert.equal(games[1].headers.Event, "Curacao");
  assert.equal(games[1].headers.White, "Tal");
});

test("parentheses inside header values are kept", () => {
  const games = N.normalize('[Event "US Ch (Men)"]\n\n1.e4 (1.d4) e5 1-0');
  assert.equal(games[0].headers.Event, "US Ch (Men)");
  assert.equal(games[0].movetext, "1. e4 e5 1-0");
});

console.log("\n" + passed + " passed");
