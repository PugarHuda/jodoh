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

const RAKE_RATE = 0.15; // Quoted facilitation fee (15% of sub-order price).
// Safety cap: Jodoh fronts the sub-order from its OWN wallet on a flat-fee model,
// so bound the spend. The rake is a QUOTED fee, not an on-chain collection today —
// net-positive facilitation needs a require_fund_transfer service where the buyer
// supplies the principal (see README). MAX_HIRE_USDC bounds Jodoh's own exposure.
const MAX_HIRE_USDC = 0.25;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Real Store agents run to an SLA (< 30 min), not seconds. Poll long enough that a
// genuine counterparty can accept and deliver; overridable for slower services.
// ponytail: fixed poll budget; raise the env knobs if you hire slow agents.
const ACCEPT_TRIES = Number(process.env.FACILITATE_ACCEPT_TRIES) || 20; // ~40s
const DELIVER_TRIES = Number(process.env.FACILITATE_DELIVER_TRIES) || 90; // ~3min

export interface Facilitation {
  agentId: string;
  orderId: string;
  payTxHash: string; // on-chain proof of the A2A order (Base); "" if unavailable
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
  if (top.agent.fundTransfer) return undefined; // can't move the buyer's principal
  if (top.agent.priceFrom > MAX_HIRE_USDC) return undefined; // over the spend cap

  try {
    // 1) Negotiate. Returns a Negotiation; the order is created only once the
    //    target provider accepts.
    const neg = await client.negotiateOrder({
      serviceId,
      requirements: JSON.stringify({ need: input }),
    });

    // 2) Wait for the provider to accept -> our order to appear.
    let orderId: string | undefined;
    for (let i = 0; i < ACCEPT_TRIES; i++) {
      // We are the buyer/requester of this sub-order. role is required by the API.
      const orders = await client.listOrders({ role: "buyer" }).catch(() => []);
      const order = orders.find((o) => o.negotiationId === neg.negotiationId);
      if (order) {
        orderId = order.orderId;
        break;
      }
      await sleep(2000);
    }
    if (!orderId) return undefined;

    // 3) Pay into escrow (USDC on Base; gas sponsored by CROO). Capture the tx
    //    hash — this is the on-chain proof that Jodoh really hired another agent.
    const pay = await client.payOrder(orderId).catch(() => undefined);
    const payTxHash = pay?.txHash ?? "";

    // 4) Poll for the delivered result.
    let deliverable = "";
    for (let i = 0; i < DELIVER_TRIES; i++) {
      const d = await client.getDelivery(orderId).catch(() => null);
      if (d?.deliverableText) {
        deliverable = d.deliverableText;
        break;
      }
      await sleep(2000);
    }
    if (!deliverable) return undefined;

    const rake = +(top.agent.priceFrom * RAKE_RATE).toFixed(4);
    return { agentId: top.agent.id, orderId, payTxHash, rake, deliverable };
  } catch (err) {
    console.warn(`facilitation failed, returning recommendation only: ${String(err)}`);
    return undefined;
  }
}
