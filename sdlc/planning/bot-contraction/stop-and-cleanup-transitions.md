# Stop and cleanup transitions

## Ownership

The root run signal owns only `SIGHUP`, `SIGINT`, and `SIGTERM` received from outside the run. Command execution owns timeout, caller abort, output overflow, child-process errors, process-group evidence, and pipe draining. A subflow child owns its ordinary outcome and machinery faults. Cleanup owns removal failures. One layer reports its own fact and returns a typed result to its caller.

Internal failure never calls the root signal's outside-signal operation. The shared process-group controller may still terminate owned commands during cleanup. Terminating processes does not change the recorded cause by itself.

## Command transitions

| Trigger | Immediate action | Drain | Result |
| --- | --- | --- | --- |
| Direct child exits and both pipes close | Stop the command timeout and retain all bytes through close | None remains | Settle and release the owned process group, then return the direct child's exit and full bounded capture |
| Direct child exits while a descendant still holds a pipe | Keep reading | Reset a one-second quiet window when bytes arrive, inside a fixed five-second post-exit ceiling | At pipe closure, one second without bytes, or the absolute ceiling, settle and release the owned process group. Return the direct child's exit only when capture closed. Otherwise return an incomplete-capture machinery fault with retained bytes |
| Command timeout | Mark timeout, send `SIGTERM` to the owned process group, then `SIGKILL` after the existing 250 ms grace | Use the same one-second quiet window and five-second absolute ceiling after termination begins | Return timeout when capture closes. Return the incomplete-capture fault when it does not |
| Caller abort | Mark abort and terminate the owned group | Same bounded drain | Return abort when capture closes. Return the incomplete-capture fault when it does not. The caller maps a real root signal separately |
| Combined output exceeds 16 MiB | Keep exactly the first 16 MiB, mark overflow, and terminate the owned group | Same bounded drain without accepting more bytes | Return overflow when capture closes. Return the incomplete-capture fault when it does not |
| Spawn, process-group publication, or per-command evidence release fails | Terminate any known owned group and retain the immediate typed error | Same bounded drain when pipes exist | Return a machinery fault. Never infer timeout or signal |

Normal completion starts the drain windows when the direct child exits. Timeout, abort, and overflow start them when forced termination begins because the direct child may never report exit. New bytes reset only the quiet window. The fixed drain can outlive the authored execution deadline by at most the five-second cleanup ceiling. The result carries whether the direct child exited, whether capture closed, and which stop trigger occurred. Callers do not reconstruct those facts from an exit code.

Every command has two independent barriers. The capture barrier ends when both pipes close or the bounded drain detaches them and records incomplete capture. The process barrier ends after Bot proves that command's owned group empty or completes a TERM-then-KILL sweep of that group and records release or the release fault. Normal pipe closure does not prove the group empty. Forced-stop pipe closure does not cancel the KILL timer. The command returns only after both barriers settle. A descendant that escaped into a new session can remain outside Bot's process-group knowledge, but it cannot hold the command pipe or record open past the capture barrier.

Process-group reservation returns a per-command handle. Its settlement operation can inspect, signal, and release only that reservation. It cannot sweep a sibling command's group. Parallel branches and subflows can therefore finish one command without stopping another. The root controller alone owns the bounded sweep of every reservation left after node execution.

The root completes any remaining process-group sweep before it removes shared temporary data. It records a shared cleanup diagnostic next and writes `run_end` last. A successful `run_end` therefore never precedes process or temporary cleanup that can still change the reported result.

## Run and child transitions

| Trigger | Durable evidence | Parent behavior |
| --- | --- | --- |
| Outside signal | Append one `signal` event to each registered writer before its terminal event when writing remains possible | Stop new work, abort active commands, drain owned groups, and return the signal's conventional exit |
| Ordinary subflow outcome | Child record and one parent `subflow_call` row | Return the outcome to the calling agent. Do not stop the parent |
| Subflow lock compromise | Child record remains valid or visibly incomplete. Parent row names a local child fault and its child reference when one exists | Abort that child's harness and active commands through its local abort scope. Do not append a parent `signal` event and do not mutate the root signal |
| Subflow record-writer failure | Child record remains visibly incomplete. Parent row names a local child fault and its child reference | Abort that child's harness and active commands through its local abort scope. Do not cancel siblings or the root run |
| Root record-writer failure | The record ends at the last successful append | Stop active work through the process-group controller. Return a writer fault to the caller. Do not invent `run_end` |
| Stage temporary cleanup fails after settlement | Append `tmp_teardown` when the writer remains available | Preserve the stage outcome and expose the cleanup diagnostic |
| Shared-flow temporary cleanup fails before terminal append | Append `tmp_teardown` when possible | Preserve the settled result. A failure to append the diagnostic follows the root writer-fault path |
| Final process-group cleanup fails | Complete the bounded group sweep before shared temporary removal and `run_end` | When no outside signal exists, retain a fault outcome with the immediate cleanup cause. When an outside signal exists, preserve the signal outcome and add the cleanup failure to its bounded reason. Record shared temporary cleanup next, then append the one terminal `run_end` |

## Child-local cancellation

Each subflow child receives a local abort scope composed one way with the root outside signal. A root abort reaches every child. A child lock compromise, writer fault, or other local machinery failure aborts only that child's harness and active command. The local abort waits for the command's capture and process barriers. It never changes the root signal, never emits `signal`, and never appears to siblings as an outside stop. Durable per-command process evidence and the final root sweep remain the backstop for both scopes.

## Owned-tree removal

Removal first proves ownership outside this helper. The helper never follows a symbolic link. When permissions block a nested owned directory, it inspects the named path and its ancestors inside the owned root to find the directory that blocks removal. It restores owner access there and retries from a state that has changed. It tracks repaired paths during one removal. A repeated permission error for the same unchanged path returns the underlying error. A finite tree therefore terminates with removal or an explicit failure.

The regression creates a read-only parent containing another directory. The test owns the temporary root and gives the cleanup call a hard test deadline. It proves that the helper removes the tree or rejects within the bound. A second case injects a permission failure that cannot be repaired and proves that the helper does not retry forever.

## Existing behavior to preserve

An ordinary descendant can write shortly after the direct shell exits. Bot retains those bytes when the pipes close within the drain window. Process-group evidence remains durable from reservation through the TERM-then-KILL sweep. Cleanup never deletes a path whose caller has not already proved ownership.
