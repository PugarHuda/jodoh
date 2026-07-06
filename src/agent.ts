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
import { AgentClient, EventType, DeliverableType } from "@croo-network/sdk";
import { fetchCatalog } from "./catalog.js";
import { matchAgents } from "./match.js";
import { facilitate } from "./facilitate.js";
import { shouldFacilitate } from "./routing.js";
import { renderMarkdown, type JodohResult } from "./report.js";

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
  },
  required("CROO_SDK_KEY"),
);

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
    return { need: p.need ?? p.query ?? p.input, facilitate: !!p.facilitate };
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

stream.on(EventType.OrderPaid, async (e) => {
  try {
    const orderId = e.order_id!;
    // Idempotency: skip a replayed OrderPaid so we never double-hire / double-pay.
    if (handledOrders.has(orderId)) return;
    handledOrders.add(orderId);
    let req = pending.get(orderId);
    if (!req) {
      // Recover if we missed the negotiation (e.g. restart): order -> negotiation.
      const order = await client.getOrder(orderId);
      const neg = await client.getNegotiation(order.negotiationId);
      req = parseReq(neg.requirements);
      req.facilitate = shouldFacilitate(!!req.facilitate, order.serviceId, HIRE_ID);
    }
    if (!req.need) return;
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
    if (req.facilitate && matches.length && SELF_AGENT_ID) {
      for (const m of matches) {
        const f = await facilitate(client, m, req.need);
        if (f) {
          result.facilitated = f;
          break;
        }
      }
    }

    await client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: renderMarkdown(result),
    });
    pending.delete(orderId);
    console.log(
      `delivered order ${orderId} — ${matches.length} matches` +
        (result.facilitated ? `, hired ${result.facilitated.agentId}` : ""),
    );
  } catch (err) {
    console.error("orderPaid handler error:", err);
  }
});

console.log("Jodoh matchmaking agent online. Waiting for CAP orders…");
