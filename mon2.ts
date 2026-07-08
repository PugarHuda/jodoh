import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
const c = new AgentClient({ baseURL: process.env.CROO_API_URL!, wsURL: process.env.CROO_WS_URL!, rpcURL: process.env.BASE_RPC_URL }, process.env.CROO_SDK_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const terminal = (s: string) => ["completed", "evaluating", "expired", "rejected"].includes(s);
let lastPending = -1;
for (let i = 0; i < 24; i++) {
  const os = await c.listOrders({ role: "buyer" }) as any[];
  const pending = os.filter((o) => !terminal(o.status));
  if (pending.length !== lastPending) {
    console.log(`\n[t=${i*30}s] ${os.length} orders, ${pending.length} pending, ${os.filter(o=>o.status==="completed"||o.status==="evaluating").length} completed/evaluating`);
    lastPending = pending.length;
  }
  if (pending.length === 0) {
    console.log("\n=== ALL SETTLED — distinct completed counterparties ===");
    const done = os.filter(o=>o.status==="completed"||o.status==="evaluating");
    const distinct = new Set(done.map(o=>o.providerAgentId?.slice(0,8)));
    console.log(`completed orders: ${done.length}, distinct counterparties: ${distinct.size}`);
    for (const o of done.sort((a,b)=>String(a.createdTime).localeCompare(String(b.createdTime)))) console.log(`  ${o.orderId.slice(0,8)} ${o.status.padEnd(10)} provider=${o.providerAgentId?.slice(0,8)} pay=${(o.payTxHash||"-").slice(0,10)}`);
    const exp = os.filter(o=>o.status==="expired"||o.status==="rejected");
    if (exp.length) console.log(`(expired/rejected: ${exp.map(o=>o.providerAgentId?.slice(0,8)).join(", ")})`);
    break;
  }
  await sleep(30000);
}
