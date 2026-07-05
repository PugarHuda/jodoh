import type { AgentClient } from "@croo-network/sdk";
import type { Match } from "./match.js";

// Facilitation is Jodoh's wedge over plain discovery: it doesn't just recommend
// a match — it HIRES the matched agent on the buyer's behalf and returns the
// result, taking a rake. This makes Jodoh a real buyer of other agents, which is
// exactly the A2A composability the hackathon rewards.
//
// Flow (requester side): negotiateOrder -> the target provider accepts, which
// creates an order for our negotiation -> we find that order, pay it, and poll
// for delivery. Requires a real CROO serviceId on the matched agent (from a live
// CROO_CATALOG_URL feed); seed entries have none, so it degrades to
// recommendation-only.

const RAKE_RATE = 0.15; // Jodoh keeps 15% of the sub-order price as its fee.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Facilitation {
  agentId: string;
  orderId: string;
  rake: number;
  deliverable: string;
}

export async function facilitate(
  client: AgentClient,
  top: Match,
  input: string,
): Promise<Facilitation | undefined> {
  const serviceId = top.agent.serviceId;
  if (!serviceId) return undefined; // can't hire without a real serviceId

  try {
    // 1) Negotiate. Returns a Negotiation; the order is created only once the
    //    target provider accepts.
    const neg = await client.negotiateOrder({
      serviceId,
      requirements: JSON.stringify({ need: input }),
    });

    // 2) Wait for the provider to accept -> our order to appear.
    let orderId: string | undefined;
    for (let i = 0; i < 15; i++) {
      const orders = await client.listOrders().catch(() => []);
      const order = orders.find((o) => o.negotiationId === neg.negotiationId);
      if (order) {
        orderId = order.orderId;
        break;
      }
      await sleep(2000);
    }
    if (!orderId) return undefined;

    // 3) Pay into escrow (USDC on Base; gas sponsored by CROO).
    await client.payOrder(orderId);

    // 4) Poll for the delivered result.
    let deliverable = "";
    for (let i = 0; i < 15; i++) {
      const d = await client.getDelivery(orderId).catch(() => null);
      if (d?.deliverableText) {
        deliverable = d.deliverableText;
        break;
      }
      await sleep(2000);
    }
    if (!deliverable) return undefined;

    const rake = +(top.agent.priceFrom * RAKE_RATE).toFixed(4);
    return { agentId: top.agent.id, orderId, rake, deliverable };
  } catch (err) {
    console.warn(`facilitation failed, returning recommendation only: ${String(err)}`);
    return undefined;
  }
}
