# Jodoh — CROO rewards tracker

Jodoh targets **two separate CROO programs**. They have different deadlines — the
Onboarding Bounty is the earlier and easier one, so treat it as the first goal.

---

## 1. CROO Onboarding Bounty — **$10 USDC** (Jun 9 – Jul 9)

> List a working agent, integrate CAP, settle a real USDC payment. First 100 valid
> agents each earn $10 USDC. FCFS, pool capped at $1,000. **One agent per developer**
> (GitHub + wallet). Rewards paid every Tuesday after manual review — submit before
> **Sunday 23:59 UTC** to make that week's batch.

**Hard deadline: 2026-07-09 23:59 UTC.**

### Requirements → Jodoh status

| # | Requirement | Status |
|---|---|---|
| 1 | Listed on CROO Agent Store (Base mainnet), discoverable, stays listed through review | ✅ Live — agent `Jodoh`, services `find_match` + `hire_match`, online |
| 2 | Callable through CAP and settles a **real USDC payment** on-chain | ✅ Integrated (`@croo-network/sdk`); ⏳ needs one real settlement |
| 3 | **≥ 2 completed on-chain CAP transactions** | ⏳ **the one gap — see plan below** |
| 4 | Submitted before 2026-07-09 23:59 UTC | ⏳ submit after step 3 |
| — | Anti-abuse: no forks, fake agents, **obvious self-trade loops**, or failed spot-checks | ✅ by design — see below |

### The plan to get the 2 transactions (no self-trade)

The buyer simulator using Jodoh's **own** key is a self-order — **explicitly
disqualifying** here ("no obvious self-trade loops"). Use real, distinct
counterparties instead. `prove-hire` does exactly this: Jodoh hires a **different**
live agent over CAP and settles USDC on Base.

1. Fund Jodoh's wallet (`0x7E02…E313`) with **~$1 USDC on Base** (each hire ≤ 0.25).
2. Run two hires against **two different** agents, e.g.:
   ```bash
   npm run prove-hire -- "audit my smart contract for vulnerabilities"   # → agent A
   npm run prove-hire -- "track a polymarket whale wallet and its PnL"    # → agent B
   ```
   Each prints a Basescan pay-tx link — that's a completed CAP transaction with a
   distinct counterparty. Two different agents → requirement met, cleanly non-self-trade.
3. Submit before the deadline.

**Anti-abuse safety built in:** Jodoh excludes all of its own services from its match
catalog (by `agentId`), so it can never hire itself; facilitation is disabled if the
agent id is unknown; and the buyer sim warns loudly when it would be a self-order.

---

## 2. CROO Agent Hackathon — **~$10.2K + Agent Store feature + $CROO whitelist**

**Deadline: 2026-07-12 16:00.** Separate, richer program; a second agent
(`jailbreak-my-agent`) can also enter the Hackathon/Leaderboard (the $10 onboarding
bounty is one-per-developer, so it applies to Jodoh only).

Requirements: listed on Store, CAP-integrated, open-source (MIT ✅), ≤5-min demo
video, README with setup + SDK methods (✅). Reward eligibility wants **≥3 unique
counterparty agents + ≥5 unique buyer wallets, no self-trade** — see the recruit
plan and leaderboard in [`LISTING.md`](./LISTING.md) and the live site
(https://jodoh-croo.vercel.app).

---

## One-look checklist

- [x] Listed & online on the CROO Agent Store
- [x] CAP integration wired and health-verified
- [x] Open source (MIT), public repo, live site
- [ ] Fix service prices (find_match 0.10, hire_match 0.25 — currently 10× low)
- [ ] Fund wallet ~$1 USDC on Base
- [ ] 2 on-chain CAP hires to 2 different agents (`prove-hire`) → **Onboarding Bounty**
- [ ] Submit Onboarding Bounty before **2026-07-09 23:59 UTC**
- [ ] Recruit ≥5 unique buyers + reach ≥3 counterparties → **Hackathon eligibility**
- [ ] Record ≤5-min demo video
- [ ] File the Hackathon BUIDL before **2026-07-12 16:00**
