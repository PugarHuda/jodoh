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
    id: "bad2",
    name: "Bad Data Widget Two",
    description: "aardvark widget",
    tags: ["aardvark", "widget"],
    priceFrom: 0.1,
    completion: Number("N/A"), // NaN — AND orders>=10, so repFactor's completion branch USES it
    orders: 5000,
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

// Hyphen normalization: a spaced query must hit a hyphenated tag.
const hyph = matchAgents("smart contract audit", [
  { id: "hc", name: "Auditor", description: "smart contract auditing service", tags: ["smart-contract", "audit"], priceFrom: 0.1, completion: 100, orders: 50 },
]);
assert.equal(hyph[0]?.agent.id, "hc", "'smart contract' must match the 'smart-contract' tag after hyphen split");

// Anti-stuffing: a tag with no name/description support earns only text weight, so
// an unproven keyword-stuffer can't outrank a genuinely-described specialist.
const stuff = matchAgents("smart contract security audit for my solidity defi protocol", [
  {
    id: "stuffer",
    name: "FreeAudit",
    description: "cheap and fast", // description does NOT back the tags
    tags: ["smart", "contract", "security", "audit", "solidity", "defi", "protocol"],
    priceFrom: 0.1,
    completion: 0,
    orders: 0,
  },
  {
    id: "specialist",
    name: "ChainGuard",
    description: "smart contract security audit for solidity defi protocols",
    tags: ["smart", "contract", "security", "audit"],
    priceFrom: 0.1,
    completion: 100,
    orders: 50,
  },
]);
assert.equal(stuff[0].agent.id, "specialist", "text-supported specialist must beat an unsupported tag-stuffer");

// Reputation floor (the orders<10 "unproven cliff"): a proven agent must beat a
// marginally-better-fit UNPROVEN one — otherwise a brand-new agent claiming 100%
// completion could out-rank a battle-tested one. Pins the cliff so it can't be
// silently removed.
const cliff = matchAgents("aardvark beaver cat", [
  { id: "unproven", name: "New", description: "aardvark beaver cat specialist", tags: ["aardvark", "beaver", "cat"], priceFrom: 0.1, completion: 100, orders: 2 },
  { id: "proven", name: "Veteran", description: "aardvark beaver expert", tags: ["aardvark", "beaver"], priceFrom: 0.1, completion: 100, orders: 8000 },
]);
assert.equal(cliff[0].agent.id, "proven", "a proven agent must beat a marginally-better-fit unproven one (reputation floor)");

// Supported-tag 2x weighting, isolated from reputation: with EQUAL reputation, a
// text-supported specialist must beat a raw tag-stuffer. (The stuffer is listed
// FIRST so that if the 2x weight were dropped the two would tie and the stable
// sort would surface the stuffer — this pins the weighting, not just the ordering.)
const weight = matchAgents("alpha bravo charlie delta", [
  { id: "stuffer", name: "X", description: "unrelated filler", tags: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"], priceFrom: 0.1, completion: 100, orders: 50 },
  { id: "supported", name: "Alpha Bravo Charlie Delta Service", description: "alpha bravo charlie delta", tags: ["alpha", "bravo", "charlie", "delta"], priceFrom: 0.1, completion: 100, orders: 50 },
]);
assert.equal(weight[0].agent.id, "supported", "with equal reputation, text-supported tags (weighted 2x) must beat a raw tag-stuffer");

// topN: a broad need matching several agents must return multiple ranked matches,
// not collapse to a single recommendation.
assert.ok(matchAgents("data", SEED_CATALOG).length > 1, "a broad need must return multiple ranked matches (topN)");

// length>1 keeps short domain terms alive (they no longer tokenize to nothing).
assert.ok(matchAgents("ai ml tooling", [
  { id: "x", name: "AI ML Toolkit", description: "ai and ml tools", tags: ["ai", "ml"], priceFrom: 0.1, completion: 100, orders: 10 },
]).length === 1, "2-char terms ai/ml must still match");

console.log(
  `PASS  ${cases.length} needs -> correct top agent; gibberish rejected; calibration holds; NaN-safe; hyphen-normalized; stuffer can't beat a supported specialist.`,
);
