# Provider error reports reach stderr and the record unscrubbed

Observed 2026-09-14 during independent code review of ticket 0283 at commit 9872083 on `ticket/0283`.

`bot/src/credentials.ts:190-196` embeds a provider's error report verbatim in the run-time model failure message. The report is bounded at 2,048 bytes and receives no recognized-credential scrubbing. A provider that echoes a credential in its error body would place that value on stderr and in the run record. The behavior predates ticket 0283; that ticket only moved the report into a longer sentence.

ADR 0030 assigns secret-safe diagnostics to the model-runtime boundary. No occurrence of a provider echoing a credential has been observed. The lever is to pass the report through the existing recognized-credential scrubbing before it enters the message, with a test that plants a synthetic credential in a fake provider's error body.

Disposition belongs to the release ticket: confirm or close with evidence before qualifying the release candidate.
