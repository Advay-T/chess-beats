// Run: node test/arrangement.test.js
const assert = require("node:assert/strict");
const R = require("../arrangement.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

const MAJOR = { root: "C", mode: "major" };
const MINOR = { root: "A", mode: "minor" };
const frame = (o) => ({ balance: 0, swing: 0, tension: 0, phase: "middlegame", ...o });

console.log("Harmony");
test("balanced -> sus2", () => assert.equal(R.chordFor(frame({}), MAJOR).name, "I sus2"));
test("White ahead -> I major / III major", () => {
  assert.equal(R.chordFor(frame({ balance: 3 }), MAJOR).name, "I major");
  assert.equal(R.chordFor(frame({ balance: 3 }), MINOR).name, "III major");
});
test("Black ahead -> vi minor / i minor", () => {
  assert.equal(R.chordFor(frame({ balance: -5 }), MAJOR).name, "vi minor");
  assert.equal(R.chordFor(frame({ balance: -5 }), MINOR).name, "i minor");
});
test("a big swing overrides who is ahead", () =>
  assert.equal(R.chordFor(frame({ balance: 5, swing: 5 }), MAJOR).name, "IV add9"));
test("pad notes sit on the key root (C3 = 48 for I major in C)", () =>
  assert.deepEqual(R.bedFor(frame({ balance: 3 }), MAJOR, 1).pad.map((n) => n.midi), [48, 52, 55]));

console.log("Groove");
test("level rises with tension", () => {
  const levels = [0, 0.4, 0.6, 0.9].map((t) => R.bedFor(frame({ tension: t }), MAJOR, 1).level);
  assert.deepEqual(levels, [0, 1, 2, 3]);
});
test("more tension -> more hits", () => {
  const hits = [0, 0.4, 0.6, 0.9].map((t) => R.bedFor(frame({ tension: t }), MAJOR, 1).groove.length);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] > hits[i - 1], hits.join(","));
});
test("level 2+ adds kick and bass on the chord root", () => {
  const b = R.bedFor(frame({ tension: 0.6, balance: -4 }), MAJOR, 1);
  assert.ok(b.groove.some((h) => h.type === "kick"));
  assert.equal(b.bass.midi % 12, 9); // vi chord root in C = A
});
test("opening and endgame cap the groove at 1", () => {
  assert.equal(R.bedFor(frame({ tension: 1, phase: "opening" }), MAJOR, 1).level, 1);
  assert.equal(R.bedFor(frame({ tension: 1, phase: "endgame" }), MAJOR, 1).level, 1);
});
test("hits stay inside the move's length", () => {
  for (const len of [1, 1.5, 4]) {
    for (const h of R.bedFor(frame({ tension: 1 }), MAJOR, len).groove) assert.ok(h.time < len);
  }
});

console.log("Phase & layer toggles");
test("endgame is slower and wetter", () => {
  const e = R.bedFor(frame({ phase: "endgame" }), MAJOR, 1);
  const m = R.bedFor(frame({}), MAJOR, 1);
  assert.ok(e.tempoMul < 1 && e.fx.reverb > m.fx.reverb && e.fx.delay > 0);
});
test("turning layers off removes them", () => {
  const b = R.bedFor(frame({ tension: 1, phase: "endgame", balance: 4 }), MAJOR, 1, { harmony: false, groove: false, phase: false });
  assert.equal(b.chord, null);
  assert.deepEqual(b.pad, []);
  assert.deepEqual(b.groove, []);
  assert.equal(b.tempoMul, 1);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
