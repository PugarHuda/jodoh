import assert from "node:assert/strict";
import { createOrderHandler, parseReq, type HandlerConfig } from "../src/handler.js";
import type { AgentEntry } from "../src/catalog.js";
import type { Match } from "../src/match.js";
import type { Facilitation } from "../src/facilitate.js";

// The provider order path (handler.ts) is the money-critical orchestration: it
// decides when to pay a sub-hire, guards against double-spend, and retries
// delivery. It was previously only integration-tested against the live network.
// These are unit tests with a fully mocked client — no WS, no network, no spend.

// A catalog with one genuinely-hireable match for the need "aardvark widget".
const CATALOG: AgentEntry[] = [
  {
    id: "svc-x",
    name: "X",
    description: "aardvark widget specialist",
    tags: ["aardvark", "widget"],
    priceFrom: 0.1,
    completion: 100,
    orders: 50,
    serviceId: "svc-x",
    agentId: "agent-x",
  },
];

interface ClientOverrides {
  order?: any; // what getOrder returns
  getOrderThrows?: boolean;
  negotiation?: any; // what getNegotiation returns
  getNegotiationThrows?: boolean;
  deliverThrows?: boolean; // deliverOrder always rejects
  listOrders?: any[]; // reconcile source
}

// Build a mock AgentClient exposing only the methods handler.ts calls, plus call
// counters/captures for assertions.
function makeClient(o: ClientOverrides & { listNegotiations?: any[]; listNegThrows?: boolean } = {}) {
  const calls = { getOrder: 0, getNegotiation: 0, deliver: 0, listOrders: 0, accept: 0, reject: 0, listNeg: 0 };
  const delivered: any[] = [];
  const rejected: string[] = [];
  let acceptedOrderSeq = 0;
  const client = {
    async getOrder(_id: string) {
      calls.getOrder++;
      if (o.getOrderThrows) throw new Error("getOrder boom");
      return o.order;
    },
    async getNegotiation(_id: string) {
      calls.getNegotiation++;
      if (o.getNegotiationThrows) throw new Error("getNegotiation boom");
      return o.negotiation ?? { requirements: JSON.stringify({ need: "aardvark widget" }) };
    },
    async deliverOrder(_id: string, payload: any) {
      calls.deliver++;
      if (o.deliverThrows) throw new Error("deliver boom");
      delivered.push(payload);
    },
    async listOrders(q: any) {
      calls.listOrders++;
      // page-aware: the reconcile loop stops on an empty page, so serve rows on
      // page 1 and nothing after.
      return (q?.page ?? 1) > 1 ? [] : (o.listOrders ?? []);
    },
    async acceptNegotiation(_id: string) {
      calls.accept++;
      return { order: { orderId: `accepted-${++acceptedOrderSeq}` } };
    },
    async rejectNegotiation(_id: string, reason: string) {
      calls.reject++;
      rejected.push(reason);
    },
    async listNegotiations(q: any) {
      calls.listNeg++;
      if (o.listNegThrows) throw new Error("listNegotiations boom");
      return (q?.page ?? 1) > 1 ? [] : (o.listNegotiations ?? []);
    },
  };
  return { client: client as any, calls, delivered, rejected };
}

// A hire spy: records what it was called with and returns a canned Facilitation
// (or undefined to simulate an unhireable match).
function makeHire(result?: Facilitation) {
  const seen: Array<{ match: Match; input: string; budget: number }> = [];
  // budget defaults so this matches `typeof facilitate` (its maxSpendUsdc is optional).
  const hire = async (_c: any, match: Match, input: string, budget = 0) => {
    seen.push({ match, input, budget });
    return result;
  };
  return { hire, seen };
}

const FACIL: Facilitation = {
  agentId: "agent-x",
  orderId: "sub-1",
  payTxHash: "0xhire",
  rake: 0.015,
  deliverable: "sub result",
};

const baseCfg = (over: Partial<HandlerConfig> = {}): HandlerConfig => ({
  selfAgentId: "jodoh-self",
  hireId: "hire-svc",
  findServiceId: "find-svc",
  loadCatalog: async () => CATALOG,
  sleep: async () => {}, // no real waits in the deliver-retry loop
  ...over,
});

// ── parseReq (moved out of agent.ts; pin the coercions) ──────────────────────
assert.deepEqual(parseReq(undefined), {}, "undefined requirements -> empty");
assert.equal(parseReq('{"need":123}').need, "123", "numeric need is coerced to string, not crashed");
assert.equal(parseReq('{"need":"  "}').need, undefined, "whitespace-only need -> undefined");
assert.equal(parseReq("just text").need, "just text", "a bare string is taken as the need");
assert.equal(parseReq('{"query":"x"}').need, "x", "query alias works");
assert.equal(parseReq('{"need":"x","facilitate":true}').facilitate, true, "facilitate flag parsed");

