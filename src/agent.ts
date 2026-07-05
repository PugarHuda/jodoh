// CAP provider: turns Jodoh into a paid, callable matchmaking agent.
//
// Lifecycle (CROO Agent Protocol):
//   NegotiationCreated -> acceptNegotiation
//   OrderPaid          -> match need -> (optional) hire best match -> deliverOrder
//
// The matching engine (src/match.ts, src/catalog.ts) is SDK-independent and
// unit-tested. Only this adapter tracks the live SDK — the spots to confirm
// against @croo-network/sdk are marked TODO(sdk).
import "dotenv/config";
import { AgentClient, EventType } from "@croo-network/sdk";
import { fetchCatalog } from "./catalog.js";
import { matchAgents } from "./match.js";
import { facilitate } from "./facilitate.js";
import { renderMarkdown, type JodohResult } from "./report.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

const API_URL = required("CROO_API_URL");
const SELF_ID = process.env.CROO_SERVICE_ID;

const client = new AgentClient(
  { apiUrl: API_URL, wsUrl: required("CROO_WS_URL") },
  required("CROO_SDK_KEY"),
);

// Buyer supplies their need (and optional facilitate flag) in the order payload.
function needFrom(evt: any): { need?: string; facilitate?: boolean } {
  const p = evt?.payload ?? evt?.order?.payload ?? evt?.negotiation?.payload ?? {};
  return { need: p.need ?? p.query ?? p.input, facilitate: !!p.facilitate };
}

// TODO(sdk): confirm how the event stream is obtained.
const stream = (client as any).stream();

stream.on(EventType.NegotiationCreated, async (e: any) => {
  const { need } = needFrom(e);
  if (!need) {
    await client.rejectNegotiation(e.negotiation_id, "missing 'need' in payload");
    return;
  }
  await client.acceptNegotiation(e.negotiation_id);
  console.log(`accepted negotiation ${e.negotiation_id}`);
});

stream.on(EventType.OrderPaid, async (e: any) => {
  const { need, facilitate: doHire } = needFrom(e);
  if (!need) return;
  console.log(`order ${e.order_id} paid — matching: "${need}"`);

  const catalog = await fetchCatalog(API_URL, SELF_ID);
  const matches = matchAgents(need, catalog);
  const result: JodohResult = { need, matches };

  if (doHire && matches.length) {
    const f = await facilitate(client, matches[0], need);
    if (f) result.facilitated = f;
  }

  await client.deliverOrder(e.order_id, {
    deliverable_text: renderMarkdown(result),
    deliverable_json: result,
  });
  console.log(
    `delivered order ${e.order_id} — ${matches.length} matches` +
      (result.facilitated ? `, hired ${result.facilitated.agentId}` : ""),
  );
});

console.log("Jodoh matchmaking agent online. Waiting for CAP orders…");
