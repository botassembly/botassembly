---
base: 87bbf1564a15cdb2f39b8ad77012e35bf959a894
head: 4088a7f1e8db5052bca443fd4f42658286ada7d1
---

# Make piped requests wait for clean end-of-file

Bot now reads piped request data asynchronously through clean end-of-file. Delayed chunks keep their exact bytes, including NUL and invalid UTF-8. A clean empty stream remains no request. A stream failure rejects the read and creates no run. TTY input, an explicit request argument, and a task file still bypass stdin.

Independent design review rejected two earlier designs. The first design left the empty-stream rule, timing proof, error behavior, and cleanup vague. The second design tried to use an open directory as file descriptor zero, but Node treats that process input as clean end-of-file. The accepted design uses an internal stream seam for real `EISDIR` and controlled partial-failure tests. A child process publishes a ready marker before the parent sends delayed bytes. Ten runs against the old reader failed with `EAGAIN`. Ten runs against the new reader passed.

Sol Medium implemented the level-3 ticket. Independent Sol Medium code review accepted the runtime behavior with no blocking findings. The primary complete check found one incorrect size-decision field label that the reviewer missed. The label was corrected without changing the decision. The final local `make check` passed with 81 repository tests, 1,559 runtime tests, 143 conformance cases, all static checks, coverage thresholds, and the exact source ratchet. GitHub Actions runtime run `34542037657` passed on commit `4088a7f`.

## Size decision

- Starting production size: 16549 nonblank lines
- Ending production size: 16580 nonblank lines
- Simpler approach tried: use Node's built-in asynchronous stream consumer or async iteration.
- Why insufficient alternatives were rejected: both alternatives left one `end` listener and one `error` listener on a successful stream under Node 22.22.3. The ticket requires the consumer to leave no listener behind.
- Production code deleted: the synchronous file-descriptor reader was replaced, but the replacement needs one small internal module.
- Accepted cost: 31 nonblank production lines for byte collection, clean end-of-file handling, error rejection, and explicit listener cleanup.
