import type { Match } from "./match.js";

// Facilitation is Jodoh's wedge over plain discovery: it doesn't just recommend
// a match — it HIRES the matched agent on the buyer's behalf and returns the
// result, taking a rake. This makes Jodoh a real buyer of other agents, which is
// exactly the A2A composability the hackathon rewards.
//
// Requires a real CROO serviceId on the matched agent (from a live CROO_CATALOG_URL
// feed). Seed entries have none, so facilitation degrades to recommendation-only.

const RAKE_RATE = 0.15; // Jodoh keeps 15% of the sub-order price as its fee.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Facilitation {
  agentId: string;
  orderId: string;
  rake: number;
  deliverable: string;
}

export async function facilitate(
  client: any,
  top: Match,
  input: string,
): Promise<Facilitation | undefined> {
  const serviceId = top.agent.serviceId;
  if (!serviceId) return undefined; // can't hire without a real serviceId

  try {
    // 1) Negotiate an order with the matched provider.
    const neg = await client.negotiateOrder({
      serviceId,
      requirements: JSON.stringify({ need: input }),
    });
    // The provider accepts on its side, creating the order. Its id may come back
    // on the negotiation result or on the order object.
    const orderId =
      neg?.order?.orderId ?? neg?.order?.order_id ?? neg?.order_id ?? neg?.orderId;
    if (!orderId) return undefined;

    // 2) Pay into escrow (USDC on Base; gas sponsored by CROO).
    await client.payOrder(orderId);

    // 3) Poll for the delivered result.
    let deliverable = "";
    for (let i = 0; i < 10; i++) {
      const d = await client.getDelivery(orderId).catch(() => null);
      if (d?.deliverableText) {
        deliverable = String(d.deliverableText);
        break;
      }
      await sleep(2000);
    }
    if (!deliverable) return undefined;

    const rake = +(top.agent.priceFrom * RAKE_RATE).toFixed(4);
    return { agentId: top.agent.id, orderId: String(orderId), rake, deliverable };
  } catch (err) {
    console.warn(`facilitation failed, returning recommendation only: ${String(err)}`);
    return undefined;
  }
}
