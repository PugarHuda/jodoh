// CAP provider: turns Jodoh into a paid, callable matchmaking agent.
//
// Lifecycle (CROO Agent Protocol), wired to the installed @croo-network/sdk types:
//   NegotiationCreated -> getNegotiation (for requirements) -> acceptNegotiation
//   OrderPaid          -> match -> (optional) hire best match -> deliverOrder
//
// The buyer's input lives on the Negotiation object (event carries only ids), so
// we fetch it with getNegotiation. The matching engine (src/match.ts,
// src/catalog.ts) is SDK-independent and unit-tested.
import "dotenv/config";
import { AgentClient, EventType, DeliverableType, OrderStatus } from "@croo-network/sdk";
import type { Order } from "@croo-network/sdk";
import { fetchCatalog } from "./catalog.js";
import { matchAgents } from "./match.js";
import { facilitate, MAX_HIRE_USDC } from "./facilitate.js";
import { shouldFacilitate, hireBudget } from "./routing.js";
import { renderMarkdown, type JodohResult } from "./report.js";
import { safeLogger } from "./log.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

// Jodoh's own agent id. fetchCatalog excludes every service under it, so Jodoh
// never matches — or hires — any of its own services (find_match, hire_match, …).
// Self-trade is disqualifying and could recurse. If unset we can't identify
// ourselves, so facilitation is disabled below rather than risk a self-hire.
const SELF_AGENT_ID = process.env.CROO_AGENT_ID;
// hire_match: ordering this service forces a hire regardless of the buyer's flag.
const HIRE_ID = process.env.CROO_HIRE_SERVICE_ID;
if (!SELF_AGENT_ID) {
  console.warn(
    "⚠️  CROO_AGENT_ID not set — can't exclude Jodoh from its own catalog; " +
      "facilitation is DISABLED to avoid self-trade. Set it (your agent id) after registering.",
  );
}

