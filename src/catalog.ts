// The pool of agents Jodoh matches against.
//
// NOTE: the CROO SDK has NO agent/service discovery API (only listNegotiations /
// listOrders). That gap is exactly why Jodoh exists. So the catalog is a curated
// snapshot of real Store agents by default; set CROO_CATALOG_URL to a JSON feed
// to override with live data (and real serviceIds for facilitation).

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  priceFrom: number; // USDC per call
  completion: number; // % completed orders (reputation)
  orders: number; // total orders (reputation)
  serviceId?: string; // real CROO serviceId; required to actually hire (facilitate)
}

// ponytail: curated snapshot; a CROO_CATALOG_URL feed replaces it with live data.
export const SEED_CATALOG: AgentEntry[] = [
  {
    id: "polymarket-tracker",
    name: "Polymarket Smart Wallet Tracker",
    description:
      "Turns a Polymarket proxy/smart wallet address into a structured intelligence report: profile, leaderboard PnL, positions, trades, activity.",
    tags: ["polymarket", "wallet", "tracking", "pnl", "intelligence", "data"],
    priceFrom: 0.1,
    completion: 99.97,
    orders: 9015,
  },
  {
    id: "veris",
    name: "VERIS",
    description:
      "Trust infrastructure agent. Due diligence on projects and agents, risk analysis, evidence-backed trust reports before you commit funds.",
    tags: ["trust", "audit", "due-diligence", "risk", "research", "verification"],
    priceFrom: 0.1,
    completion: 96.83,
    orders: 61,
  },
  {
    id: "remifi",
    name: "remifi",
    description:
      "Turn plain English into multi-recipient USDC splits on Base. Composable payout leg for payroll, treasury, and creator revenue with on-chain proof.",
    tags: ["payment", "payout", "usdc", "split", "payroll", "defi", "base"],
    priceFrom: 0.05,
    completion: 100,
    orders: 65,
  },
  {
    id: "chainguard",
    name: "ChainGuard",
    description:
      "AI smart contract security auditor. Submit a contract address or Solidity to get vulnerability findings, severity ratings, gas optimizations, and a security score.",
    tags: ["audit", "security", "smart-contract", "solidity", "vulnerability", "code"],
    priceFrom: 0.08,
    completion: 100,
    orders: 22,
  },
  {
    id: "alphatrack",
    name: "AlphaTrack",
    description:
      "Binance smart-money top traders leaderboard — top futures traders ranked by PnL, ROI, AUM.",
    tags: ["binance", "traders", "leaderboard", "smart-money", "pnl", "data"],
    priceFrom: 0.1,
    completion: 99.9,
    orders: 9052,
  },
  {
    id: "swapgod",
    name: "SwapGod",
    description: "Swap any ERC-20 to any ERC-20 on Aerodrome (Base mainnet).",
    tags: ["swap", "dex", "erc20", "aerodrome", "base", "defi", "trading"],
    priceFrom: 0.1,
    completion: 99.5,
    orders: 8201,
  },
  {
    id: "opspilot",
    name: "OpsPilot",
    description:
      "Score a web page's SEO fields against 18 deterministic rules — title, description, structure, images, technical, links — with per-rule findings.",
    tags: ["seo", "audit", "web", "content", "marketing", "rules"],
    priceFrom: 0.1,
    completion: 99.8,
    orders: 8092,
  },
  {
    id: "hyperliquid-vault",
    name: "Hyperliquid Vault Strategy Intelligence Agent",
    description:
      "Review a Hyperliquid vault: leader, strategy, APR, TVL, followers, capacity, commission, deposit availability.",
    tags: ["hyperliquid", "vault", "defi", "strategy", "apr", "tvl", "data"],
    priceFrom: 0.1,
    completion: 99.6,
    orders: 8094,
  },
  {
    id: "adpilot",
    name: "AdPilot",
    description:
      "Cross-channel conversion funnel analysis from ad data — impression to click to conversion, drop-off points, per-stage loss rates.",
    tags: ["ads", "funnel", "marketing", "conversion", "analytics", "roas"],
    priceFrom: 0.1,
    completion: 99.7,
    orders: 4581,
  },
  {
    id: "dca-signal",
    name: "DCA Signal AI Agent",
    description:
      "Bitcoin Fear & Greed Index with market interpretation; explainable DCA signal from on-chain and sentiment data.",
    tags: ["bitcoin", "sentiment", "signal", "dca", "fear-greed", "data"],
    priceFrom: 0.1,
    completion: 99.5,
    orders: 4218,
  },
];

/**
 * Return the catalog to match against. Defaults to the curated seed (the SDK has
 * no discovery API); if CROO_CATALOG_URL is set, fetch a live JSON feed instead.
 * Never hard-fails — falls back to the seed on any error. Excludes Jodoh itself.
 */
export async function fetchCatalog(selfId?: string): Promise<AgentEntry[]> {
  const url = process.env.CROO_CATALOG_URL;
  const seed = SEED_CATALOG.filter((a) => a.id !== selfId);
  if (!url) return seed;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return seed;
    const raw: any = await res.json();
    const list: any[] = Array.isArray(raw) ? raw : (raw.agents ?? raw.data ?? []);
    const mapped: AgentEntry[] = list.map((a) => ({
      id: String(a.id ?? a.agent_id ?? a.slug),
      name: String(a.name ?? a.title ?? "unknown"),
      description: String(a.description ?? a.summary ?? ""),
      tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
      priceFrom: Number(a.price_from ?? a.priceFrom ?? 0.1),
      completion: Number(a.completion ?? a.completion_rate ?? 100),
      orders: Number(a.orders ?? a.total_orders ?? 0),
      serviceId: a.service_id ?? a.serviceId,
    }));
    const clean = mapped.filter((a) => a.id && a.id !== selfId);
    return clean.length ? clean : seed;
  } catch {
    return seed;
  }
}
