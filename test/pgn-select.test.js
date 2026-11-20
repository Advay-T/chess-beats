// Run: node test/pgn-select.test.js
const assert = require("node:assert/strict");
const S = require("../tools/pgn-select.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

console.log("Game selection");

test("keeps classical events, drops speed / online / exhibition ones", () => {
  ["WCh 2021", "AVRO", "Corus A", "Havana m", "83rd Tata Steel Masters", "Nottingham", "44th Olympiad 2022"]
    .forEach((e) => assert.ok(S.isClassical(e), e));
  ["World Blitz", "chess.com SpeedChess 2023", "Bullet Chess Winners 2023", "Chess24 Banter Blitz Cup",
    "Legends of Chess Prelim", "Airthings Masters Div 1 W", "Kosmos m 5'", "PCA/Intel-GP", "Carlsen vs. Challengers",
    "Melody Amber Blindfold", "Clutch Chess Showdown Int", "Simul, 30b"]
    .forEach((e) => assert.ok(!S.isClassical(e), e));
});

test("scores wins above draws and big events above small ones", () => {
  const win = S.baseScore({ Result: "1-0", Event: "Some Open" }, "w");
  const loss = S.baseScore({ Result: "1-0", Event: "Some Open" }, "b");
  const draw = S.baseScore({ Result: "1/2-1/2", Event: "Some Open" }, "w");
  const majorWin = S.baseScore({ Result: "0-1", Event: "WCh 1972" }, "b");
  assert.ok(majorWin > win && win > loss && loss > draw);
});

test("finds the collection player's side", () => {
  assert.equal(S.playerSide({ White: "Capablanca, Jose Raul", Black: "Lasker, Emanuel" }, /Capablanca/), "w");
  assert.equal(S.playerSide({ White: "Lasker, Emanuel", Black: "Capablanca, Jose Raul" }, /Capablanca/), "b");
  assert.equal(S.playerSide({ White: "A", Black: "B" }, /Capablanca/), null);
});

test("the same game from two players' files gets the same key", () => {
  const a = S.gameKey("1. e4 e5 2. Nf3 Nc6 1-0", { Date: "1921.03.15" });
  const b = S.gameKey("1.e4 e5 2.Nf3 Nc6 1-0", { Date: "1921.??.??" });
  const c = S.gameKey("1. d4 d5 1-0", { Date: "1921.03.15" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("spreads picks across the career and is reproducible", () => {
  // 100 strong games in 1990, 10 weaker ones in each other decade.
  const items = [];
  for (let i = 0; i < 100; i++) items.push({ year: 1990, score: 5, tie: i });
  for (const y of [1950, 1960, 1970, 1980]) for (let i = 0; i < 10; i++) items.push({ year: y, score: 1, tie: 1000 + y + i });
  const pick = S.spreadPick(items, 14);
  assert.equal(pick.length, 14);
  const decades = new Set(pick.map((x) => x.year));
  assert.ok(decades.size >= 4, "only " + [...decades].join(","));
  assert.deepEqual(S.spreadPick(items, 14), pick);
});

test("caps games against one opponent, except title-match games", () => {
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ year: 1863, score: 9, tie: i, opponent: "deacon" });
  for (let i = 0; i < 10; i++) items.push({ year: 1886, score: 8, tie: 100 + i, opponent: "zukertort", titleMatch: true });
  for (let i = 0; i < 10; i++) items.push({ year: 1870, score: 1, tie: 200 + i, opponent: "other" + i });
  const pick = S.spreadPick(items, 12, 5, 3);
  assert.equal(pick.length, 12);
  assert.equal(pick.filter((x) => x.opponent === "deacon").length, 3);
  assert.ok(pick.filter((x) => x.opponent === "zukertort").length > 3, "title match was capped");
});

test("minor matches don't count as major events; title matches do", () => {
  assert.ok(!S.isMajor("London m-B6263"));
  assert.ok(S.isMajor("World Championship 13th") && S.isTitleMatch("World Championship 13th"));
  assert.ok(S.isTitleMatch("WCh 2024") && !S.isTitleMatch("Linares"));
});

test("returns everything when there are fewer items than requested", () => {
  assert.equal(S.spreadPick([{ year: 2000, score: 1, tie: 1 }], 5).length, 1);
});

console.log("\n" + passed + " passed");
