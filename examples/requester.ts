// Buyer simulator — hires Jodoh over CAP so you can demo the full lifecycle:
//   negotiate -> (Jodoh accepts) OrderCreated -> pay -> OrderCompleted -> download
//
// Set CROO_TARGET_SERVICE_ID to Jodoh's `find_match` service id, then:
//   npm run buyer -- "audit my smart contract for vulnerabilities"
import "dotenv/config";
import { safeLogger } from "../src/log.js";
import { AgentClient, EventType } from "@croo-network/sdk";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

// The buyer must be a DIFFERENT identity from Jodoh, or the platform sees a
// self-order (likely rejected) and it's self-trade — ineligible for rewards and
// worthless as a unique-buyer count. Set BUYER_SDK_KEY to another agent's key for
// a real counterparty; falls back to CROO_SDK_KEY only for a local flow check.
const buyerKey = process.env.BUYER_SDK_KEY || required("CROO_SDK_KEY");
if (!process.env.BUYER_SDK_KEY) {
  console.warn(
    "⚠️  BUYER_SDK_KEY not set — using Jodoh's own key. This is a SELF-ORDER: fine\n" +
      "    for a local flow check, but the platform may reject it and it does NOT\n" +
      "    count toward reward eligibility. Use a separate agent's key for a real buyer.",
  );
}

const client = new AgentClient(
  {
    baseURL: required("CROO_API_URL"),
    wsURL: required("CROO_WS_URL"),
    rpcURL: process.env.BASE_RPC_URL,
    logger: safeLogger,
  },
  buyerKey,
);

const serviceId = required("CROO_TARGET_SERVICE_ID");
const need = process.argv.slice(2).join(" ").trim() || "audit my smart contract for vulnerabilities";
const facilitate = process.env.FACILITATE === "1";

const stream = await client.connectWebSocket();

stream.on(EventType.OrderCreated, async (e: any) => {
  console.log(`order ${e.order_id} created — paying…`);
  await client.payOrder(e.order_id);
});

stream.on(EventType.OrderCompleted, async (e: any) => {
  const delivery: any = await client.getDelivery(e.order_id);
  console.log("\n=== Jodoh delivered ===\n");
  console.log(delivery.deliverableText);
  process.exit(0);
});

console.log(`facilitate (hire the match on-chain): ${facilitate ? "ON" : "off"}`);
const neg: any = await client.negotiateOrder({
  serviceId,
  requirements: JSON.stringify({ need, facilitate }),
});
console.log(`negotiation sent for: "${need}"`, neg?.negotiationId ?? "");
