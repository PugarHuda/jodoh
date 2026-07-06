// Two services, one code path. find_match respects the buyer's `facilitate`
// flag; hire_match IS the hire — ordering it means "hire the top match for me",
// so facilitation is forced regardless of the flag. Which service an order is for
// comes from the negotiation/order serviceId.
export function shouldFacilitate(
  requested: boolean,
  serviceId: string | undefined,
  hireServiceId: string | undefined,
): boolean {
  return requested || (!!hireServiceId && serviceId === hireServiceId);
}

// How much Jodoh may front to hire a sub-agent: never more than it earned on the
// order, never more than the absolute per-hire ceiling. So a misconfigured (e.g.
// 10x-low) service price can't make a hire cost more than its revenue and drain
// the wallet. Unknown earnings (undefined/0) fall back to the ceiling.
export function hireBudget(earnedUsdc: number | undefined, ceiling: number): number {
  const earned = earnedUsdc && earnedUsdc > 0 ? earnedUsdc : ceiling;
  return Math.min(ceiling, earned);
}
