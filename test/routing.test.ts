import assert from "node:assert/strict";
import { shouldFacilitate } from "../src/routing.js";

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

console.log("PASS  service routing: hire_match forces facilitation, find_match respects the flag.");