// ── 1. Happy path: facilitate=true -> hires, then delivers ───────────────────
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls, delivered } = makeClient({
    order: { orderId: "o1", price: "1000000", negotiationId: "n1", serviceId: "s1" }, // 1.0 USDC
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o1", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o1");

  assert.equal(seen.length, 1, "hire called exactly once");
  assert.equal(seen[0].budget, 0.25, "budget capped at MAX_HIRE_USDC (min of earned 1.0 and 0.25)");
  assert.equal(calls.deliver, 1, "delivered exactly once");
  assert.ok(delivered[0].deliverableText.includes("sub result"), "delivery includes the hired result");
  assert.ok(h.facilitatedOrders.has("o1"), "order recorded as facilitated (money guard)");
  assert.ok(h.handledOrders.has("o1"), "order recorded as handled");
  assert.ok(!h.pending.has("o1"), "pending cleared after successful delivery");
}

// ── 2. Idempotency: a replayed OrderPaid must not double-hire or double-deliver ─
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls } = makeClient({
    order: { orderId: "o2", price: "200000", negotiationId: "n2", serviceId: "s2" },
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o2", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o2");
  await h.handlePaidOrder("o2"); // WS replay

  assert.equal(seen.length, 1, "hire NOT repeated on replay (no double-spend)");
  assert.equal(calls.deliver, 1, "deliver NOT repeated on replay");
}

// ── 3. Delivery fails: un-mark handled (retryable) but NEVER re-hire ──────────
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls } = makeClient({
    order: { orderId: "o3", price: "200000", negotiationId: "n3", serviceId: "s3" },
    deliverThrows: true,
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o3", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o3");

  assert.equal(calls.deliver, 3, "delivery retried 3 times before giving up");
  assert.ok(!h.handledOrders.has("o3"), "handled un-marked so reconcile can retry DELIVERY");
  assert.ok(h.facilitatedOrders.has("o3"), "still marked facilitated — must not re-pay the sub-hire");
  assert.ok(h.pending.has("o3"), "pending kept so a retry still has context");

  // Now a retry (WS replay / reconcile) lands: must deliver again, must NOT re-hire.
  await h.handlePaidOrder("o3");
  assert.equal(seen.length, 1, "hire STILL called only once across the failed+retry cycle");
  assert.equal(calls.deliver, 6, "delivery attempted again on retry");
}

// ── 4. Already delivered: a post-restart replay must not re-hire or re-deliver ─
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls } = makeClient({
    order: { orderId: "o4", price: "200000", negotiationId: "n4", serviceId: "s4", deliveredAt: "2026-01-01" },
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o4", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o4");

  assert.equal(seen.length, 0, "no hire on an already-delivered order");
  assert.equal(calls.deliver, 0, "no re-delivery on an already-delivered order");
}

// ── 5. Reconcile: recovery sweep delivers discovery-only, NEVER facilitates ───
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls, delivered } = makeClient({
    // The recovered negotiation REQUESTS facilitation (facilitate:true). Without
    // the allowFacilitate=false guard, reconcile would hire — so seen.length===0
    // genuinely pins the guard, not a masked-off req.facilitate.
    negotiation: { requirements: JSON.stringify({ need: "aardvark widget", facilitate: true }) },
    listOrders: [
      { orderId: "r1", price: "200000", negotiationId: "n1", serviceId: "s1", status: "paid" },
      { orderId: "r2", price: "200000", negotiationId: "n2", serviceId: "s2", status: "completed" }, // not undelivered
      { orderId: "r3", price: "0", negotiationId: "n3", serviceId: "s3", status: "delivered", deliveredAt: "x" }, // has deliveredAt
    ],
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  // negotiation recovery supplies the need (no pending entry after a "restart")
  await h.reconcile();

  assert.equal(seen.length, 0, "reconcile must NEVER hire even when the order requested it (non-idempotent spend across restart)");
  assert.equal(calls.deliver, 1, "only the single paid-but-undelivered order (r1) is delivered");
  assert.ok(delivered[0].deliverableText.length > 0, "r1 got a discovery delivery");
}

// ── 6. getOrder fails on live path: still deliver discovery, skip facilitation ─
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls } = makeClient({ getOrderThrows: true });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o6", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o6");

  assert.equal(seen.length, 0, "no facilitation without a known order price (can't bound spend)");
  assert.equal(calls.deliver, 1, "buyer still gets the discovery result");
}

