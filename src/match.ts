import type { AgentEntry } from "./catalog.js";

export interface Match {
  agent: AgentEntry;
  score: number; // 0-100, relative fit
  reasons: string[];
}

// Small stopword set so common words don't create noise matches.
const STOP = new Set([
  "the", "a", "an", "for", "and", "or", "to", "of", "my", "me", "i", "need",
  "want", "with", "on", "in", "is", "are", "please", "help", "can", "you",
  "that", "this", "it", "get", "find", "some", "any",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Rank catalog agents against a plain-English need.
 * Fit = keyword/tag overlap; then weighted by reputation (completion + orders)
 * so a well-matched-but-unproven agent doesn't beat a well-matched-and-trusted
 * one. Deterministic — same inputs, same ranking.
 *
 * ponytail: keyword + reputation ranking; swap for embeddings only if match
 * quality measurably falls short.
 */
export function matchAgents(
  need: string,
  catalog: AgentEntry[],
  topN = 3,
): Match[] {
  const needTokens = new Set(tokens(need));
  if (needTokens.size === 0) return [];

  const scored = catalog.map((agent) => {
    const tagSet = new Set(agent.tags.map((t) => t.toLowerCase()));
    const textTokens = new Set(tokens(`${agent.name} ${agent.description}`));

    const tagHits = [...needTokens].filter((t) => tagSet.has(t));
    const textHits = [...needTokens].filter(
      (t) => textTokens.has(t) && !tagSet.has(t),
    );

    // Tags are curated intent signals → weigh them 2x text mentions.
    const fit = tagHits.length * 2 + textHits.length;

    // Reputation multiplier. Proven agents (completion + volume) scale up to
    // ~1.3; unproven agents get a mild 0.8 discount — enough that a proven,
    // relevant service isn't beaten by an unproven one with only marginally more
    // keyword overlap, but not so much that a clearly better fit can't win.
    const repFactor =
      agent.orders < 10
        ? 0.8
        : 0.8 +
          0.4 * (agent.completion / 100) +
          0.1 * (Math.min(agent.orders, 8000) / 8000);

    const raw = fit * repFactor;

    const reasons: string[] = [];
    if (tagHits.length) reasons.push(`matches tags: ${tagHits.join(", ")}`);
    if (textHits.length) reasons.push(`mentions: ${textHits.join(", ")}`);
    reasons.push(
      `${agent.completion}% completion over ${agent.orders.toLocaleString()} orders`,
    );

    return { agent, fit, raw, reasons };
  });

  const relevant = scored.filter((s) => s.fit > 0);
  if (relevant.length === 0) return [];

  const max = Math.max(...relevant.map((s) => s.raw));
  return relevant
    .sort((a, b) => b.raw - a.raw)
    .slice(0, topN)
    .map((s) => ({
      agent: s.agent,
      score: Math.round((100 * s.raw) / max),
      reasons: s.reasons,
    }));
}
