import { OrderStatus } from "@croo-network/sdk";
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
export const MAX_HIRE_USDC = 0.25;
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
  maxSpendUsdc: number = MAX_HIRE_USDC,
): Promise<Facilitation | undefined> {
  const serviceId = top.agent.serviceId;
  if (!serviceId) return undefined; // can't hire without a real serviceId
  if (top.agent.fundTransfer) return undefined; // can't move the buyer's principal
  if (top.agent.priceFrom > maxSpendUsdc) return undefined; // over the spend budget

  try {
    // 1) Negotiate. Returns a Negotiation; the order is created only once the
    //    target provider accepts.
    const neg = await client.negotiateOrder({
      serviceId,
      requirements: JSON.stringify({ need: input }),
    });

    // 2) Wait for the provider to accept -> our order to reach the payable
    // "created" state. Filter by status so the default 20-per-page window isn't
    // consumed by our lifetime buyer orders (paid/completed/expired), which would
    // let a fresh order fall off page 1 once we've accumulated >20 orders.
    let orderId: string | undefined;
    for (let i = 0; i < ACCEPT_TRIES; i++) {
      const orders = await client
        .listOrders({ role: "buyer", status: OrderStatus.Created, pageSize: 100 })
        .catch(() => []);
      const order = orders.find((o) => o.negotiationId === neg.negotiationId);
      if (order) {
        orderId = order.orderId;
        break;
      }
      await sleep(2000);
    }
    if (!orderId) {
      console.info(`facilitate: ${serviceId} did not accept within ~${ACCEPT_TRIES * 2}s — skipping`);
      return undefined;
    }

    // Accurate price for the spend cap: listOrders reports "0" for a fresh order, so
    // fetch the real one. Bail on failure — paying without knowing the price would
    // silently defeat the cap (Jodoh's exposure guarantee).
    const full = await client.getOrder(orderId).catch(() => undefined);
    if (!full) {
      console.error(`facilitate: getOrder failed for sub-order ${orderId} — bailing before pay`);
      return undefined;
    }
    const orderPriceUsdc = Number(full.price) / 1e6;
    // Spend cap on the ACTUAL order price (a misconfigured/malicious provider could
    // set it above the catalog floor). Bails on NaN too.
    if (!(orderPriceUsdc <= maxSpendUsdc)) {
      console.warn(`facilitate: sub-order ${orderId} priced ${orderPriceUsdc} > budget ${maxSpendUsdc} — skipping`);
      return undefined;
    }

    // 3) Pay into escrow (USDC on Base; gas sponsored by CROO). Backend pre-checks
    //    the wallet balance and throws if underfunded — log it (a dry wallet would
    //    otherwise silently degrade every hire to recommendation-only).
    const pay = await client.payOrder(orderId).catch((e) => {
      console.error(`facilitate: payOrder FAILED for sub-order ${orderId} (${orderPriceUsdc} USDC) — insufficient funds or chain error:`, e);
      return undefined;
    });
    if (!pay) return undefined;
    const payTxHash = pay.txHash ?? "";
    console.log(`facilitate: hired ${serviceId} — sub-order ${orderId} paid ${orderPriceUsdc} USDC (tx ${payTxHash}), awaiting delivery`);

    // 4) Poll for the delivered result. The order is ALREADY PAID here, so we must
    //    NOT return undefined on a slow delivery: the caller reads undefined as
    //    "not hired" and pays the NEXT match for the same need (double-spend). The
    //    pay tx hash is the on-chain proof of the hire; a real agent may deliver
    //    on its SLA (up to ~30min), after Jodoh has already returned to the buyer.
    let deliverable = "";
    for (let i = 0; i < DELIVER_TRIES; i++) {
      const d = await client.getDelivery(orderId).catch(() => null);
      if (d?.deliverableText) {
        deliverable = d.deliverableText;
        break;
      }
      await sleep(2000);
    }
    if (!deliverable) {
      console.warn(
        `⚠️  facilitate: sub-order ${orderId} PAID (${orderPriceUsdc} USDC) but UNDELIVERED after ~${DELIVER_TRIES * 2}s — funds at risk until the provider delivers or the order expires (escrow refunds).`,
      );
    }

    const rake = +(top.agent.priceFrom * RAKE_RATE).toFixed(4);
    // agent.id holds the serviceId (see catalog.ts); report the real owning agentId.
    return { agentId: top.agent.agentId ?? top.agent.id, orderId, payTxHash, rake, deliverable };
  } catch (err) {
    console.warn(`facilitation failed for service ${serviceId}, returning recommendation only:`, err);
    return undefined;
  }
}
