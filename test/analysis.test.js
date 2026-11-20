// Run: node test/analysis.test.js
const assert = require("node:assert/strict");
const { Chess } = require("chess.js");
const A = require("../analysis.js");
const GAMES = require("../games.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

function analyze(pgn) {
  const c = new Chess();
  assert.ok(c.load_pgn(pgn));
  const moves = c.history({ verbose: true });
  const r = new Chess();
  const fens = [r.fen()];
  for (const m of moves) { r.move(m); fens.push(r.fen()); }
  return { moves, ...A.analyzeGame(moves, fens, c.header().Result || "*", Chess) };
}
const immortal = analyze(GAMES.find((g) => g.id === "immortal").pgn);
const karpov = analyze(GAMES.find((g) => g.id === "karpov-unzicker").pgn);

console.log("Material");
test("start position is 39 each", () => assert.deepEqual(
  (({ w, b }) => ({ w, b }))(A.countMaterial(new Chess().fen())), { w: 39, b: 39 }));
test("one frame per move", () => assert.equal(immortal.frames.length, immortal.moves.length));
test("Immortal: 2...exf4 puts Black a pawn up", () => assert.equal(immortal.frames[3].balance, -1));
test("Immortal: White finishes far behind on material but mates", () => {
  assert.ok(immortal.frames.at(-1).balance <= -15);
  assert.equal(immortal.moves.at(-1).san, "Be7#");
});

console.log("Phase & tension");
test("phases only move forward", () => {
  const order = { opening: 0, middlegame: 1, endgame: 2 };
  for (const g of [immortal, karpov]) {
    for (let i = 1; i < g.frames.length; i++) assert.ok(order[g.frames[i].phase] >= order[g.frames[i - 1].phase]);
  }
});
test("both games start in the opening and reach the middlegame by ply 20", () => {
  for (const g of [immortal, karpov]) {
    assert.equal(g.frames[0].phase, "opening");
    assert.equal(g.frames[19].phase, "middlegame");
  }
});
test("endgame detected once queens are off", () => {
  const g = analyze("1. d4 e5 2. dxe5 d6 3. exd6 Qxd6 4. Qxd6 Bxd6");
  assert.notEqual(g.frames.at(-2).phase, "endgame"); // Black's queen is still on after 4.Qxd6
  assert.equal(g.frames.at(-1).phase, "endgame");
});
test("tension stays in 0..1", () => {
  for (const g of [immortal, karpov]) for (const f of g.frames) assert.ok(f.tension >= 0 && f.tension <= 1);
});
test("Immortal peaks in the middlegame and is more tense on average", () => {
  assert.equal(immortal.frames[immortal.summary.peak.ply - 1].phase, "middlegame");
  assert.ok(immortal.summary.avgTension > karpov.summary.avgTension);
});

console.log("Profile & auto identity");
test("Immortal is tactical -> minor, fast", () => {
  assert.equal(immortal.summary.profile, "tactical");
  assert.equal(immortal.auto.mode, "minor");
  assert.equal(immortal.auto.bpm, 140);
});
test("Karpov-Unzicker is positional -> major, slow", () => {
  assert.equal(karpov.summary.profile, "positional");
  assert.equal(karpov.auto.mode, "major");
  assert.ok(karpov.auto.bpm < immortal.auto.bpm);
});
test("auto key is deterministic and differs between these openings", () => {
  assert.deepEqual(analyze(GAMES[0].pgn).auto, immortal.auto);
  assert.notEqual(immortal.auto.root, karpov.auto.root);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
