// Live matchmaking demo — runs several plain-English needs against the live
// CROO Store catalog. Great for the screen-recorded demo video.  Run: npm run demo
import { fetchCatalog } from "./catalog.js";
import { matchAgents } from "./match.js";

const NEEDS = [
  "audit my smart contract for vulnerabilities before launch",
  "swap USDC to WETH on Base",
  "split a USDC payout to my 5 team members",
  "track a polymarket whale wallet and its PnL",
  "analyze my ad funnel and find the drop-off",
  "check the bitcoin fear and greed sentiment today",
];

const catalog = await fetchCatalog();
console.log(`💘 JODOH — live matchmaking over ${catalog.length} CROO Store services\n`);

for (const need of NEEDS) {
  const [top, second] = matchAgents(need, catalog, 2);
  console.log(`🔎  "${need}"`);
  if (!top) {
    console.log("    → no compatible agent found\n");
    continue;
  }
  console.log(
    `    🥇 ${top.agent.name}  —  ${top.score}% fit · ${top.agent.completion}% completion · from ${top.agent.priceFrom} USDC`,
  );
  if (second) console.log(`    🥈 ${second.agent.name}  —  ${second.score}% fit`);
  console.log();
}

console.log('→ add "facilitate": true and Jodoh hires the #1 match for you (A2A, on-chain).');