// ── 7. find_match (facilitate=false): match exists but no hire ───────────────
{
  const { hire, seen } = makeHire(FACIL);
  const { client, calls } = makeClient({
    order: { orderId: "o7", price: "200000", negotiationId: "n7", serviceId: "s7" },
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  h.pending.set("o7", { need: "aardvark widget", facilitate: false });
  await h.handlePaidOrder("o7");

  assert.equal(seen.length, 0, "facilitate=false must not hire");
  assert.equal(calls.deliver, 1, "still delivers the discovery result");
}

// ── 8. Self-hire guard: no selfAgentId => facilitation disabled ──────────────
{
  const { hire, seen } = makeHire(FACIL);
  const { client } = makeClient({
    order: { orderId: "o8", price: "200000", negotiationId: "n8", serviceId: "s8" },
  });
  const h = createOrderHandler(client, baseCfg({ hire, selfAgentId: undefined }));
  h.pending.set("o8", { need: "aardvark widget", facilitate: true });
  await h.handlePaidOrder("o8");

  assert.equal(seen.length, 0, "unknown self id disables facilitation (can't exclude self => no hire)");
}

// ── 9. handleNegotiation: accept a valid need, stash the parsed req ───────────
{
  const { hire } = makeHire(FACIL);
  const { client, calls } = makeClient();
  const h = createOrderHandler(client, baseCfg({ hire }));
  await h.handleNegotiation("neg1"); // getNegotiation returns a valid need
  assert.equal(calls.accept, 1, "a valid negotiation is accepted");
  assert.equal(calls.reject, 0, "not rejected");
  assert.ok(h.pending.has("accepted-1"), "parsed req stashed against the new order id");
}

// ── 10. handleNegotiation: reject when there's no need ────────────────────────
{
  const { client, calls, rejected } = makeClient({ negotiation: { requirements: "{}" } });
  const h = createOrderHandler(client, baseCfg());
  await h.handleNegotiation("neg2");
  assert.equal(calls.accept, 0, "a needless negotiation is not accepted");
  assert.equal(calls.reject, 1, "it is rejected");
  assert.ok(/need/i.test(rejected[0]), "reject reason mentions the missing need");
}

// ── 11. handleNegotiation: idempotent (no double-accept on replay) ────────────
{
  const { client, calls } = makeClient();
  const h = createOrderHandler(client, baseCfg());
  await h.handleNegotiation("neg3");
  await h.handleNegotiation("neg3");
  assert.equal(calls.accept, 1, "a replayed NegotiationCreated must not double-accept");
}

// ── 12. handleNegotiation: skip a non-Pending negotiation ─────────────────────
{
  const { client, calls } = makeClient({ negotiation: { status: "accepted", requirements: JSON.stringify({ need: "x" }) } });
  const h = createOrderHandler(client, baseCfg());
  await h.handleNegotiation("neg4");
  assert.equal(calls.accept, 0, "an already-accepted negotiation is not re-accepted");
}

// ── 12b. reconcile: a negotiation-sweep failure must NOT skip the order sweep ──
{
  const { hire } = makeHire(FACIL);
  const { client, calls } = makeClient({
    listNegThrows: true, // negotiation recovery blows up
    listOrders: [{ orderId: "r-decouple", price: "100000", negotiationId: "n", serviceId: "s", status: "paid" }],
  });
  const h = createOrderHandler(client, baseCfg({ hire }));
  await h.reconcile();
  assert.equal(calls.deliver, 1, "paid-order sweep still runs even when the negotiation sweep throws (decoupled nets)");
}

// ── 13. reconcile recovers a missed (still-Pending) negotiation ───────────────
{
  const { client, calls } = makeClient({
    listNegotiations: [{ negotiationId: "recover-neg", status: "pending", requirements: JSON.stringify({ need: "aardvark widget" }) }],
  });
  const h = createOrderHandler(client, baseCfg());
  await h.reconcile();
  assert.equal(calls.accept, 1, "reconcile accepts a negotiation missed during a WS gap");
  assert.ok(h.handledNegotiations.has("recover-neg"), "recovered negotiation is marked handled");
}

console.log(
  "PASS  provider path: happy hire+deliver, idempotent replay, deliver-fail un-marks-but-never-re-hires, " +
    "deliveredAt guard, reconcile never facilitates, getOrder-fail degrades to discovery, find_match no-hire, self-hire guard.",
);
