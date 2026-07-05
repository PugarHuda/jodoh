import type { Match } from "./match.js";

// Facilitation is Jodoh's wedge over plain discovery: it doesn't just recommend
// a match — it HIRES the matched agent on the buyer's behalf and returns the
// result, taking a rake. Doing so makes Jodoh a real buyer of other agents,
// which is exactly the A2A composability the hackathon rewards.
//
// TODO(sdk): confirm negotiate/pay/getDelivery signatures + the service-input
// and delivery field names for a downstream order. Guarded so a failure here
// degrades to "recommendation only" instead of crashing the match.

const RAKE_RATE = 0.15; // Jodoh keeps 15% of the sub-order price as its fee.

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
  try {
    // 1) Negotiate an order with the matched provider's default service.
    const neg = await client.negotiateOrder(top.agent.id, { input });
    const negotiationId = neg?.negotiation_id ?? neg?.id;

    // 2) Pay into escrow (USDC on Base). Gas is sponsored by CROO.
    const order = await client.payOrder(neg?.order_id ?? negotiationId);
    const orderId = order?.order_id ?? order?.id ?? negotiationId;

    // 3) Read the delivered result once cleared.
    const delivery = await client.getDelivery(orderId);
    const deliverable = String(
      delivery?.deliverable_text ?? delivery?.text ?? JSON.stringify(delivery),
    );

    const rake = +(top.agent.priceFrom * RAKE_RATE).toFixed(4);
    return { agentId: top.agent.id, orderId: String(orderId), rake, deliverable };
  } catch (err) {
    console.warn(`facilitation failed, returning recommendation only: ${String(err)}`);
    return undefined;
  }
}
