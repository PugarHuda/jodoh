// Prove the A2A hire leg ON-CHAIN without a second buyer agent.
//
// Jodoh directly hires the best-fit real flat-fee agent for a need, paying from
// its own wallet, and prints the pay tx hash. This exercises the exact
// facilitate() path the provider uses in production, produces a real order with a
// distinct counterparty (counts toward the >=3 unique-counterparty requirement),
// and needs only Jodoh's wallet funded with a little USDC on Base.
//
//   npm run prove-hire -- "audit my smart contract for vulnerabilities"
//
// Pick a need that maps to a fast flat-fee agent so it delivers within the poll
// window. Fund-transfer matches (swaps/payouts) are skipped automatically.
import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
import { fetchCatalog } from "../src/catalog.js";
import { matchAgents } from "../src/match.js";
import { facilitate, MAX_HIRE_USDC } from "../src/facilitate.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

const client = new AgentClient(
  {
    baseURL: required("CROO_API_URL"),
    wsURL: required("CROO_WS_URL"),
    rpcURL: process.env.BASE_RPC_URL,
  },
  required("CROO_SDK_KEY"),
);

const need =
  process.argv.slice(2).join(" ").trim() ||
  "audit my smart contract for vulnerabilities";
const budget = Number(process.env.PROVE_HIRE_BUDGET) || MAX_HIRE_USDC;

const catalog = await fetchCatalog(process.env.CROO_AGENT_ID);
const matches = matchAgents(need, catalog);
if (!matches.length) {
  console.error(`no match on the live Store for: "${need}"`);
  process.exit(1);
}

console.log(`Need:      "${need}"`);
console.log(`Top match: ${matches[0].agent.name}  (${matches[0].agent.priceFrom} USDC)`);
console.log(`Hiring the top hireable match, budget ${budget} USDC …\n`);

let hired;
for (const m of matches) {
  hired = await facilitate(client, m, need, budget);
  if (hired) break;
}

if (!hired) {
  console.error(
    "No hire completed. Likely: the top matches are fund-transfer/over-budget/offline,\n" +
      "or Jodoh's wallet is underfunded. Fund the wallet (USDC on Base) and try a need\n" +
      "that maps to a fast flat-fee agent (e.g. an audit, tracker, or report).",
  );
  process.exit(2);
}

console.log("✅ Hired another agent on-chain — real A2A order:");
console.log(`  service:  ${hired.agentId}`);
console.log(`  order:    ${hired.orderId}`);
console.log(`  pay tx:   https://basescan.org/tx/${hired.payTxHash}`);
console.log(`  rake:     ${hired.rake} USDC (quoted)`);
process.exit(0);
