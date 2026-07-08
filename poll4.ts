import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
const c = new AgentClient({ baseURL: process.env.CROO_API_URL!, wsURL: process.env.CROO_WS_URL!, rpcURL: process.env.BASE_RPC_URL }, process.env.CROO_SDK_KEY!);
const ID = "a29cf838";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// find full order id
const os = await c.listOrders({ role: "buyer" }) as any[];
const full = os.find((o) => o.orderId.startsWith(ID))?.orderId;
if (!full) { console.log("order not found"); process.exit(1); }
let last = "";
for (let i = 0; i < 80; i++) {
  const o: any = await c.getOrder(full).catch(() => null);
  if (o && o.status !== last) { console.log(`[${i}] ${o.status} deliver=${(o.deliverTxHash||"-").slice(0,12)} clear=${(o.clearTxHash||"-").slice(0,12)}`); last = o.status; }
  if (o && (o.status === "completed" || o.status === "evaluating")) { console.log(`DONE ${o.status}\ndeliverTx=${o.deliverTxHash}\nclearTx=${o.clearTxHash}`); process.exit(0); }
  if (o && (o.status === "rejected" || o.status === "expired")) { console.log(`ENDED ${o.status}`); process.exit(2); }
  await sleep(30000);
}
console.log("timed out ~40min");
