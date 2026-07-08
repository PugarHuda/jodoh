import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
const c = new AgentClient({ baseURL: process.env.CROO_API_URL!, wsURL: process.env.CROO_WS_URL!, rpcURL: process.env.BASE_RPC_URL }, process.env.CROO_SDK_KEY!);
const ID = "02c517ef-c90a-4c98-995a-7000dc983d49";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = "";
for (let i = 0; i < 80; i++) {
  const o: any = await c.getOrder(ID).catch(() => null);
  if (o && o.status !== last) { console.log(`[${i}] status=${o.status} deliver=${(o.deliverTxHash||"-").slice(0,14)} clear=${(o.clearTxHash||"-").slice(0,14)}`); last = o.status; }
  if (o && (o.status === "completed" || o.status === "evaluating")) {
    console.log(`DONE status=${o.status}`);
    console.log(`deliverTx=${o.deliverTxHash}`);
    console.log(`clearTx=${o.clearTxHash}`);
    process.exit(0);
  }
  if (o && (o.status === "rejected" || o.status === "expired")) { console.log(`ENDED status=${o.status}`); process.exit(1); }
  await sleep(30000);
}
console.log("timed out after ~40min still not completed");
