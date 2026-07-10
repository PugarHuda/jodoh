import assert from "node:assert/strict";
import { fetchCatalog, SEED_CATALOG, type AgentEntry } from "../src/catalog.js";

// The live-Store pipeline (fetchCatalog) had zero unit coverage: it maps two paged
// JSON feeds into AgentEntry rows AND runs the self-exclusion security filter that
// keeps Jodoh from matching/hiring its own services. Drive it with a mocked fetch.
//
// NB: catalog.ts has a module-level 60s cache. The calls below are ORDERED around
// it: the SEED-fallback branches (empty/error) return before the cache is set, so
// they run first while the cache is still empty; the success call then populates
// the cache; the self-exclusion call rides the cache-hit path deliberately.

type FetchImpl = (url: string) => Promise<any>;
let fetchImpl: FetchImpl;
(globalThis as any).fetch = (url: string) => fetchImpl(url);

const ok = (body: any) => ({ ok: true, json: async () => body });

// A fetch mock that serves `services` on /services and `agents` on /agents. Arrays
// are < PAGE_SIZE(50) so fetchAll stops after page 1.
const serve = (services: any[], agents: any[]): FetchImpl => async (url) =>
  url.includes("/services") ? ok({ items: services }) : ok({ agents });

// ── 1. Empty services -> SEED fallback (cache still empty) ────────────────────
fetchImpl = serve([], []);
{
  const c = await fetchCatalog("whatever");
  assert.equal(c.length, SEED_CATALOG.length, "empty services must fall back to the curated seed");
}

// ── 2. Fetch throws -> SEED fallback (cache still empty) ──────────────────────
fetchImpl = async () => {
  throw new Error("network down");
};
{
  const c = await fetchCatalog("whatever");
  assert.equal(c.length, SEED_CATALOG.length, "a fetch error must fall back to the seed, not crash");
}

// ── 2b. Services present but ALL invalid (no serviceId) -> SEED fallback ──────
// A distinct branch from the empty case: the feed returned rows, but none are
// usable. Must degrade to the seed, not to an empty catalog. (Cache still empty:
// this returns before the cache is set.)
fetchImpl = serve([{ agentId: "a", name: "x", description: "no id" }], []);
{
  const c = await fetchCatalog("whatever");
  assert.equal(c.length, SEED_CATALOG.length, "all-invalid services must fall back to the seed, not an empty catalog");
}

// ── 3. Real mapping (this call POPULATES the cache) ───────────────────────────
const SERVICES = [
  { serviceId: "svc-1", agentId: "agent-1", name: "Audit", description: "solidity audit", price: "80000", feeConfig: '{"fund_transfer_required":false}', orders7d: 5 },
  { serviceId: "svc-self", agentId: "agent-SELF", name: "FindMatch", description: "self service", price: "100000" },
  { serviceId: "svc-hire", agentId: "agent-2", name: "HireMatch", description: "hire leg", price: "100000", orders7d: "7" }, // completedOrders absent -> falls back to orders7d
  { serviceId: undefined, agentId: "agent-x", name: "Ghost", description: "no id" }, // skipped
  { serviceId: "svc-ft", agentId: "agent-3", name: "Payout", description: "moves principal", price: "50000", feeConfig: '{"fund_transfer_required":true}' },
  { serviceId: "svc-bad", agentId: "agent-4", name: "BadFee", description: "unparseable fee", price: "90000", feeConfig: "{not json" }, // fee parse fails -> flat-fee
];
const AGENTS = [
  { agentId: "agent-1", name: "ChainGuard", completionRate: 100, completedOrders: 22, skillTagSlugs: ["smart-contract", "security"] },
  { agentId: "agent-2", name: "HireCo", completionRate: 99, skillTagSlugs: ["hiring"] }, // no completedOrders
  { agentId: "agent-3", name: "PayCo", completionRate: 98, completedOrders: 300, skillTagSlugs: ["payments"] },
  { agentId: "agent-4", name: "BadCo", completionRate: 97, completedOrders: 10 },
  { agentId: "agent-SELF", name: "Jodoh", completionRate: 100, completedOrders: 1 },
];
fetchImpl = serve(SERVICES, AGENTS);
const all = await fetchCatalog(); // no selfAgentId -> keep everything (populates cache with all rows)
const by = (id: string) => all.find((e) => e.id === id) as AgentEntry;

assert.ok(!all.some((e) => e.id === undefined || e.name === "Ghost"), "a service with no serviceId is skipped");
assert.equal(all.length, 5, "5 valid services mapped (ghost skipped)");

const one = by("svc-1");
assert.equal(one.name, "ChainGuard — Audit", "name joins agent name + service name");
assert.equal(one.priceFrom, 0.08, "price 80000 micro-USDC -> 0.08");
assert.equal(one.completion, 100, "completionRate mapped");
assert.equal(one.orders, 22, "lifetime completedOrders used for reputation");
assert.deepEqual(one.tags, ["smart", "contract", "security"], "skill slugs split on non-alphanumerics");
assert.equal(one.fundTransfer, false, "flat-fee service -> fundTransfer false");

assert.equal(by("svc-hire").orders, 7, "orders falls back to orders7d when lifetime is absent");
assert.equal(by("svc-ft").fundTransfer, true, "fund_transfer_required:true -> fundTransfer true");
assert.equal(by("svc-bad").fundTransfer, false, "unparseable feeConfig treated as flat-fee, not a crash");

// ── 4. Self-exclusion on the cached rows (SECURITY: never match/hire self) ────
// Cache is warm from call #3; this filters the SAME rows by a self identity.
const filtered = await fetchCatalog("agent-SELF", ["svc-hire"]);
assert.ok(!filtered.some((e) => e.agentId === "agent-SELF"), "own service excluded by agentId");
assert.ok(!filtered.some((e) => e.id === "svc-hire"), "own service excluded by serviceId even under a different agentId");
assert.ok(filtered.some((e) => e.id === "svc-1"), "a foreign service is still kept");
assert.equal(filtered.length, 3, "5 rows minus 2 self services = 3");

console.log("PASS  catalog: seed fallback (empty/error), Store JSON mapping (name/price/completion/orders-fallback/tags/feeConfig), self-exclusion by agentId+serviceId.");
