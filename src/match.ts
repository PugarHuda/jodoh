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
    .replace(/[^a-z0-9\s]/g, " ") // hyphens/punctuation -> space, so "smart-contract" matches "smart contract" (same split the live catalog does on skill slugs)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t)); // keep 2-char domain terms (ai, ml, 3d); stopwords catch the noise
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
  topN = 5,
): Match[] {
  const needTokens = new Set(tokens(need));
  if (needTokens.size === 0) return [];

  const scored = catalog.map((agent) => {
    // Reputation comes from an external API — a single malformed record (NaN
    // completion/orders) would poison the shared `max` below and NaN every score.
    // Coerce to 0 so one bad entry can't break the whole ranking.
    const completion = Number.isFinite(agent.completion) ? agent.completion : 0;
    const orders = Number.isFinite(agent.orders) ? agent.orders : 0;
    // Tokenize tags the same way as needs so "smart-contract" -> {smart, contract}.
    const tagSet = new Set(agent.tags.flatMap((t) => tokens(t)));
    const textTokens = new Set(tokens(`${agent.name} ${agent.description}`));

    const tagHits = [...needTokens].filter((t) => tagSet.has(t));
    const textHits = [...needTokens].filter(
      (t) => textTokens.has(t) && !tagSet.has(t),
    );

    // Tags are curated intent signals → weigh them 2x text mentions — BUT only when
    // the name/description actually mentions the tag too. An unsupported tag is
    // keyword-stuffing (an agent can set any tags for free) and earns just the
    // lighter text weight, so it can't farm the #1 slot on tags alone.
    // ponytail: partial defense — a stuffer that also stuffs its description still
    // wins; the real fix is on-chain reputation/verification weighting.
    const supportedTags = tagHits.filter((t) => textTokens.has(t)).length;
    const fit = supportedTags * 2 + (tagHits.length - supportedTags) + textHits.length;

    // Reputation multiplier. Proven agents (completion + volume) scale up to
    // ~1.3; unproven agents get a mild 0.8 discount — enough that a proven,
    // relevant service isn't beaten by an unproven one with only marginally more
    // keyword overlap, but not so much that a clearly better fit can't win.
    const repFactor =
      orders < 10
        ? 0.8
        : 0.8 +
          0.4 * (completion / 100) +
          0.1 * (Math.min(orders, 8000) / 8000);

    const raw = fit * repFactor;

    const reasons: string[] = [];
    if (tagHits.length) reasons.push(`matches tags: ${tagHits.join(", ")}`);
    if (textHits.length) reasons.push(`mentions: ${textHits.join(", ")}`);
    reasons.push(
      `${completion}% completion over ${orders.toLocaleString()} orders`,
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
