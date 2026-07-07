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
  listOrders: async () => [{ orderId: "ord1", negotiationId: "neg1" }],
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

console.log("PASS  facilitate: pays once, returns after payment (no double-spend), reports real agentId.");
