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
import { renderMarkdown, type JodohResult } from "./report.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

const SELF_ID = process.env.CROO_SERVICE_ID;

const client = new AgentClient(
  {
    baseURL: required("CROO_API_URL"),
    wsURL: required("CROO_WS_URL"),
    rpcURL: process.env.BASE_RPC_URL,
  },
  process.env.CROO_SDK_KEY || required("CROO_API_KEY"),
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
    let req = pending.get(orderId);
    if (!req) {
      // Recover if we missed the negotiation (e.g. restart): order -> negotiation.
      const order = await client.getOrder(orderId);
      const neg = await client.getNegotiation(order.negotiationId);
      req = parseReq(neg.requirements);
    }
    if (!req.need) return;
    console.log(`order ${orderId} paid — matching: "${req.need}"`);

    const catalog = await fetchCatalog(SELF_ID);
    const matches = matchAgents(req.need, catalog);
    const result: JodohResult = { need: req.need, matches };

    if (req.facilitate && matches.length) {
      const f = await facilitate(client, matches[0], req.need);
      if (f) result.facilitated = f;
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
