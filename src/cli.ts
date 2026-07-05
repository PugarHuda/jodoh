// Local matcher: rank Store agents against a need, no CAP required.
// Use it to test and to record the demo video.
//   npm run match -- "I need to audit a smart contract for vulnerabilities"
import { SEED_CATALOG } from "./catalog.js";
import { matchAgents } from "./match.js";
import { renderMarkdown } from "./report.js";

const need = process.argv.slice(2).join(" ").trim();
if (!need) {
  console.error('usage: npm run match -- "your need in plain english"');
  process.exit(2);
}

const matches = matchAgents(need, SEED_CATALOG);
console.log(renderMarkdown({ need, matches }));
process.exit(matches.length ? 0 : 1);
