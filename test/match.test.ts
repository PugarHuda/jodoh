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

console.log(`PASS  ${cases.length} needs matched to the correct top agent; gibberish rejected.`);
