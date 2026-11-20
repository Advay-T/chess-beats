// Run: npm test   (or: node test/music.test.js)
const assert = require("node:assert/strict");
const { Chess } = require("chess.js");
const M = require("../music.js");
const GAMES = require("../games.js");

const C_MAJOR = { root: "C", mode: "major" };
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

function movesOf(pgn) {
  const c = new Chess();
  assert.ok(c.load_pgn(pgn), "PGN should load");
  return c.history({ verbose: true });
}
function eventFor(sanSeq, key = C_MAJOR) {
  const c = new Chess();
  let mv;
  for (const san of sanSeq) mv = c.move(san);
  return M.moveToEvent(mv, key);
}

console.log("Square -> pitch");
test("a1 is the tonic in octave 2 (C2)", () => assert.equal(M.midiToName(M.stepToMidi(M.squareToStep("a1"), C_MAJOR)), "C2"));
test("e4 is the 5th scale degree in octave 3 (A3)", () => assert.equal(M.midiToName(M.stepToMidi(M.squareToStep("e4"), C_MAJOR)), "A3"));
test("f-file wraps to the tonic an octave up (f4 = C4)", () => assert.equal(M.midiToName(M.stepToMidi(M.squareToStep("f4"), C_MAJOR)), "C4"));
test("h8 is the highest note (E6)", () => assert.equal(M.midiToName(M.stepToMidi(M.squareToStep("h8"), C_MAJOR)), "E6"));
test("pitch never decreases moving along a rank", () => {
  for (let r = 1; r <= 8; r++) {
    const ms = "abcdefgh".split("").map((f) => M.stepToMidi(M.squareToStep(f + r), C_MAJOR));
    for (let i = 1; i < 8; i++) assert.ok(ms[i] > ms[i - 1], `rank ${r} file ${i}`);
  }
});
test("key changes the pitch (e4 in A minor = G4)", () =>
  assert.equal(M.midiToName(M.stepToMidi(M.squareToStep("e4"), { root: "A", mode: "minor" })), "G4"));

console.log("Move -> event");
test("pawn move: short, soft, white voice", () => {
  const ev = eventFor(["e4"]);
  assert.equal(ev.voice, "white");
  assert.equal(ev.notes.length, 1);
  assert.equal(ev.notes[0].dur, 0.25);
  assert.equal(ev.notes[0].vel, 0.35);
  assert.deepEqual(ev.drums, []);
});
test("black uses the black voice", () => assert.equal(eventFor(["e4", "e5"]).voice, "black"));
test("queen move: long and loud", () => {
  const ev = eventFor(["e4", "e5", "Qh5"]);
  assert.equal(ev.notes[0].dur, 2);
  assert.ok(ev.notes[0].vel >= 0.9);
});
test("capture: accent + snare", () => {
  const ev = eventFor(["e4", "d5", "exd5"]);
  assert.ok(ev.notes[0].vel > M.PIECES.p.vel);
  assert.ok(ev.drums.some((d) => d.type === "snare"));
});
test("check: cymbal", () => {
  const ev = eventFor(["e4", "f6", "Qh5+"]);
  assert.ok(ev.drums.some((d) => d.type === "cymbal"));
  assert.ok(ev.tags.includes("check"));
});
test("castling: 3-note chord", () => {
  const ev = eventFor(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]);
  assert.equal(ev.notes.length, 3);
  assert.ok(ev.notes.every((n) => n.time === 0));
});
test("promotion: rising run ending on the target note", () => {
  const c = new Chess("8/P7/8/8/8/8/8/k6K w - - 0 1");
  const ev = M.moveToEvent(c.move("a8=Q"), C_MAJOR);
  const pitches = ev.notes.map((n) => n.midi);
  for (let i = 1; i < pitches.length; i++) assert.ok(pitches[i] > pitches[i - 1], "run must rise");
  assert.equal(pitches.at(-1), M.stepToMidi(M.squareToStep("a8"), C_MAJOR));
});
test("checkmate: final big hit (kick + cymbal, long)", () => {
  const ev = eventFor(["f3", "e5", "g4", "Qh4#"]);
  assert.ok(ev.tags.includes("CHECKMATE"));
  assert.ok(ev.drums.some((d) => d.type === "kick"));
  assert.ok(ev.notes.length >= 6);
  assert.ok(ev.length >= 4);
});

console.log("Built-in games");
for (const g of GAMES) {
  test(`${g.id}: every move maps to a valid event`, () => {
    for (const mv of movesOf(g.pgn)) {
      const ev = M.moveToEvent(mv, C_MAJOR);
      assert.ok(ev.notes.length > 0);
      for (const n of ev.notes) assert.ok(n.midi >= 24 && n.midi <= 96 && n.vel > 0 && n.vel <= 1, mv.san);
    }
  });
}
test("Immortal Game ends in checkmate", () => {
  const last = movesOf(GAMES[0].pgn).at(-1);
  assert.equal(last.san, "Be7#");
  assert.ok(M.moveToEvent(last, C_MAJOR).tags.includes("CHECKMATE"));
});
test("Karpov-Unzicker ends without mate (resignation)", () => {
  const last = movesOf(GAMES[1].pgn).at(-1);
  assert.equal(last.san, "Nh5");
  assert.ok(!M.moveToEvent(last, C_MAJOR).tags.includes("CHECKMATE"));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
