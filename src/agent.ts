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
import { AgentClient, EventType } from "@croo-network/sdk";
import { createOrderHandler } from "./handler.js";
import { safeLogger, installConsoleScrub } from "./log.js";

// Scrub the SDK key out of ALL console output (the app's own error logs too, not
// just the SDK logger) before anything logs.
installConsoleScrub();

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

// The order-handling core (matching, facilitation, delivery, reconcile) lives in
// handler.ts so it's unit-testable with a mock client. This file only wires it to
// the live WS + env.
const { handlePaidOrder, handleNegotiation, reconcile } = createOrderHandler(client, {
  selfAgentId: SELF_AGENT_ID,
  hireId: HIRE_ID,
  findServiceId: process.env.CROO_SERVICE_ID,
});

const stream = await client.connectWebSocket();

// The SDK stops reconnecting on a terminal WS death (duplicate-key 1008 policy
// violation); the process would otherwise stay alive but DEAF to new orders while
// reconcile keeps logging, so the keepalive supervisor never restarts it. Exit on
// permanent WS death so the supervisor relaunches. ponytail: 30s poll.
setInterval(() => {
  const e = stream.err?.();
  if (e) {
    console.error("websocket permanently down — exiting so the supervisor restarts:", e);
    process.exit(1);
  }
}, 30_000);

stream.on(EventType.NegotiationCreated, async (e) => {
  await handleNegotiation(e.negotiation_id!);
});

stream.on(EventType.OrderPaid, async (e) => {
  try {
    await handlePaidOrder(e.order_id!);
  } catch (err) {
    console.error("orderPaid handler error:", err);
  }
});

console.log("Jodoh matchmaking agent online. Waiting for CAP orders…");
// Startup health line: makes a misconfig (e.g. facilitation silently disabled)
// discoverable instead of a lone warn scrolled past days ago.
console.log(
  `config: agentId=${SELF_AGENT_ID ?? "(unset!)"} find=${process.env.CROO_SERVICE_ID ?? "?"} ` +
    `hire=${HIRE_ID ?? "(unset)"} facilitation=${SELF_AGENT_ID ? "ENABLED" : "DISABLED (set CROO_AGENT_ID)"}`,
);

// Catch anything paid while we weren't listening, then keep sweeping.
await reconcile();
setInterval(reconcile, 60_000);
