# Jodoh — DoraHacks BUIDL submission

Paste-ready content for the CROO Agent Hackathon BUIDL form.

---

## Name
Jodoh

## Logo
`assets/logo.png` (or `assets/icon.png` for the square avatar)

## Tagline (one line)
The matchmaker for the agent economy — reputation-weighted discovery that also hires the match for you, on-chain.

## Tracks (max 2)
- Developer Tooling Agents
- Open – Any A2A Agents

## Tags
AI Agents · A2A · CROO Agent Protocol · Base · USDC · Crypto-AI

## Links
- Live site: https://jodoh-croo.vercel.app
- GitHub: https://github.com/PugarHuda/jodoh
- Demo video: <paste your ≤5-min video link>
- Agent Store listing: <paste your Jodoh Store URL>

---

## Description

**The problem.** 758 agents and **443 services** are live on the CROO Store — 106K+ orders, $163K+ volume — and climbing. But there is **no discovery layer**: the SDK exposes only `listNegotiations` / `listOrders`, and the official CROO **MCP server** exposes `negotiate` / `pay` / `deliver` — hiring and paying are solved, but **nothing ranks agents or tells you which of 443 services to hire**. (The MCP quickstart even says "ask your agent: *Find me a DeFi data agent*" — yet ships no tool that actually finds one.) A buyer, human or agent, can't tell which service fits their need, or which is trustworthy. Discovery is the missing layer.

**Jodoh is that layer.** Tell it what you need in plain English; it ranks the best-fit services across the **whole live Store catalog**, weighted by **real reputation** (completion rate + order volume), not just keywords. And it doesn't stop at an answer — set `facilitate: true` and Jodoh **hires the #1 match for you over CAP**, pays in USDC on Base, and returns the result **with the on-chain pay tx hash**, on a facilitation-fee (rake) model. It doesn't just recommend a transaction; it **creates** one between two agents.

**Why it's real A2A composability.** Every facilitated match makes Jodoh a genuine **buyer of another agent** — a real on-chain order between distinct counterparties. Jodoh isn't composable in theory; it manufactures composition.

**Not the Navigator — and not the MCP server.** CROO Navigator turns intent into orders; the MCP server lets an agent negotiate/pay/deliver. Neither *ranks* agents or surfaces *which* to hire. Jodoh is the layer they're both missing: it competes on **match quality** (reputation-weighted ranking, calibrated so a clearly better fit always wins but unproven noise can't beat a proven, relevant service) and on **closing the deal** (facilitation on a rake model — a quoted fee today, on-chain revenue once buyer-funded `require_fund_transfer` services are supported).

**What's built and verified.**
- Live discovery over the Store's public read API (paginated, cached) — 160+ real services with real `serviceId`s, so facilitation hires real agents.
- Full CAP provider wired to the official `@croo-network/sdk` (negotiate → accept → match → optionally hire → deliver), settling USDC on Base.
- **Connectivity verified against production**: `npm run health` shows SDK-key auth ✓ and WebSocket ✓.
- Deterministic, unit-tested matching engine (runs with no LLM); buyer simulator (`npm run buyer`) for an end-to-end demo.
- MIT licensed, open source.

## The five mandatory requirements
1. **Listed on CROO Agent Store** — service `find_match`, 0.10 USDC, SLA < 30 min.
2. **Integrated with CAP** — provider accepts orders and settles on-chain (USDC / Base 8453).
3. **Open source** — public GitHub repo, MIT.
4. **Demo + README** — ≤5-min video + README with setup, SDK methods, integration notes.
5. **BUIDL filed on DoraHacks** — this submission.

## SDK methods used
`AgentClient` · `connectWebSocket` · `EventType.NegotiationCreated/OrderPaid` · `getNegotiation` · `acceptNegotiation` / `rejectNegotiation` · `getOrder` · `listOrders` · `negotiateOrder` · `payOrder` · `getDelivery` · `deliverOrder` (`DeliverableType.Text`).
