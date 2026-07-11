// The provider order-handling core, isolated from the live-daemon wiring in
// agent.ts so it can be unit-tested with a mock client (no WS, no network, no
// real on-chain spend). agent.ts is now a thin wire: env -> createOrderHandler ->
// stream.on. Every guard/comment here encodes a real, previously-shipped bug fix;
// don't drop them.
import { DeliverableType, OrderStatus, NegotiationStatus } from "@croo-network/sdk";
import type { AgentClient, Order, Negotiation } from "@croo-network/sdk";
import { fetchCatalog, type AgentEntry } from "./catalog.js";
import { matchAgents } from "./match.js";
import { facilitate, MAX_HIRE_USDC } from "./facilitate.js";
import { shouldFacilitate, hireBudget } from "./routing.js";
import { renderMarkdown, type JodohResult } from "./report.js";

export interface Req {
  need?: string;
  facilitate?: boolean;
}

// Requirements is a string on the Negotiation — usually JSON, but accept a bare
// string as the need too.
export function parseReq(requirements: string | undefined): Req {
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

const realSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reconcile sweeps these: paid but not yet delivered.
const UNDELIVERED = new Set<string>([
  OrderStatus.Paid,
  OrderStatus.Delivering,
  OrderStatus.DeliverFailed,
]);

export interface HandlerConfig {
  selfAgentId?: string;
  hireId?: string;
  findServiceId?: string;
  // Test seams — production defaults hit the real deps. Overridden in unit tests
  // so the order-handling logic runs with no network / no real spend / no waits.
  loadCatalog?: (self?: string, exclude?: (string | undefined)[]) => Promise<AgentEntry[]>;
  hire?: typeof facilitate;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Build the provider order handlers over a client + config. Holds the per-process
 * idempotency state (pending / handledOrders / facilitatedOrders); returns the
 * two entry points (handlePaidOrder, reconcile) plus that state for inspection.
 */
export function createOrderHandler(client: AgentClient, cfg: HandlerConfig = {}) {
  const { selfAgentId, hireId, findServiceId } = cfg;
  const loadCatalog = cfg.loadCatalog ?? fetchCatalog;
  const hire = cfg.hire ?? facilitate;
  const sleep = cfg.sleep ?? realSleep;

  // Requirements arrive at negotiation time; the paid event only carries order_id.
  // Stash the parsed need against the order id so we have it when payment lands.
  const pending = new Map<string, Req>();
  // Orders currently being processed / delivered — guards against re-running work.
  // Cleared on a failure path so reconcile/replay can retry DELIVERY.
  const handledOrders = new Set<string>();
  // Orders we already PAID a sub-hire for. Separate from handledOrders so that
  // clearing handledOrders to retry a failed DELIVERY can never re-trigger a second
  // on-chain facilitation payment. Never cleared within a process run.
  const facilitatedOrders = new Set<string>();
  // Negotiations already accepted/rejected — guards the WS handler and the recovery
  // sweep from double-accepting the same negotiation.
  const handledNegotiations = new Set<string>();

  // Accept (or reject) a negotiation: parse the need, reject if absent, else accept
  // and stash the parsed requirements against the new order id. Shared by the live
  // WS NegotiationCreated handler and the recovery sweep (a negotiation that arrived
  // while the WS was down would otherwise be silently dropped and never become an
  // order). knownNeg is supplied by the sweep (from listNegotiations) to skip a fetch.
  async function handleNegotiation(negId: string, knownNeg?: Negotiation) {
    if (handledNegotiations.has(negId)) return;
    handledNegotiations.add(negId);
    try {
      const neg = knownNeg ?? (await client.getNegotiation(negId));
      // Raced: another path (or a past run) already resolved it. Leave it marked.
      if (neg.status && neg.status !== NegotiationStatus.Pending) return;
      const req = parseReq(neg.requirements);
      if (!req.need) {
        await client.rejectNegotiation(negId, "missing 'need' in requirements");
        return;
      }
      // hire_match orders force facilitation; find_match respects the flag.
      req.facilitate = shouldFacilitate(!!req.facilitate, neg.serviceId, hireId);
      const res = await client.acceptNegotiation(negId);
      pending.set(res.order.orderId, req);
      console.log(`accepted negotiation ${negId} -> order ${res.order.orderId}`);
    } catch (err) {
      handledNegotiations.delete(negId); // transient failure — allow a later retry
      console.error("negotiation handler error:", err);
    }
  }

  // Recover negotiations that arrived while the WS was disconnected: the event was
  // never delivered, so without this sweep the buyer's request is dropped and never
  // becomes an order. Walk the still-Pending provider negotiations and handle them.
  async function reconcileNegotiations() {
    const negs: Negotiation[] = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await client.listNegotiations({
        role: "provider",
        status: NegotiationStatus.Pending,
        page,
        pageSize: 100,
      });
      negs.push(...batch);
      if (!batch.length) break;
    }
    for (const n of negs) {
      if (handledNegotiations.has(n.negotiationId)) continue;
      console.log(`reconcile: recovering un-accepted negotiation ${n.negotiationId}`);
      await handleNegotiation(n.negotiationId, n).catch((err) =>
        console.error(`reconcile: negotiation ${n.negotiationId} failed:`, err),
      );
    }
  }

  // allowFacilitate=false is passed by reconcile: paying a sub-order is not
  // idempotent across a restart (in-memory state is lost), so the recovery sweep
  // must never re-facilitate — it delivers discovery-only. Live WS handling is the
  // only path that hires, exactly once (guarded by handledOrders).
  async function handlePaidOrder(orderId: string, knownOrder?: Order, allowFacilitate = true) {
    // Idempotency: skip a replayed OrderPaid (WS buffer) or an order the reconcile
    // sweep already picked up, so we never double-hire / double-pay.
    if (handledOrders.has(orderId)) return;
    handledOrders.add(orderId);
    const order =
      knownOrder ??
      (await client.getOrder(orderId).catch((e) => {
        console.error(`getOrder failed for ${orderId} — facilitation skipped (can't bound spend):`, e);
        return undefined;
      }));
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
      try {
        const neg = await client.getNegotiation(order.negotiationId);
        req = parseReq(neg.requirements);
        req.facilitate = shouldFacilitate(!!req.facilitate, order.serviceId, hireId);
      } catch (e) {
        // Transient fetch failure — un-mark so a replay/reconcile can retry
        // instead of the order being stuck as "handled" forever.
        handledOrders.delete(orderId);
        console.error(`recover requirements failed for order ${orderId}:`, e);
        return;
      }
    }
    if (!req.need) {
      handledOrders.delete(orderId); // nothing to do; allow a retry if req arrives later
      return;
    }
    console.log(`order ${orderId} paid — matching: "${req.need}"`);

    const catalog = await loadCatalog(selfAgentId, [findServiceId, hireId]);
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
    // buyer's own funds. Bounded by topN (matchAgents default 5). Matters most for hire_match,
    // which charged a premium on the promise of a hire.
    if (req.facilitate && matches.length && selfAgentId && allowFacilitate && order && !facilitatedOrders.has(orderId)) {
      // Never front more than Jodoh earned on this order (bounded by MAX_HIRE_USDC).
      // Requires `order` (accurate price) — without it we can't bound spend, so skip.
      const budget = hireBudget(Number(order.price) / 1e6, MAX_HIRE_USDC);
      for (const m of matches) {
        const f = await hire(client, m, req.need, budget);
        if (f) {
          result.facilitated = f;
          facilitatedOrders.add(orderId); // paid a sub-hire — never facilitate this order again
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
      console.error(`⚠️  order ${orderId} PAID but UNDELIVERED after retries — reconcile will retry delivery.`);
      // Un-mark so reconcile (and a WS replay) can retry DELIVERY. A second
      // facilitation is impossible: it's guarded by facilitatedOrders above.
      handledOrders.delete(orderId);
      return; // keep pending so a retry still has the context
    }
    pending.delete(orderId);
    console.log(
      `delivered order ${orderId} — ${matches.length} matches` +
        (result.facilitated ? `, hired ${result.facilitated.agentId}` : ""),
    );
  }

  // Reconcile missed events: if the WS was briefly disconnected, an OrderPaid can
  // arrive with nobody listening — the buyer paid and Jodoh would never deliver.
  // Sweep provider orders that are paid but not yet delivered and process any not
  // already delivered. allowFacilitate=false: recovery never re-hires (non-idempotent).
  async function reconcile() {
    try {
      // First recover any negotiations missed during a WS gap (accepting them
      // creates the orders the order-sweep below then processes).
      await reconcileNegotiations();
      // Walk ALL pages — a stuck order past page 1 must still be swept (no .catch(()
      // => []) here: a persistent listOrders failure must surface via the outer catch,
      // not silently disable the whole recovery net).
      const orders: Order[] = [];
      for (let page = 1; page <= 50; page++) {
        const batch = await client.listOrders({ role: "provider", page, pageSize: 100 });
        orders.push(...batch);
        // Stop only on an empty page — NOT on `< pageSize`. The server may clamp
        // pageSize (the sibling public API caps at 50), so a short-but-nonempty page
        // is normal and a stuck order on a later page must still be swept.
        if (!batch.length) break;
      }
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

  return { handlePaidOrder, handleNegotiation, reconcile, pending, handledOrders, facilitatedOrders, handledNegotiations };
}
