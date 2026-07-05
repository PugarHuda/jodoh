// CAP provider: turns Jodoh into a paid, callable matchmaking agent.
//
// Lifecycle (CROO Agent Protocol), wired to the official @croo-network/sdk shapes:
//   NegotiationCreated -> acceptNegotiation, stash the buyer's need by order id
//   OrderPaid          -> match -> (optional) hire best match -> deliverOrder
//
// The matching engine (src/match.ts, src/catalog.ts) is SDK-independent and
// unit-tested. This adapter mirrors examples/provider.ts from the CROO node-sdk.
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

// Buyer sends a JSON string in `requirements`, e.g. '{"need":"...","facilitate":true}'.
function parseReq(e: any): Req {
  const raw = e?.requirements ?? e?.payload ?? "";
  if (typeof raw === "object") return { need: raw.need ?? raw.query, facilitate: !!raw.facilitate };
  try {
    const p = JSON.parse(raw);
    return { need: p.need ?? p.query ?? p.input, facilitate: !!p.facilitate };
  } catch {
    return { need: typeof raw === "string" && raw.trim() ? raw : undefined };
  }
}

// Requirements arrive at negotiation time; the paid event only carries order_id.
// Stash the parsed need against the order id so we have it when payment lands.
const pending = new Map<string, Req>();

const stream = await client.connectWebSocket();

stream.on(EventType.NegotiationCreated, async (e: any) => {
  const req = parseReq(e);
  if (!req.need) {
    await client.rejectNegotiation(e.negotiation_id, "missing 'need' in requirements");
    return;
  }
  const res: any = await client.acceptNegotiation(e.negotiation_id);
  const orderId = res?.order?.orderId ?? res?.order?.order_id;
  if (orderId) pending.set(String(orderId), req);
  console.log(`accepted negotiation ${e.negotiation_id} -> order ${orderId}`);
});

stream.on(EventType.OrderPaid, async (e: any) => {
  const req = pending.get(String(e.order_id)) ?? parseReq(e);
  if (!req.need) return;
  console.log(`order ${e.order_id} paid — matching: "${req.need}"`);

  const catalog = await fetchCatalog(SELF_ID);
  const matches = matchAgents(req.need, catalog);
  const result: JodohResult = { need: req.need, matches };

  if (req.facilitate && matches.length) {
    const f = await facilitate(client, matches[0], req.need);
    if (f) result.facilitated = f;
  }

  await client.deliverOrder(e.order_id, {
    deliverableType: DeliverableType.Text,
    deliverableText: renderMarkdown(result),
  });
  pending.delete(String(e.order_id));
  console.log(
    `delivered order ${e.order_id} — ${matches.length} matches` +
      (result.facilitated ? `, hired ${result.facilitated.agentId}` : ""),
  );
});

console.log("Jodoh matchmaking agent online. Waiting for CAP orders…");
