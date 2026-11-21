// Run: node test/chesscom.test.js
const assert = require("node:assert/strict");
const C = require("../chesscom.js");

let passed = 0;
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { passed++; console.log("  ok  " + name); },
    (e) => { console.error("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
  ));
}

// A fake chess.com: months maps an archive URL to its games; calls records every URL asked for.
function fakeApi(months, extra = {}) {
  const calls = [];
  const base = "https://api.chess.com/pub/player/";
  const fetch = async (url) => {
    calls.push(url);
    if (extra[url]) return extra[url](calls);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url === base + "alice/games/archives") return json({ archives: Object.keys(months) });
    if (months[url]) return json({ games: months[url] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}
const month = (m) => "https://api.chess.com/pub/player/alice/games/2026/" + m;
let t = 0;
const game = (o = {}) => ({ rules: "chess", time_class: "blitz", pgn: "1. e4 *", end_time: ++t, white: { username: "Alice", result: "win" }, black: { username: "bob", result: "resigned" }, ...o });

console.log("chess.com fetch");

test("keeps standard games with a PGN, newest first", async () => {
  const a = game(), b = game({ rules: "chess960" }), c = game({ pgn: undefined }), d = game({ rules: "crazyhouse" }), e = game();
  const { fetch } = fakeApi({ [month("10")]: [a, b, c], [month("11")]: [d, e] });
  const got = await C.recentGames("ALICE", { fetch });
  assert.deepEqual(got, [e, a]);
});

test("walks months newest first and stops once it has enough", async () => {
  const many = Array.from({ length: 30 }, () => game());
  const { fetch, calls } = fakeApi({ [month("09")]: [game()], [month("10")]: [game()], [month("11")]: many });
  const got = await C.recentGames("alice", { fetch });
  assert.equal(got.length, 25);
  assert.ok(!calls.includes(month("10")) && !calls.includes(month("09")), "older months weren't needed");
  assert.equal(got[0].end_time, many[29].end_time);
});

test("filters by time class", async () => {
  const r = game({ time_class: "rapid" });
  const { fetch } = fakeApi({ [month("11")]: [game(), r, game({ time_class: "bullet" })] });
  assert.deepEqual(await C.recentGames("alice", { fetch, timeClass: "rapid" }), [r]);
});

test("returns what exists when there are fewer than 25", async () => {
  const { fetch } = fakeApi({ [month("10")]: [game()], [month("11")]: [game(), game()] });
  assert.equal((await C.recentGames("alice", { fetch })).length, 3);
});

test("unknown player: not-found; no months: no-archives; bad name: bad-name", async () => {
  const { fetch } = fakeApi({});
  await assert.rejects(C.recentGames("nobody", { fetch }), { code: "not-found" });
  await assert.rejects(C.recentGames("alice", { fetch }), { code: "no-archives" });
  await assert.rejects(C.recentGames("not a name!", { fetch }), { code: "bad-name" });
});

test("a 429 waits and retries once; a second 429 gives up", async () => {
  const ok = game();
  let hits = 0;
  const flaky = { [month("11")]: () => (++hits === 1 ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => ({ games: [ok] }) }) };
  const { fetch } = fakeApi({ [month("11")]: [] }, flaky);
  assert.deepEqual(await C.recentGames("alice", { fetch, retryMs: 1 }), [ok]);
  assert.equal(hits, 2);
  const always = fakeApi({ [month("11")]: [] }, { [month("11")]: () => ({ ok: false, status: 429 }) });
  await assert.rejects(C.recentGames("alice", { fetch: always.fetch, retryMs: 1 }), { code: "rate-limited" });
});

test("a failed request is a network error", async () => {
  await assert.rejects(C.recentGames("alice", { fetch: async () => { throw new TypeError("offline"); } }), { code: "network" });
});

test("outcome is read from the player's side", () => {
  const g = game();
  assert.equal(C.outcome(g, "alice"), "win");
  assert.equal(C.outcome(g, "BOB"), "loss");
  assert.equal(C.outcome(game({ white: { username: "alice", result: "agreed" }, black: { username: "bob", result: "agreed" } }), "alice"), "draw");
  assert.equal(C.outcome(game({ white: { username: "bob", result: "win" }, black: { username: "alice", result: "timeout" } }), "alice"), "loss");
  assert.equal(C.outcome(game({ white: { username: "bob", result: "stalemate" }, black: { username: "alice", result: "stalemate" } }), "alice"), "draw");
});

Promise.all(pending).then(() => console.log("\n" + passed + " passed"));
