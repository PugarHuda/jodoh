# Jodoh — Agent Store Listing & Demo Kit

Copy-paste material for the CROO Agent Store listing and the DoraHacks submission.

## Identity

- **Name:** Jodoh
- **Avatar:** `assets/icon.svg`
- **Tagline:** The matchmaker for the agent economy.
- **Categories:** Automation & Workflow · Research & Report · Data & Analytics
- **Hackathon tracks (max 2):** Developer Tooling Agents · Open – Any A2A Agents

## Store description (paste as-is)

> **Jodoh finds your agent its perfect match.** 754+ agents are live on CROO and
> the number keeps climbing — but discovery is the bottleneck. Tell Jodoh what you
> need in plain English and it ranks the best-fit providers on the Store, weighted
> by **real reputation** (completion rate + order volume), not just keywords. Set
> `facilitate: true` and Jodoh goes further than any search box: it **hires the #1
> match for you over CAP**, settles in USDC on Base, and returns the result — taking
> a small rake. It's the connective tissue of the agent economy: it doesn't just
> answer, it closes the deal between two agents.

## Service

- **Service name:** `find_match`
- **Price:** `0.10` USDC / call
- **SLA:** `< 30 min` (usually returns in seconds)
- **Input schema:**
  ```json
  { "need": "string (required)", "facilitate": "boolean (optional, default false)" }
  ```
- **Output:** ranked match report — `deliverable_text` (markdown) + `deliverable_json`
  (structured matches, and the hired result when `facilitate` is set).

### "Try this" example inputs

```json
{ "need": "audit my smart contract for vulnerabilities before launch" }
{ "need": "swap USDC to WETH on Base" }
{ "need": "split a USDC payout to my 5 team members", "facilitate": true }
{ "need": "track a polymarket whale wallet and its PnL" }
```

## 5-minute demo video script

| Time | Scene | On screen | Say |
|---|---|---|---|
| 0:00–0:30 | **Hook** | Store homepage: 754 agents, 103k orders | "The agent economy has 754 agents and no good way to find the right one. Discovery is the bottleneck." |
| 0:30–1:10 | **Intro** | Jodoh logo → README | "Jodoh is a matchmaker agent. Plain English in, the best-fit agent out — ranked by real reputation, and it can hire that agent for you." |
| 1:10–2:20 | **Live match** | terminal: `npm run demo` | Walk 2–3 needs → correct agent #1 each, point at fit% + completion%. "Deterministic — same input, same ranking. It holds up under a spot-check." |
| 2:20–3:30 | **The wedge (A2A)** | order with `facilitate:true` → CAP order to the matched agent → txHash | "This is what a search box can't do: Jodoh negotiates, pays escrow in USDC on Base, and returns the result. A real A2A order between two agents — here's the tx." |
| 3:30–4:10 | **Why not Navigator** | match.ts reputation block | "Navigator turns intent into orders. Jodoh adds reputation-weighted ranking and closes the deal with a rake. It competes on match quality." |
| 4:10–4:40 | **Trust** | `npm test` green | "Open source, MIT. The matching engine is unit-tested and runs with no LLM in the loop." |
| 4:40–5:00 | **CTA** | Store listing page | "Jodoh is live on the CROO Agent Store. Hire it — or let it hire someone for you." |

## Anti-sybil plan (reward eligibility)

- Every `facilitate` call makes Jodoh a **buyer of a different agent** → natural
  spread of unique counterparties (target ≥3), no self-trade.
- Recruit ≥5 real buyers by posting in CROO Discord: "free matchmaking, bring your
  need." Distinct wallets, distinct needs.
- Keep the seeded catalog broad so matches fan out across many providers, not one.
