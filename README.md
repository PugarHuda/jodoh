<p align="center"><img src="assets/logo.svg" alt="Jodoh" width="440"></p>

# 💘 Jodoh

**The matchmaker for the agent economy.** Describe what you need in plain
English — Jodoh finds the best-fit agent on the [CROO Agent Store](https://agent.croo.network),
ranked by real reputation, and can **hire it for you**, taking a small rake.

754 agents are live on the Store and the number is climbing. Discovery is the
bottleneck: a buyer (human *or* agent) can't tell which provider actually fits,
or which is trustworthy. Jodoh is the connective tissue — it doesn't just answer,
it **creates the transaction** between two agents.

> _"jodoh"_ — Indonesian for the one you're meant to be matched with.

---

## Why it fits the CROO Agent Hackathon

- **A2A composability, by construction** — when you ask Jodoh to facilitate, it
  *hires the matched agent* over CAP. Jodoh is a real buyer of other agents, so
  every match can spawn a genuine on-chain order between distinct counterparties.
- **Real CAP integration** — provider agent: accepts negotiations, gets paid into
  escrow, delivers on-chain, settles in USDC on Base (chain id 8453).
- **Not the Navigator** — CROO Navigator turns intent into orders. Jodoh adds
  **reputation-weighted ranking** (completion % + order volume, not just text),
  a **two-sided** framing (agents can list what they *need*), and **facilitation
  with a rake**. It competes on match quality and on closing the deal.

---

## How it works

```
Buyer/agent ──negotiate ("need": "...")──►  Jodoh
            ──pay (USDC → escrow, Base)───►
                 match need vs live Store catalog (reputation-weighted)
                 if "facilitate": hire the #1 match over CAP  ◄─── A2A order
            ◄──deliver { ranked matches (+ hired result) }──► Clear → settle
```

### Matching (`src/match.ts`)

Deterministic and reproducible: **fit** = keyword/tag overlap between the need
and each agent's name/description/tags (tags weighted 2×), then multiplied by a
**reputation factor** derived from completion rate and order volume (capped so a
mega-agent can't swamp a genuinely better match). Same inputs → same ranking, so
a result holds up under a human spot-check. No LLM required to run or grade it.

---

## Quick start

Requires Node.js 18+.

```bash
npm install
cp .env.example .env      # fill in your CROO SDK key + service id after Register Agent

# 1) Engine self-check (no network, no SDK needed)
npm test
#   → PASS  5 needs matched to the correct top agent; gibberish rejected.

# 2) Match a need locally (for testing / the demo video)
npm run match -- "I need to audit a smart contract for vulnerabilities"
npm run match -- "split a usdc payment to my team on base"

# 3) Go live on CAP: accept orders, match, optionally hire, deliver on-chain
npm start
```

Order payload: `{ "need": "plain english", "facilitate": true }`. With
`facilitate` set, Jodoh hires the #1 match and returns its result plus the match
report; without it, Jodoh returns recommendations only.

---

## CAP / SDK integration notes

Package: **`@croo-network/sdk`**. All wiring is in `src/agent.ts` and
`src/facilitate.ts`; the matching engine is SDK-independent and unit-tested.

**SDK surface used**

| Symbol | Where | Purpose |
|---|---|---|
| `new AgentClient(config, sdkKey)` | init | provider client (`CROO_API_URL`, `CROO_WS_URL`, `CROO_SDK_KEY`) |
| `EventType.NegotiationCreated` | subscribe | incoming hire request |
| `EventType.OrderPaid` | subscribe | escrow funded → run the match |
| `acceptNegotiation(id)` / `rejectNegotiation(id, reason)` | handler | agree / decline |
| `deliverOrder(orderId, { deliverable_text, deliverable_json })` | handler | submit the match report; Clear settles USDC |
| `negotiateOrder(agentId, input)` · `payOrder(orderId)` · `getDelivery(orderId)` | facilitate | **hire the matched agent** (this is the A2A leg) |

**Chain / settlement:** USDC on **Base mainnet (8453)**, escrow via CAPVault, gas
sponsored by the CROO Paymaster.

**`TODO(sdk)` markers** flag what to confirm against the live SDK: how the event
stream is obtained, the order/negotiation payload field names, the Store catalog
endpoint (`src/catalog.ts` falls back to a seeded snapshot until confirmed), and
the downstream negotiate/pay/getDelivery field shapes. The matcher runs today.

---

## Project layout

```
src/catalog.ts   live Store catalog fetch + seeded snapshot fallback
src/match.ts     reputation-weighted matching (deterministic)
src/report.ts    markdown match report
src/facilitate.ts  hire the #1 match over CAP (the A2A wedge)
src/cli.ts       local matcher (npm run match)
src/agent.ts     CAP provider (accept → match → hire → deliver)
test/match.test.ts  self-check: needs map to the right agent
```

## License

MIT.
