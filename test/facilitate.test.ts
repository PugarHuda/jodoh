import assert from "node:assert/strict";
import type { Match } from "../src/match.js";

// Shrink the poll windows BEFORE importing facilitate (they're read at module load).
process.env.FACILITATE_ACCEPT_TRIES = "2";
process.env.FACILITATE_DELIVER_TRIES = "1";
const { facilitate } = await import("../src/facilitate.js");

const match: Match = {
  agent: {
    id: "svc1", // catalog stores the serviceId here
    name: "Test Agent",
    description: "",
    tags: [],
    priceFrom: 0.1,
    completion: 100,
    orders: 100,
    serviceId: "svc1",
    agentId: "agent1", // the real owning agent id
    fundTransfer: false,
  },
  score: 100,
  reasons: [],
};

// Fake SDK client: negotiate ok, order appears, pay ok, delivery NEVER lands.
let payCalls = 0;
const client: any = {
  negotiateOrder: async () => ({ negotiationId: "neg1" }),
  // status "created" = payable; facilitate waits for it and filters listOrders by it.
  listOrders: async () => [{ orderId: "ord1", negotiationId: "neg1", price: "100000", status: "created" }],
  getOrder: async () => ({ orderId: "ord1", price: "100000", status: "created" }), // accurate price source
  payOrder: async () => {
    payCalls++;
    return { txHash: "0xabc" };
  },
  getDelivery: async () => null, // delivery times out
};

const res = await facilitate(client, match, "need", 0.25);

// The order was paid — facilitate MUST return a Facilitation so the caller stops
// and never pays a second agent for the same need (the double-spend bug).
assert.ok(res, "paid order must return a Facilitation, not undefined (else caller double-pays)");
assert.equal(payCalls, 1, "pay must happen exactly once");
assert.equal(res!.orderId, "ord1");
assert.equal(res!.payTxHash, "0xabc", "on-chain proof surfaced even when delivery lags");
assert.equal(res!.agentId, "agent1", "reports the real owning agentId, not the serviceId");
assert.equal(res!.deliverable, "", "no deliverable yet — report renders a 'pending' note");

// M1: the guard is the ADVERTISED priceFrom, but the provider sets the ACTUAL
// order price at accept time. An order priced over budget must NOT be paid.
let pay2 = 0;
const pricey: any = {
  negotiateOrder: async () => ({ negotiationId: "neg2" }),
  listOrders: async () => [{ orderId: "ord2", negotiationId: "neg2", price: "0", status: "created" }], // listOrders reports 0
  getOrder: async () => ({ orderId: "ord2", price: "300000", status: "created" }), // real price 0.30 > budget
  payOrder: async () => {
    pay2++;
    return { txHash: "0x" };
  },
  getDelivery: async () => null,
};
const over = await facilitate(pricey, match, "need", 0.25);
assert.equal(over, undefined, "order priced over budget must not be facilitated");
assert.equal(pay2, 0, "payOrder must NOT be called when the actual order price exceeds budget");

// ── Pre-flight guards must short-circuit BEFORE any network/spend ────────────
// A spy client that records whether it was ever touched. facilitate() must never
// negotiate/pay when a match is disqualified up front.
function spyClient(over: any = {}) {
  const calls = { negotiate: 0, pay: 0, getOrder: 0 };
  return {
    calls,
    client: {
      negotiateOrder: async () => {
        calls.negotiate++;
        return { negotiationId: "n" };
      },
      listOrders: async () => [{ orderId: "o", negotiationId: "n", price: "100000", status: "created" }],
      getOrder: async () => {
        calls.getOrder++;
        return over.getOrder === undefined ? { orderId: "o", price: "100000", status: "created" } : over.getOrder;
      },
      payOrder: async () => {
        calls.pay++;
        if (over.payThrows) throw new Error("pay boom");
        return { txHash: "0xok" };
      },
      getDelivery: async () => null,
      ...over.client,
    } as any,
  };
}

// (a) No serviceId — can't hire; must not even negotiate.
{
  const { client, calls } = spyClient();
  const r = await facilitate(client, { ...match, agent: { ...match.agent, serviceId: undefined } }, "need", 0.25);
  assert.equal(r, undefined, "a match without a serviceId can't be hired");
  assert.equal(calls.negotiate, 0, "no negotiation for an unhireable match");
}

// (b) Fund-transfer service — Jodoh can't move the buyer's principal; must not hire.
{
  const { client, calls } = spyClient();
  const r = await facilitate(client, { ...match, agent: { ...match.agent, fundTransfer: true } }, "need", 0.25);
  assert.equal(r, undefined, "a fund-transfer service must not be auto-hired");
  assert.equal(calls.negotiate, 0, "no negotiation for a fund-transfer service");
}

// (c) Catalog price already over budget — skip before spending anything.
{
  const { client, calls } = spyClient();
  const r = await facilitate(client, { ...match, agent: { ...match.agent, priceFrom: 0.5 } }, "need", 0.25);
  assert.equal(r, undefined, "a catalog price over budget must be skipped up front");
  assert.equal(calls.negotiate, 0, "no negotiation when the advertised price already exceeds budget");
}

// (d) getOrder fails after accept — can't bound spend, so must bail before paying.
{
  const { client, calls } = spyClient({ getOrder: undefined, client: { getOrder: async () => undefined } });
  const r = await facilitate(client, match, "need", 0.25);
  assert.equal(r, undefined, "can't confirm price -> must not pay");
  assert.equal(calls.pay, 0, "payOrder must NOT run when the order price can't be fetched");
}

// (e) payOrder fails — no Facilitation (caller then falls back to recommendation).
{
  const { client } = spyClient({ payThrows: true });
  const r = await facilitate(client, match, "need", 0.25);
  assert.equal(r, undefined, "a failed payment must not report a hire");
}

console.log("PASS  facilitate: pays once, no double-spend, real agentId, won't overpay, and every pre-flight guard blocks spend.");
