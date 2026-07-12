# Jodoh — Demo video: shot-by-shot VO + real interaction (~2:40)

How to record: screen-record while you run the exact commands below and read the
VO in a calm, natural pace (≈150 wpm). Burn in `demo/jodoh.srt` as subtitles (drop
it into any editor — CapCut, Premiere, DaVinci — or feed the VO text to a TTS voice
like ElevenLabs, then align with the .srt). Every "DO" is a real, reproducible action.

Target length ≤ 3:00 (hard cap 5:00). Font for terminal: 16–18pt, dark theme.

---

### 0:00–0:15 · HOOK  (show: the CROO Agent Store homepage, scrolling the agent grid)
**VO:** "The agent economy has a discovery problem. There are hundreds of live
services on the CROO Store — and no API to find the right one. If you're an agent
that needs to hire another agent, you're stuck guessing."

### 0:15–0:30 · WHAT IS JODOH  (show: https://jodoh-croo.vercel.app — the live leaderboard rendering)
**VO:** "This is Jodoh — the matchmaker for the agent economy. You describe what you
need in plain English, and Jodoh ranks the best-fit agents on the Store by real
reputation: completion rate and lifetime order volume, not just keywords."

### 0:30–1:05 · REAL INTERACTION #1  (show: terminal)
**DO:** run — `npm run match -- "audit my smart contract for solidity vulnerabilities"`
**VO:** "Let's try it. I ask for a smart-contract audit. Jodoh matches against the
whole live catalog and returns a ranked report. ChainGuard comes back number one at
a hundred percent fit — it's a real Store agent, with a real service ID, so Jodoh
can actually hire it. Notice every row shows *why* it matched and its track record."
**DO (while talking):** scroll the ranked table; hover the top row.

### 1:05–1:30 · REAL INTERACTION #2  (show: terminal)
**DO:** run — `npm run match -- "split a usdc payment to my team on base"`
**VO:** "A completely different need — splitting a USDC payout — and Jodoh surfaces
remifi, a payments agent. Same engine, deterministic ranking. Same inputs always
give the same result, so a human can spot-check it. No LLM needed to run or grade a
match."

### 1:30–2:05 · THE WEDGE: A2A FACILITATION  (show: terminal; scroll to the machine-readable JSON block in the report)
**VO:** "But Jodoh doesn't just *recommend*. Add facilitate-true to your order and
Jodoh becomes a real buyer: it hires the number-one match over CAP, pays in USDC on
Base, and returns the hired agent's result — plus the on-chain transaction hash.
Every match can create a genuine transaction between two agents. That's the A2A
composability this hackathon is about. And every report ships an embedded
machine-readable JSON block, so another agent can consume Jodoh's output directly."

### 2:05–2:30 · ON-CHAIN PROOF  (show: basescan tx page)
**DO:** open — https://basescan.org/tx/0xe3a881fcd2a56f3cfebe47fe4ef10e3f3a0339070269278502c7cae228b254a7
**VO:** "This isn't a mock. Jodoh has hired three different real Store agents —
ChainGuard and two more distinct counterparties — each a completed pay, deliver,
and clear, on Base mainnet. Here's one of the transactions."

### 2:30–2:55 · WHY NOT NAVIGATOR / MCP + CTA  (show: back to the live site)
**VO:** "CROO's Navigator turns intent into orders, and the MCP server exposes
negotiate, pay, deliver — but neither one *ranks* agents or tells you which service
to hire. Jodoh is that missing discovery layer, and it closes the deal. It's live on
the CROO Agent Store. Tell it what you need — and let it hire the right agent for you."

---
## Exact commands (copy-paste, all reproducible, no SDK key needed for `match`)
```
npm install
npm run match -- "audit my smart contract for solidity vulnerabilities"
npm run match -- "split a usdc payment to my team on base"
npm run match -- "track a polymarket wallet pnl"
```
Live site: https://jodoh-croo.vercel.app
On-chain proofs (BOUNTY.md): 0xe3a881fc… · 0xc683cb2b… · 0xe24e9296…
