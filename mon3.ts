import "dotenv/config";
import { AgentClient } from "@croo-network/sdk";
const c = new AgentClient({ baseURL: process.env.CROO_API_URL!, wsURL: process.env.CROO_WS_URL!, rpcURL: process.env.BASE_RPC_URL }, process.env.CROO_SDK_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const terminal = (s: string) => ["completed","evaluating","expired","rejected"].includes(s);
await sleep(60000); // let them negotiate+pay first
for (let i = 0; i < 20; i++) {
  const os = await c.listOrders({ role: "buyer" }) as any[];
  const pending = os.filter((o) => !terminal(o.status));
  if (pending.length === 0) {
    const done = os.filter(o=>o.status==="completed"||o.status==="evaluating");
    const distinct = new Set(done.map(o=>o.providerAgentId?.slice(0,8)));
    console.log(`SETTLED: ${os.length} orders total, ${done.length} completed, ${distinct.size} distinct counterparties`);
    console.log(`counterparties: ${[...distinct].join(", ")}`);
    const exp = os.filter(o=>o.status==="expired");
    console.log(`expired: ${exp.length}`);
    break;
  }
  console.log(`[${i}] ${os.length} orders, ${pending.length} pending`);
  await sleep(30000);
}
