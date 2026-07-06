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
