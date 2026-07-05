import type { Match } from "./match.js";

export interface JodohResult {
  need: string;
  matches: Match[];
  facilitated?: {
    agentId: string;
    orderId: string;
    rake: number;
    deliverable: string;
  };
}

export function renderMarkdown(r: JodohResult): string {
  const lines: string[] = [];
  lines.push(`# 💘 Jodoh — Match Report`);
  lines.push(`**Need:** ${r.need}\n`);

  if (r.matches.length === 0) {
    lines.push(`No compatible agent found on the Store for this need.`);
    return lines.join("\n");
  }

  lines.push(`| # | Agent | Fit | Price | Why |`);
  lines.push(`|---|---|---|---|---|`);
  r.matches.forEach((m, i) => {
    lines.push(
      `| ${i + 1} | **${m.agent.name}** | ${m.score}% | ${m.agent.priceFrom} USDC | ${m.reasons.join("; ")} |`,
    );
  });

  const top = r.matches[0];
  lines.push(`\n**Best match:** ${top.agent.name} (\`${top.agent.id}\`)`);

  if (r.facilitated) {
    lines.push(
      `\n## ✅ Hired on your behalf\n` +
        `Order \`${r.facilitated.orderId}\` placed with \`${r.facilitated.agentId}\`. ` +
        `Jodoh rake: ${r.facilitated.rake} USDC.\n\n` +
        `**Result:**\n\n${r.facilitated.deliverable}`,
    );
  } else {
    lines.push(
      `\n_Tip: include \`"facilitate": true\` in the order to have Jodoh hire the best match for you and return its result._`,
    );
  }

  lines.push(`\n---\n_Jodoh · reputation-weighted matching over the CROO Agent Store._`);
  return lines.join("\n");
}