const client = new AgentClient(
  {
    baseURL: required("CROO_API_URL"),
    wsURL: required("CROO_WS_URL"),
    rpcURL: process.env.BASE_RPC_URL,
    logger: safeLogger, // scrub the SDK key out of the logged ws url
  },
  required("CROO_SDK_KEY"),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Req {
  need?: string;
  facilitate?: boolean;
}

// Requirements is a string on the Negotiation — usually JSON, but accept a bare
// string as the need too.
function parseReq(requirements: string | undefined): Req {
  if (!requirements) return {};
  try {
    const p = JSON.parse(requirements);
    const raw = p.need ?? p.query ?? p.input;
    // Coerce to string: a buyer sending {"need": 123} or {"need": {}} must not
    // crash matchAgents (.toLowerCase on a non-string) and brick their paid order.
    const need = raw == null ? undefined : String(raw).trim() || undefined;
    return { need, facilitate: !!p.facilitate };
  } catch {
    return { need: requirements.trim() || undefined };
  }
}

// Requirements arrive at negotiation time; the paid event only carries order_id.
// Stash the parsed need against the order id so we have it when payment lands.
const pending = new Map<string, Req>();

// Orders already handled — a replayed OrderPaid (WS reconnect/buffer) must not
// re-run matching or, worse, facilitate and PAY a sub-order a second time.
const handledOrders = new Set<string>();

const stream = await client.connectWebSocket();

stream.on(EventType.NegotiationCreated, async (e) => {
  try {
    const negId = e.negotiation_id!;
    const neg = await client.getNegotiation(negId);
    const req = parseReq(neg.requirements);
    if (!req.need) {
      await client.rejectNegotiation(negId, "missing 'need' in requirements");
      return;
    }
    // hire_match orders force facilitation; find_match respects the flag.
    req.facilitate = shouldFacilitate(!!req.facilitate, neg.serviceId, HIRE_ID);
    const res = await client.acceptNegotiation(negId);
    pending.set(res.order.orderId, req);
    console.log(`accepted negotiation ${negId} -> order ${res.order.orderId}`);
  } catch (err) {
    console.error("negotiation handler error:", err);
  }
});

// allowFacilitate=false is passed by reconcile: paying a sub-order is not
// idempotent across a restart (in-memory state is lost), so the recovery sweep
// must never re-facilitate — it delivers discovery-only. Live WS handling is the
// only path that hires, exactly once (guarded by handledOrders).
async function handlePaidOrder(orderId: string, knownOrder?: Order, allowFacilitate = true) {
    // Idempotency: skip a replayed OrderPaid (WS buffer) or an order the reconcile
    // sweep already picked up, so we never double-hire / double-pay.
    if (handledOrders.has(orderId)) return;
    handledOrders.add(orderId);
    const order = knownOrder ?? (await client.getOrder(orderId).catch(() => undefined));
    // Already delivered? A replayed OrderPaid after a restart (in-memory
    // handledOrders lost) must not re-hire a sub-agent or re-deliver.
    if (order?.deliveredAt) return;
    let req = pending.get(orderId);
    if (!req) {
      // Recover if we missed the negotiation (e.g. restart): order -> negotiation.
      // No context yet and nothing paid out here — un-mark so a later replay/sweep
      // can retry instead of the order being permanently stuck as "handled".
      if (!order) {
        handledOrders.delete(orderId);
        return;
      }
      const neg = await client.getNegotiation(order.negotiationId);
      req = parseReq(neg.requirements);
      req.facilitate = shouldFacilitate(!!req.facilitate, order.serviceId, HIRE_ID);
    }
    if (!req.need) {
      handledOrders.delete(orderId); // nothing to do; allow a retry if req arrives later
      return;
    }
    console.log(`order ${orderId} paid — matching: "${req.need}"`);

    const catalog = await fetchCatalog(SELF_AGENT_ID);
    const matches = matchAgents(req.need, catalog);
    const result: JodohResult = {
      need: req.need,
      matches,
      facilitateRequested: !!req.facilitate,
    };

    // Only facilitate when we know our own agent id (so the catalog excluded all
    // our services) — otherwise we might hire ourselves. Guarded above.
    // Hire the top match that's actually hireable: facilitate() fast-returns
    // (no polling) for fund-transfer / no-serviceId / over-cap matches, so this
    // skips to the first flat-fee candidate instead of failing when #1 needs the
    // buyer's own funds. Bounded by topN (<=3). Matters most for hire_match,
    // which charged a premium on the promise of a hire.
    if (req.facilitate && matches.length && SELF_AGENT_ID && allowFacilitate) {
      // Never front more than Jodoh earned on this order (bounded by MAX_HIRE_USDC).
      const budget = hireBudget(order ? Number(order.price) / 1e6 : undefined, MAX_HIRE_USDC);
      for (const m of matches) {
        const f = await facilitate(client, m, req.need, budget);
        if (f) {
          result.facilitated = f;
          break;
        }
      }
    }

    // Delivery is the buyer's payoff and the order is ALREADY paid. The order is
    // marked handled, so a replayed OrderPaid won't retry — a transient POST
    // failure would silently lose the result. Retry a few times before giving up.
    // ponytail: 3 in-memory retries; a durable outbox would survive a crash too.
    const deliverableText = renderMarkdown(result);
    let delivered = false;
    for (let i = 0; i < 3; i++) {
      try {
        await client.deliverOrder(orderId, {
          deliverableType: DeliverableType.Text,
          deliverableText,
        });
        delivered = true;
        break;
      } catch (e) {
        console.error(`deliver attempt ${i + 1}/3 failed for order ${orderId}:`, e);
        if (i < 2) await sleep(2000);
      }
    }
    if (!delivered) {
      console.error(`⚠️  order ${orderId} PAID but UNDELIVERED after retries — re-deliver manually.`);
      return; // keep pending entry so a manual re-deliver still has the context
    }
    pending.delete(orderId);
    console.log(
      `delivered order ${orderId} — ${matches.length} matches` +
        (result.facilitated ? `, hired ${result.facilitated.agentId}` : ""),
    );
}

stream.on(EventType.OrderPaid, async (e) => {
  try {
    await handlePaidOrder(e.order_id!);
  } catch (err) {
    console.error("orderPaid handler error:", err);
  }
});

// Reconcile missed events: if the WS was briefly disconnected, an OrderPaid can
// arrive with nobody listening — the buyer paid and Jodoh would never deliver.
// Sweep provider orders that are paid but not yet delivered (paid / delivering /
// deliver_failed) and process any not already delivered. Runs on startup + on an
// interval. allowFacilitate=false: recovery never re-hires (non-idempotent spend).
// ponytail: 60s poll; tighten if orders must clear faster.
const UNDELIVERED = new Set<string>([
  OrderStatus.Paid,
  OrderStatus.Delivering,
  OrderStatus.DeliverFailed,
]);
async function reconcile() {
  try {
    const orders = await client.listOrders({ role: "provider" }).catch(() => []);
    const stuck = orders.filter(
      (o) => UNDELIVERED.has(o.status) && !o.deliveredAt && !handledOrders.has(o.orderId),
    );
    for (const o of stuck) {
      console.log(`reconcile: recovering paid-but-undelivered order ${o.orderId} (${o.status})`);
      await handlePaidOrder(o.orderId, o, false).catch((err) =>
        console.error(`reconcile: order ${o.orderId} failed:`, err),
      );
    }
  } catch (err) {
    console.error("reconcile error:", err);
  }
}

console.log("Jodoh matchmaking agent online. Waiting for CAP orders…");

// Catch anything paid while we weren't listening, then keep sweeping.
await reconcile();
setInterval(reconcile, 60_000);
