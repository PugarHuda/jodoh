import assert from "node:assert/strict";
import { SEED_CATALOG } from "../src/catalog.js";
import { matchAgents } from "../src/match.js";

// Each need should surface the obviously-right agent as the #1 match.
const cases: Array<[string, string]> = [
  ["audit my smart contract for solidity vulnerabilities", "chainguard"],
  ["track a polymarket wallet pnl and positions", "polymarket-tracker"],
  ["split a usdc payment to multiple recipients on base", "remifi"],
  ["swap an erc20 token on base", "swapgod"],
  ["analyze my ad funnel conversion drop-off", "adpilot"],
];

for (const [need, expected] of cases) {
  const matches = matchAgents(need, SEED_CATALOG);
  assert.ok(matches.length > 0, `no match for: ${need}`);
  assert.equal(
    matches[0].agent.id,
    expected,
    `for "${need}" expected #1=${expected}, got ${matches[0].agent.id} (${matches[0].score}%)`,
  );
}

// Gibberish should match nothing, not force a bad recommendation.
assert.equal(matchAgents("qwerty zxcvbn asdfgh", SEED_CATALOG).length, 0, "gibberish should not match");

// Calibration: a clearly better-fit newcomer must beat a worse-fit incumbent —
// reputation must not override a meaningfully better match.
const calib = matchAgents("aardvark widget", [
  {
    id: "newcomer",
    name: "Aardvark Widget Pro",
    description: "aardvark widget specialist",
    tags: ["aardvark", "widget"],
    priceFrom: 0.1,
    completion: 0,
    orders: 0,
  },
  {
    id: "incumbent",
    name: "Popular General Agent",
    description: "handles aardvark tasks and much more",
    tags: ["aardvark"],
    priceFrom: 0.1,
    completion: 100,
    orders: 9000,
  },
]);
assert.equal(calib[0].agent.id, "newcomer", "better-fit newcomer must outrank worse-fit incumbent");

// A malformed external record (NaN completion/orders) must not poison the shared
// `max` and NaN every score — one bad API row can't break the whole ranking.
const poisoned = matchAgents("aardvark widget", [
  {
    id: "bad",
    name: "Bad Data Widget",
    description: "aardvark widget",
    tags: ["aardvark", "widget"],
    priceFrom: 0.1,
    completion: Number("N/A"), // NaN
    orders: Number("oops"), // NaN, and >=10 branch would use it
  },
  {
    id: "good",
    name: "Good Widget",
    description: "aardvark widget specialist",
    tags: ["aardvark", "widget"],
    priceFrom: 0.1,
    completion: 100,
    orders: 5000,
  },
]);
assert.ok(poisoned.length > 0, "malformed record must not wipe out all matches");
assert.ok(
  poisoned.every((m) => Number.isFinite(m.score)),
  "every score must be finite despite a NaN-bearing record",
);
assert.equal(poisoned[0].agent.id, "good", "the valid, proven agent still wins");

console.log(
  `PASS  ${cases.length} needs matched to the correct top agent; gibberish rejected; calibration holds; NaN-record can't poison ranking.`,
);
