import assert from "node:assert/strict";
import { shouldFacilitate, hireBudget } from "../src/routing.js";

const FIND = "svc-find";
const HIRE = "svc-hire";

// find_match: honor the buyer's flag.
assert.equal(shouldFacilitate(false, FIND, HIRE), false, "find_match without flag = discovery only");
assert.equal(shouldFacilitate(true, FIND, HIRE), true, "find_match with flag = facilitate");

// hire_match: always facilitate, even if the buyer omits the flag.
assert.equal(shouldFacilitate(false, HIRE, HIRE), true, "hire_match forces facilitation");
assert.equal(shouldFacilitate(true, HIRE, HIRE), true, "hire_match stays on with flag");

// no hire service configured: never force.
assert.equal(shouldFacilitate(false, HIRE, undefined), false, "unset hire id can't force facilitation");
assert.equal(shouldFacilitate(false, undefined, HIRE), false, "unknown serviceId doesn't force");

// hire budget: never front more than earned, never over the ceiling.
assert.equal(hireBudget(0.025, 0.25), 0.025, "underpriced order caps the hire at what it earned");
assert.equal(hireBudget(0.1, 0.25), 0.1, "earned < ceiling → bounded by earnings");
assert.equal(hireBudget(1, 0.25), 0.25, "earned > ceiling → bounded by the ceiling");
assert.equal(hireBudget(undefined, 0.25), 0.25, "unknown earnings fall back to the ceiling");
assert.equal(hireBudget(0, 0.25), 0.25, "zero earnings treated as unknown");

console.log("PASS  service routing: hire_match forces facilitation, find_match respects the flag; hire budget bounded by earnings.");
