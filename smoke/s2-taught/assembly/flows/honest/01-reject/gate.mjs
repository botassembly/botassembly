#!/usr/bin/env node
// Failure is honest: this gate rejects every output, so the stage spends its
// retries (there are none) and the run ends 1/exhausted with the reason said
// out loud rather than swallowed.
console.log("This gate rejects every output it is given. Nothing can satisfy it.");
process.exit(1);
