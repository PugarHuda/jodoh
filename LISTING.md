# Jodoh — Agent Store Listing & Demo Kit

Copy-paste material for the CROO Agent Store listing and the DoraHacks submission.

## Identity

- **Name:** Jodoh
- **Avatar:** `assets/icon.svg`
- **Tagline:** The matchmaker for the agent economy.
- **Categories:** Automation & Workflow · Research & Report · Data & Analytics
- **Hackathon tracks (max 2):** Developer Tooling Agents · Open – Any A2A Agents

## Store description (paste as-is)

> **Jodoh finds your agent its perfect match.** Hundreds of services are live on CROO and
> the number keeps climbing — but discovery is the bottleneck. Tell Jodoh what you
> need in plain English and it ranks the best-fit providers on the Store, weighted
> by **real reputation** (completion rate + order volume), not just keywords. Set
> `facilitate: true` and Jodoh goes further than any search box: it **hires the #1
> match for you over CAP**, settles in USDC on Base, and returns the result **with
> the on-chain tx hash** — on a facilitation-fee model. It's the connective tissue
> of the agent economy: it doesn't just answer, it closes the deal between two agents.

## Services

Two services, one engine — split so pricing reflects the work:

**1. `find_match`** — discovery. `0.10` USDC, SLA `< 30 min`.
- **Input:** `{ "need": "string (required)", "facilitate": "boolean (optional, default false)" }`
- **Output:** ranked match report — `deliverable_text` (markdown, with an embedded
  machine-readable JSON block); hires the top match when `facilitate: true`.

**2. `hire_match`** — premium. `0.25` USDC, SLA `< 30 min`. Ordering it **is** the
hire: Jodoh matches your need and hires the #1 match over CAP, no flag needed
(the higher price covers the facilitation work; Jodoh fronts flat-fee sub-orders
within `MAX_HIRE_USDC`).
- **Input:** `{ "need": "string (required)" }`
- **Output:** the match report **plus** the hired agent's result and the on-chain pay tx hash.

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
| 0:00–0:30 | **Hook** | Store homepage: ~150 agents, 380+ services | "The agent economy has 380+ services and no good way to find the right one. Discovery is the bottleneck." |
| 0:30–1:10 | **Intro** | Jodoh logo → README | "Jodoh is a matchmaker agent. Plain English in, the best-fit agent out — ranked by real reputation, and it can hire that agent for you." |
| 1:10–2:20 | **Live match** | terminal: `npm run demo` | Walk 2–3 needs → correct agent #1 each, point at fit% + completion%. "Deterministic — same input, same ranking. It holds up under a spot-check." |
| 2:20–3:30 | **The wedge (A2A)** | terminal 1: `npm start` (Jodoh live) · terminal 2: `FACILITATE=1 npm run buyer -- "..."` → deliverable shows the **Basescan tx link** | "This is what a search box can't do: a real buyer hires Jodoh, Jodoh negotiates and pays escrow in USDC on Base to hire the matched agent, and returns its result. A real A2A order between two agents — here's the tx on Basescan." (Point the hire at a **fast** counterparty, or at Jodoh itself via `CROO_TARGET_SERVICE_ID`, so it delivers within the poll window on camera.) |
| 3:30–4:10 | **Why not Navigator** | match.ts reputation block | "Navigator turns intent into orders. Jodoh adds reputation-weighted ranking and closes the deal with a rake. It competes on match quality." |
| 4:10–4:40 | **Trust** | `npm test` green | "Open source, MIT. The matching engine is unit-tested and runs with no LLM in the loop." |
| 4:40–5:00 | **CTA** | Store listing page | "Jodoh is live on the CROO Agent Store. Hire it — or let it hire someone for you." |

## Anti-sybil plan (reward eligibility)

**Onboarding Bounty ($10, window closed 2026-07-09):** on-chain requirements met —
only **≥2 on-chain CAP transactions, no self-trade**. Run `npm run prove-hire` twice
against two different agents (Jodoh hires them → real USDC on Base, distinct
counterparties). See [`BOUNTY.md`](./BOUNTY.md). The two counterparties also count
toward the hackathon gate below.

Hackathon reward gate: **≥3 unique counterparty agents + ≥5 unique buyer wallets, no self-trade.**

- **≥3 unique counterparties — needs must fan out.** `facilitate` always hires the
  #1 match, which is *deterministic*: similar needs hire the **same** agent. So to
  hit 3+ distinct counterparties, drive facilitation with needs from different
  categories that resolve to different winners, e.g.:
  - `"audit my smart contract before launch"` → ChainGuard/audit agent
  - `"split a USDC payout to my team"` → remifi/payout agent
  - `"track a polymarket whale wallet"` → Polymarket tracker
  Verify each hire returns a **different `agentId`** in the deliverable before you
  count it. (Confirm none of them share Jodoh's own wallet → no self-trade.)
- **≥5 unique buyer wallets — recruit real buyers.** Post the message below in the
  CROO Discord; each responder orders `find_match` from their own wallet.
- Keep the live catalog broad (default) so matches spread across many providers.

### Discord recruit post (paste-ready)

> **🆓 Free agent matchmaking — bring a need, I'll find (and hire) your match.**
> I built **Jodoh**, a matchmaker agent on the CROO Store: tell it what you need in
> plain English and it ranks the best-fit agent by real reputation — and can hire
> that agent for you on-chain (USDC on Base), returning the result + the tx hash.
> **First 10 scans are on me.** Drop your need in the thread (e.g. "audit my
> contract", "track this wallet", "split a payout") and order `find_match` — takes
> ~seconds. Live leaderboard + how it works: **https://jodoh-croo.vercel.app** 💘
