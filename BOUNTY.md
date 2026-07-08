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
| 2 | Callable through CAP and settles a **real USDC payment** on-chain | ✅ **Settled** — Jodoh hired 3 distinct agents, USDC on Base (see proof) |
| 3 | **≥ 2 completed on-chain CAP transactions** | ✅ **2 completed** (pay → deliver → clear) + a 3rd paid — see proof |
| 4 | Submitted before 2026-07-09 23:59 UTC | ⏳ ready to submit — proof below |
| — | Anti-abuse: no forks, fake agents, **obvious self-trade loops**, or failed spot-checks | ✅ by design — 3 distinct third-party counterparties, no self-trade |

### ✅ Proof of on-chain settlement (Base mainnet, 2026-07-08)

Jodoh (buyer wallet `0x7E02C6Cf8F91FccfBAD17FaE83D2AA3e0551E313`) hired **3 distinct
third-party agents** over CAP via `npm run prove-hire`, settling real USDC on Base —
**no self-trade** (Jodoh excludes its own services by `agentId` **and** `serviceId`).

| # | Counterparty agent | Order | Status | Pay tx (Basescan) |
|---|---|---|---|---|
| 1 | ChainGuard `74775115-…` | `61aa2181-…` | **completed** (pay→deliver→clear) | [`0xe3a881fc…`](https://basescan.org/tx/0xe3a881fcd2a56f3cfebe47fe4ef10e3f3a0339070269278502c7cae228b254a7) |
| 2 | `e05abaea-…` | `988c08b4-…` | **completed** (pay→deliver→clear) | [`0xc683cb2b…`](https://basescan.org/tx/0xc683cb2b3e1b67351e5c9e1a6a01cc9ca7aae90638a0b8cadbefe206decff5a6) |
| 3 | DepegGuard `5cbcbd42-…` | `02c517ef-…` | paid (delivering) | [`0xaa1164b2…`](https://basescan.org/tx/0xaa1164b26eaa5fac67ff9a3e91e74caf8720e9b64a926c40851a39fac9572d3a) |

Orders #1 and #2 satisfy **≥ 2 completed on-chain CAP transactions** with distinct
counterparties. Delivery + escrow-clear tx for the completed orders:
- #1 deliver `0xd0ee1e08…` · clear `0x45c987c0…`
- #2 deliver `0x9e6e78b7…` · clear `0x8f892c5d…`

**Anti-abuse safety built in:** Jodoh excludes all of its own services from its match
catalog (by `agentId` **and** `serviceId`), so it can never hire itself; facilitation
is disabled if the agent id is unknown; and the buyer sim warns loudly when it would
be a self-order.

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
- [x] Fund wallet ~$1 USDC on Base
- [x] **2 completed on-chain CAP hires to distinct agents** (3 done) → **Onboarding Bounty proof**
- [x] Reached ≥3 unique counterparty agents (ChainGuard, `e05abaea`, DepegGuard)
- [ ] Fix service prices (find_match 0.10, hire_match 0.25 — currently 10× low)
- [ ] Submit Onboarding Bounty before **2026-07-09 23:59 UTC**
- [ ] Recruit ≥5 unique **buyers** (agents hiring Jodoh) → **Hackathon eligibility**
- [ ] Record ≤5-min demo video
- [ ] File the Hackathon BUIDL before **2026-07-12 16:00**
