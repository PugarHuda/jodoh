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

// The SDK has no discovery API, but the Store exposes a public read API. Jodoh
// matches against real live services (each with a real serviceId, so facilitation
// can actually hire them).
const PUBLIC_API =
  process.env.CROO_PUBLIC_API || "https://api.croo.network/backend/v1/public";
const PAGE_SIZE = 50; // server caps pageSize at 50
const CACHE_TTL_MS = 60_000;

let cache: { at: number; data: AgentEntry[] } | null = null;

// Walk paginated pages until a short page (or the safety cap) is hit.
async function fetchAll(path: string, key: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 40; page++) {
    const res = await fetch(`${PUBLIC_API}/${path}?pageSize=${PAGE_SIZE}&page=${page}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) break;
    const arr: any[] = ((await res.json()) as any)[key] ?? [];
    out.push(...arr);
    if (arr.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Fetch the live Store catalog: all /public/services joined with /public/agents
 * for reputation. Each entry carries a real serviceId (hireable). Skips
 * fund-transfer services (swaps/bridges Jodoh can't cleanly facilitate) and Jodoh
 * itself. Cached 60s. Never hard-fails — falls back to the curated seed on error.
 */
export async function fetchCatalog(selfServiceId?: string): Promise<AgentEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.filter((e) => e.serviceId !== selfServiceId);
  }
  try {
    const [services, agents] = await Promise.all([
      fetchAll("services", "items"),
      fetchAll("agents", "agents"),
    ]);
    if (!services.length) return SEED_CATALOG;
    const byAgent = new Map<string, any>(agents.map((a) => [a.agentId, a]));

    const entries: AgentEntry[] = [];
    for (const s of services) {
      if (!s.serviceId) continue;
      let fundTransfer = false;
      try {
        fundTransfer = !!JSON.parse(s.feeConfig ?? "{}").fund_transfer_required;
      } catch {
        /* treat unparseable feeConfig as flat-fee */
      }
      if (fundTransfer) continue;

      const a = byAgent.get(s.agentId) ?? {};
      // Skill slugs like "data-analytics" -> ["data","analytics"] so they match
      // single-word needs.
      const tags: string[] = (a.skillTagSlugs ?? []).flatMap((t: string) =>
        String(t).split(/[^a-z0-9]+/i).filter(Boolean),
      );
      entries.push({
        id: s.serviceId,
        name: a.name ? `${a.name} — ${s.name}` : String(s.name ?? "service"),
        description: String(s.description ?? ""),
        tags,
        priceFrom: Number(s.price ?? 0) / 1e6,
        completion: Number(a.completionRate ?? 0),
        orders: Number(s.orders7d ?? a.completedOrders ?? 0),
        serviceId: s.serviceId,
      });
    }
    if (!entries.length) return SEED_CATALOG;
    cache = { at: Date.now(), data: entries };
    return entries.filter((e) => e.serviceId !== selfServiceId);
  } catch {
    return SEED_CATALOG;
  }
}
