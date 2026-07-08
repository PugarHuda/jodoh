import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
const c = new AgentClient({ baseURL: process.env.CROO_API_URL!, wsURL: process.env.CROO_WS_URL!, rpcURL: process.env.BASE_RPC_URL }, process.env.CROO_SDK_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const terminal = (s: string) => ["completed", "evaluating", "expired", "rejected"].includes(s);
for (let i = 0; i < 24; i++) { // ~12 min
  const os = await c.listOrders({ role: "buyer" }) as any[];
  const pending = os.filter((o) => !terminal(o.status));
  if (i % 2 === 0 || pending.length === 0) {
    console.log(`\n[t=${i*30}s] ${os.length} orders, ${pending.length} pending`);
    for (const o of os.sort((a,b)=>String(a.createdTime).localeCompare(String(b.createdTime)))) console.log(`  ${o.orderId.slice(0,8)} ${o.status.padEnd(11)} provider=${o.providerAgentId?.slice(0,8)}`);
  }
  if (pending.length === 0) { console.log("ALL SETTLED"); break; }
  await sleep(30000);
}
