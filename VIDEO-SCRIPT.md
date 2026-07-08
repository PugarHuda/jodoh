# Jodoh — demo video script (≤ 5 min, scene-by-scene)

Record at 1080p. Two terminals + a browser. Voiceover lines in **bold**; on-screen
action in _italics_. Total ~4:40, leaves buffer under the 5-min cap.

Prep before recording:
- `cd jodoh`, `.env` filled, agent NOT running in this terminal (so logs are clean).
- Browser tabs: (1) https://jodoh-croo.vercel.app  (2) the CROO Store agent page
  (3) https://basescan.org/address/0x7E02C6Cf8F91FccfBAD17FaE83D2AA3e0551E313
- Font size up (18pt+) so terminals are readable.

---

## 0:00–0:30 — The problem (hook)
_Browser on the CROO Store, scroll the long agent list._
> **The CROO Store has hundreds of agents. But when your agent needs to hire one —
> to audit a contract, track a wallet, split a payout — nothing tells it *which* to
> trust. Navigator and the MCP server can hire an agent. Neither ranks which one.
> That's the gap Jodoh fills.**

## 0:30–1:30 — What Jodoh does (live match)
_Terminal 1:_ `npm run match -- "audit my smart contract for vulnerabilities"`
> **Describe a need in plain English. Jodoh ranks every live Store agent by *real
> reputation* — completion rate weighted by proven order volume — not keywords.**
_Point at the top result + the fit %._
> **Deterministic, reproducible, no LLM required to run or grade a match.**
_Switch to the browser tab https://jodoh-croo.vercel.app — the live reputation leaderboard._
> **Same engine, live on the web.**

## 1:30–3:05 — The wedge: it *hires* the match, on-chain (the money shot)
_Terminal 1:_ `npm run prove-hire -- "audit my smart contract for vulnerabilities"`
> **Jodoh doesn't stop at a recommendation. With `facilitate`, it negotiates, pays
> the matched agent in USDC on Base, and returns its result — a real agent-to-agent
> order between two distinct agents.**
_While it runs, switch to the Basescan tab for Jodoh's wallet — show the recent tx._
> **Here's the on-chain proof: Jodoh's wallet paying a matched agent. Real USDC, on
> Base mainnet.**
_Open one tx:_ https://basescan.org/tx/0xe3a881fcd2a56f3cfebe47fe4ef10e3f3a0339070269278502c7cae228b254a7
> **This isn't a mock. Jodoh hired three different real Store agents — ChainGuard,
> DepegGuard, and one more — each a completed pay-deliver-clear on-chain.**

## 3:05–4:00 — Why it's not Navigator / the MCP server
_Terminal 2 or editor:_ open `src/match.ts`, scroll to the reputation block.
> **The official MCP server's quickstart literally says "ask your agent: find me a
> DeFi data agent" — but ships no tool that finds one. Hiring is solved. Discovery
> and reputation ranking are not. Jodoh is that layer — and every time it
> facilitates, it becomes a real buyer of another agent. Genuine A2A composition.**

## 4:00–4:40 — Proof + what's under the hood
_Show BOUNTY.md's proof table (the three tx) briefly._
> **Three distinct counterparties, real USDC on Base, no self-trade — Jodoh excludes
> its own services by agent id and service id. Open source, MIT. Full CAP integration
> on the official SDK, unit-tested matching engine, SSRF-safe, sanitized reports.**

## 4:40–5:00 — CTA
_Browser: the Store agent page._
> **Jodoh is live on the CROO Agent Store. Hire it — order `find_match` with your
> need — or let it hire the right agent for you. Repo and live ranking in the
> description. Thanks for watching.**

---

### On-screen assets to have ready
- The three pay-tx hashes (from BOUNTY.md):
  - ChainGuard: `0xe3a881fcd2a56f3cfebe47fe4ef10e3f3a0339070269278502c7cae228b254a7`
  - `e05abaea`: `0xc683cb2b3e1b67351e5c9e1a6a01cc9ca7aae90638a0b8cadbefe206decff5a6`
  - DepegGuard: `0xaa1164b26eaa5fac67ff9a3e91e74caf8720e9b64a926c40851a39fac9572d3a`
- If `prove-hire` is slow to print on camera, pre-record that segment or cut to the
  Basescan tx you already have (the hire is already proven on-chain).
- Keep the agent online in a separate hidden terminal (`npm start` / keepalive) so
  the Store page shows Jodoh as online during the CTA.
